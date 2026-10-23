/**
 * Shared notification → order navigation for inbox taps and FCM/Notifee opens.
 * Queues until auth + navigation are ready; ignores stale async after logout/switch.
 */

import { Alert } from 'react-native';
import {
  isCancelledBackendStatus,
  isLiveRiderActiveStatus,
} from '../api/mappers/orderMapper';
import { AvailableOrder } from '../data/orders';
import { ActiveDeliveryJob } from '../delivery/types';
import * as ordersRepository from '../repositories/ordersRepository';
import type { RestoreActiveDeliveriesResult } from '../delivery/restoreResult';
import {
  captureAuthSession,
  isAuthSessionCurrent,
  type AuthSessionSnapshot,
} from '../utils/authSession';
import { navigate, navigationRef } from './RootNavigation';

export type NotificationNavPayload = {
  orderId?: string | null;
  assignedOrderId?: number | string | null;
  notificationId?: string | null;
  category?: string | null;
  event?: string | null;
  screen?: string | null;
};

export type NotificationOrderNavDeps = {
  getSessionUserId: () => string | null;
  markNotificationRead: (id: string) => void;
  selectActiveJob: (jobId: string) => void;
  getActiveJobs: () => ActiveDeliveryJob[];
  /** Authoritative restore — ok false means refresh failed (jobs may be stale cache). */
  restoreActiveDeliveries: (opts?: {
    suppressCancelAlert?: boolean;
  }) => Promise<RestoreActiveDeliveriesResult>;
};

let deps: NotificationOrderNavDeps | null = null;
let pending: NotificationNavPayload | null = null;
let sessionReady = false;
let inFlightKey: string | null = null;
let lastCompletedKey: string | null = null;
let lastCompletedAt = 0;

const DEDUPE_MS = 2500;

function parseAssignedOrderId(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function payloadKey(payload: NotificationNavPayload): string {
  const assigned = parseAssignedOrderId(payload.assignedOrderId);
  const orderId = (payload.orderId ?? '').trim();
  const notif = (payload.notificationId ?? '').trim();
  if (notif) return `n:${notif}`;
  if (assigned != null) return `a:${assigned}`;
  if (orderId) return `o:${orderId}`;
  return `c:${String(payload.category || payload.screen || 'misc')}`;
}

function isDuplicate(key: string): boolean {
  if (inFlightKey === key) return true;
  if (
    lastCompletedKey === key &&
    Date.now() - lastCompletedAt < DEDUPE_MS
  ) {
    return true;
  }
  return false;
}

function markCompleted(key: string): void {
  lastCompletedKey = key;
  lastCompletedAt = Date.now();
  if (inFlightKey === key) inFlightKey = null;
}

function goNotifications(): void {
  if (!navigationRef.isReady()) return;
  navigate('MainDrawer', { screen: 'Notifications' });
}

function goActiveDelivery(): void {
  navigate('MainDrawer', { screen: 'ActiveDelivery' });
}

function goOrderDetails(orderId: string, backendId?: number): void {
  navigate('MainDrawer', {
    screen: 'OrderDetails',
    params: { orderId, backendId },
  });
}

function goHistory(): void {
  navigate('MainDrawer', { screen: 'RouteHistory' });
}

function findJobByBackendId(
  jobs: ActiveDeliveryJob[],
  assignedOrderId: number,
): ActiveDeliveryJob | undefined {
  return jobs.find(j => j.backendId === assignedOrderId);
}

function findLocalJob(
  jobs: ActiveDeliveryJob[],
  orderId: string | null,
  assignedOrderId: number | null,
): ActiveDeliveryJob | undefined {
  if (assignedOrderId != null) {
    const byPk = findJobByBackendId(jobs, assignedOrderId);
    if (byPk) return byPk;
  }
  if (!orderId) return undefined;
  const key = orderId.trim().toLowerCase();
  return jobs.find(
    j =>
      j.id.trim().toLowerCase() === key ||
      (j.externalOrderId ?? '').trim().toLowerCase() === key,
  );
}

function matchesOrderRef(
  order: AvailableOrder,
  orderId: string | null,
  assignedOrderId: number | null,
): boolean {
  if (assignedOrderId != null && order.backendId === assignedOrderId) return true;
  if (!orderId) return false;
  const key = orderId.trim().toLowerCase();
  return (
    order.id.trim().toLowerCase() === key ||
    (order.externalOrderId ?? '').trim().toLowerCase() === key ||
    (order.orderNo ?? '').trim().toLowerCase() === key
  );
}

type OpContext = {
  deps: NotificationOrderNavDeps;
  auth: AuthSessionSnapshot;
};

function captureOpContext(): OpContext | null {
  const current = deps;
  if (!current || !sessionReady) return null;
  const auth = captureAuthSession();
  if (!auth) return null;
  if (current.getSessionUserId() !== auth.userId) return null;
  return { deps: current, auth };
}

function opStillValid(ctx: OpContext): boolean {
  if (deps !== ctx.deps) return false;
  return isAuthSessionCurrent(ctx.auth);
}

function showUnavailableWithRetry(
  key: string,
  payload: NotificationNavPayload,
  message: string,
  authAtAlert: AuthSessionSnapshot | null,
): void {
  Alert.alert('Order unavailable', message, [
    {
      text: 'Retry',
      onPress: () => {
        // Ignore taps from dialogs that outlived logout / account switch.
        if (!isAuthSessionCurrent(authAtAlert)) return;
        lastCompletedKey = null;
        void executeOrderNavigation(payload, key);
      },
    },
    { text: 'OK', style: 'cancel' },
  ]);
  markCompleted(key);
}

/**
 * Bind session-scoped callbacks from NotificationHandler (inside authenticated tree).
 * Rebinding while the same session is active must NOT clear pending/in-flight work.
 */
export function bindNotificationOrderNavigation(
  next: NotificationOrderNavDeps | null,
): void {
  if (!next) {
    clearNotificationOrderNavigation();
    return;
  }
  const prevUser = deps?.getSessionUserId() ?? null;
  const nextUser = next.getSessionUserId();

  deps = next;
  sessionReady = !!nextUser;

  // Drop pending when the bound rider changes; auth generation covers logout/re-login.
  if (prevUser && nextUser && prevUser !== nextUser) {
    pending = null;
    inFlightKey = null;
  }

  void flushPendingNotificationNavigation();
}

export function clearNotificationOrderNavigation(): void {
  pending = null;
  inFlightKey = null;
  sessionReady = false;
  deps = null;
}

/** Call when NavigationContainer becomes ready (and on meaningful state changes). */
export function notifyNavigationReady(): void {
  void flushPendingNotificationNavigation();
}

function hasOrderRef(payload: NotificationNavPayload): boolean {
  return (
    !!(payload.orderId ?? '').trim() ||
    parseAssignedOrderId(payload.assignedOrderId) != null
  );
}

function isOrderCategory(payload: NotificationNavPayload): boolean {
  return (
    (payload.category ?? '').toLowerCase() === 'orders' || hasOrderRef(payload)
  );
}

function routeNonOrderOrInbox(
  payload: NotificationNavPayload,
  key: string,
  ctx: OpContext,
): void {
  if (payload.notificationId) {
    ctx.deps.markNotificationRead(payload.notificationId);
  }
  goNotifications();
  markCompleted(key);
}

/** Queue or run navigation from push / inbox. Safe before auth is ready. */
export function handleNotificationNavigation(
  data?: Record<string, unknown> | null,
): void {
  if (!data) return;

  const payload: NotificationNavPayload = {
    orderId:
      data.orderId != null && String(data.orderId).trim()
        ? String(data.orderId).trim()
        : null,
    assignedOrderId: parseAssignedOrderId(
      data.assignedOrderId as string | number | null | undefined,
    ),
    notificationId:
      data.notificationId != null && String(data.notificationId).trim()
        ? String(data.notificationId).trim()
        : null,
    category: data.category != null ? String(data.category) : null,
    event: data.event != null ? String(data.event) : null,
    screen: data.screen != null ? String(data.screen) : null,
  };

  dispatchPayload(payload);
}

function dispatchPayload(payload: NotificationNavPayload): void {
  const key = payloadKey(payload);
  if (isDuplicate(key)) return;

  const ctx = captureOpContext();
  if (!ctx || !navigationRef.isReady()) {
    pending = payload;
    return;
  }

  if (!isOrderCategory(payload) || !hasOrderRef(payload)) {
    routeNonOrderOrInbox(payload, key, ctx);
    return;
  }

  void executeOrderNavigation(payload, key);
}

export async function flushPendingNotificationNavigation(): Promise<void> {
  if (!pending) return;
  const ctx = captureOpContext();
  if (!ctx || !navigationRef.isReady()) return;

  const next = pending;
  pending = null;
  const key = payloadKey(next);
  if (isDuplicate(key)) return;

  if (!isOrderCategory(next) || !hasOrderRef(next)) {
    routeNonOrderOrInbox(next, key, ctx);
    return;
  }

  await executeOrderNavigation(next, key);
}

async function executeOrderNavigation(
  payload: NotificationNavPayload,
  key: string,
): Promise<void> {
  const ctx = captureOpContext();
  if (!ctx) {
    pending = payload;
    return;
  }

  const { deps: opDeps, auth } = ctx;
  inFlightKey = key;

  const stillValid = () =>
    deps === opDeps && isAuthSessionCurrent(auth);

  try {
    if (payload.notificationId) {
      opDeps.markNotificationRead(payload.notificationId);
    }

    const assignedOrderId = parseAssignedOrderId(payload.assignedOrderId);
    const orderId = (payload.orderId ?? '').trim() || null;
    const event = (payload.event ?? '').toLowerCase();

    let order: AvailableOrder | null = null;
    if (assignedOrderId != null) {
      const result = await ordersRepository.fetchOrderById(assignedOrderId);
      if (!stillValid()) return;
      if (result.ok) {
        order = result.data;
      } else if (
        result.error.statusCode === 404 ||
        result.error.code === 'ORDER_NOT_FOUND'
      ) {
        Alert.alert(
          'Order unavailable',
          'This order is no longer available. It may have been accepted by another rider or removed.',
        );
        markCompleted(key);
        return;
      } else {
        showUnavailableWithRetry(
          key,
          payload,
          result.error.message ||
            'Unable to load this order right now. Check your connection and try again.',
          auth,
        );
        return;
      }
    }

    if (!stillValid()) return;

    // Authoritative restore — use returned jobs (do not rely on React state timing).
    const restore = await opDeps.restoreActiveDeliveries({
      suppressCancelAlert: true,
    });
    if (!stillValid()) return;

    if (!restore.ok) {
      showUnavailableWithRetry(
        key,
        payload,
        restore.errorMessage ||
          'Could not refresh your active orders. Check your connection and try again.',
        auth,
      );
      return;
    }

    const restoredJobs = restore.jobs;

    if (event === 'order_cancelled' || (order && isCancelledBackendStatus(order.backendStatus))) {
      Alert.alert(
        'Order cancelled',
        orderId
          ? `Order ${orderId} was cancelled and is no longer active.`
          : 'This order was cancelled and is no longer active.',
      );
      markCompleted(key);
      return;
    }

    const targetBackendId = order?.backendId ?? assignedOrderId;
    const wantsActive =
      !!findLocalJob(restoredJobs, orderId, assignedOrderId) ||
      (order != null && isLiveRiderActiveStatus(order.backendStatus));

    if (wantsActive) {
      // Prefer exact AssignedOrders PK when known — never open a different selected order.
      const job =
        targetBackendId != null
          ? findJobByBackendId(restoredJobs, targetBackendId)
          : findLocalJob(restoredJobs, orderId, assignedOrderId);

      if (job && (targetBackendId == null || job.backendId === targetBackendId)) {
        opDeps.selectActiveJob(job.id);
        goActiveDelivery();
        markCompleted(key);
        return;
      }

      showUnavailableWithRetry(
        key,
        payload,
        'This active order could not be selected after refresh. It may still be syncing — try again.',
        auth,
      );
      return;
    }

    if (order) {
      const status = (order.backendStatus ?? '').trim().toLowerCase();
      if (status === 'completed') {
        Alert.alert(
          'Order completed',
          'This delivery is already completed. You can review it in History.',
          [
            {
              text: 'History',
              onPress: () => {
                if (!isAuthSessionCurrent(auth)) return;
                goHistory();
              },
            },
            { text: 'OK', style: 'cancel' },
          ],
        );
        markCompleted(key);
        return;
      }
      if (status === 'available') {
        goOrderDetails(order.id, order.backendId);
        markCompleted(key);
        return;
      }
      if (status === 'failed') {
        Alert.alert(
          'Order unavailable',
          'This order is marked failed and cannot be opened as an active delivery.',
        );
        markCompleted(key);
        return;
      }
    }

    if (!order && orderId) {
      const available = await ordersRepository.fetchAvailableOrders();
      if (!stillValid()) return;
      if (available.ok) {
        const match = available.data.find(o =>
          matchesOrderRef(o, orderId, assignedOrderId),
        );
        if (match) {
          goOrderDetails(match.id, match.backendId);
          markCompleted(key);
          return;
        }
      }
    }

    if (order) {
      goOrderDetails(order.id, order.backendId);
      markCompleted(key);
      return;
    }

    Alert.alert(
      'Order unavailable',
      'This order could not be found. It may no longer be available for you.',
    );
    markCompleted(key);
  } catch {
    if (stillValid()) {
      Alert.alert(
        'Could not open order',
        'Something went wrong opening this order.',
      );
    }
    markCompleted(key);
  } finally {
    if (inFlightKey === key) inFlightKey = null;
  }
}

/** Inbox row tap — mark read then open (same resolver as push). */
export function openNotificationFromInbox(notification: {
  id: string;
  category: string;
  orderId?: string | null;
  assignedOrderId?: number | null;
}): void {
  handleNotificationNavigation({
    notificationId: notification.id,
    category: notification.category,
    orderId: notification.orderId,
    assignedOrderId: notification.assignedOrderId,
  });
}

/** Test helpers — not for production UI. */
export const __test__ = {
  payloadKey,
  parseAssignedOrderId,
  findJobByBackendId,
  findLocalJob,
  getPending: () => pending,
  resetForTests: () => {
    deps = null;
    pending = null;
    sessionReady = false;
    inFlightKey = null;
    lastCompletedKey = null;
    lastCompletedAt = 0;
  },
};
