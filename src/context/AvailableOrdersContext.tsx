import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import {
  AvailableOrder,
  RejectReason,
} from '../data/orders';
import * as ordersRepository from '../repositories/ordersRepository';
import {
  isUncertainAcceptFailure,
  localJobInsertRecoveryResult,
  reconcileAcceptAfterUncertainty,
} from '../utils/acceptReconciliation';
import { applyAuthoritativeAvailableOrders } from '../utils/availableOrdersSync';
import {
  captureAuthSession,
  isAuthSessionCurrent,
} from '../utils/authSession';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import { useAuth } from '../services/AuthContext';
import { useRiderSession } from './RiderSessionContext';

export const MAX_ACTIVE_ORDERS = 5;

type AcceptResult = { ok: boolean; message?: string; retryable?: boolean };

export type BatchAcceptResult = {
  /** True when at least one order was accepted. */
  ok: boolean;
  succeeded: AvailableOrder[];
  failed: Array<{ order: AvailableOrder; message: string }>;
};

type AcceptOptions = {
  /** Suppress per-order alerts (used by multi-accept). */
  silent?: boolean;
};

type AvailableOrdersContextValue = {
  orders: AvailableOrder[];
  loading: boolean;
  error: string | null;
  accepting: boolean;
  /** List key of the order currently being accepted (for per-card loading UI). */
  acceptingOrderKey: string | null;
  selectedKeys: string[];
  remainingSlots: number;
  getOrderById: (id: string) => AvailableOrder | undefined;
  resolveOrder: (
    id: string,
    backendId?: number,
  ) => Promise<AvailableOrder | undefined>;
  isOrderSelected: (order: AvailableOrder) => boolean;
  toggleOrderSelected: (order: AvailableOrder) => void;
  clearSelection: () => void;
  acceptOrder: (
    order: AvailableOrder,
    options?: AcceptOptions,
  ) => Promise<AcceptResult>;
  acceptSelectedOrders: () => Promise<BatchAcceptResult>;
  rejectOrder: (order: AvailableOrder, reason: RejectReason) => Promise<AcceptResult>;
  refreshOrders: () => Promise<void>;
};

const AvailableOrdersContext =
  createContext<AvailableOrdersContextValue | null>(null);

function shortLabel(order: AvailableOrder): string {
  const no = (order.orderNo ?? '').trim();
  return no || order.id;
}

export function AvailableOrdersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { acceptOrderAsJob, activeJobs, isOnline, restoreActiveDeliveries, selectActiveJob } =
    useRiderSession();
  const { isConnected } = useNetworkConnectivity();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptingOrderKey, setAcceptingOrderKey] = useState<string | null>(
    null,
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const acceptingRef = useRef(false);
  const activeJobsRef = useRef(activeJobs);
  activeJobsRef.current = activeJobs;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const remainingSlots = Math.max(0, MAX_ACTIVE_ORDERS - activeJobs.length);

  // Drop rows that became this rider's active job without waiting for refresh.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    setOrders(prev => applyAuthoritativeAvailableOrders(prev, activeJobs));
  }, [activeJobs]);

  // Prune selection when the offer list changes.
  useEffect(() => {
    const live = new Set(orders.map(o => ordersRepository.orderListKey(o)));
    setSelectedKeys(prev => prev.filter(k => live.has(k)));
  }, [orders]);

  // Clear selection/list UI on logout / account switch (auth generation invalidated separately).
  useEffect(() => {
    acceptingRef.current = false;
    setAccepting(false);
    setAcceptingOrderKey(null);
    setSelectedKeys([]);
    setOrders([]);
    setError(null);
    if (!user?.id) {
      setLoading(false);
    }
  }, [user?.id]);

  const clearSelection = useCallback(() => {
    setSelectedKeys([]);
  }, []);

  const isOrderSelected = useCallback(
    (order: AvailableOrder) =>
      selectedKeys.includes(ordersRepository.orderListKey(order)),
    [selectedKeys],
  );

  const toggleOrderSelected = useCallback(
    (order: AvailableOrder) => {
      if (acceptingRef.current) return;
      const key = ordersRepository.orderListKey(order);
      setSelectedKeys(prev => {
        if (prev.includes(key)) {
          return prev.filter(k => k !== key);
        }
        const slots = Math.max(0, MAX_ACTIVE_ORDERS - activeJobsRef.current.length);
        if (prev.length >= slots) {
          Alert.alert(
            'Order limit',
            slots <= 0
              ? 'You already have 5 active orders. Finish a delivery before selecting more.'
              : `You can select up to ${slots} more order${slots === 1 ? '' : 's'} (5 active max).`,
          );
          return prev;
        }
        return [...prev, key];
      });
    },
    [],
  );

  const getOrderById = useCallback(
    (id: string) => {
      const key = id.trim();
      return orders.find(
        o =>
          o.id === key ||
          o.externalOrderId === key ||
          (o.backendId != null && String(o.backendId) === key),
      );
    },
    [orders],
  );

  const resolveOrder = useCallback(
    async (id: string, backendId?: number) => {
      const session = captureAuthSession();
      if (!session) return undefined;

      const local = getOrderById(id);
      if (local) return local;

      const pk =
        backendId ??
        (/^\d+$/.test(id.trim()) ? Number(id.trim()) : undefined);
      if (pk == null || !Number.isFinite(pk)) return undefined;

      const result = await ordersRepository.fetchOrderById(pk);
      if (!isAuthSessionCurrent(session)) return undefined;
      if (!result.ok) return undefined;
      return result.data;
    },
    [getOrderById],
  );

  const refreshOrders = useCallback(async () => {
    const session = captureAuthSession();
    if (!session) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await ordersRepository.fetchAvailableOrders();
    // Ignore late responses after logout / account switch / re-login.
    if (!isAuthSessionCurrent(session)) return;
    if (!result.ok) {
      setError(result.error.message);
      setOrders([]);
      setLoading(false);
      return;
    }
    // Server Available is authoritative (requeue can return a previously accepted id).
    setOrders(
      applyAuthoritativeAvailableOrders(result.data, activeJobsRef.current),
    );
    setLoading(false);
  }, [user?.id]);

  const acceptOrder = useCallback(
    async (
      order: AvailableOrder,
      options?: AcceptOptions,
    ): Promise<AcceptResult> => {
      const silent = !!options?.silent;
      // Single accept owns the lock. Multi-accept holds it and calls with silent.
      const ownsLock = !silent;
      const session = captureAuthSession();
      const sessionEnded = (): AcceptResult => ({
        ok: false,
        message: 'Session ended.',
        retryable: false,
      });
      const stillCurrent = () => isAuthSessionCurrent(session);

      if (!session) {
        return sessionEnded();
      }
      if (ownsLock && acceptingRef.current) {
        return {
          ok: false,
          message: 'Accept already in progress.',
          retryable: false,
        };
      }

      if (!isConnected) {
        const message =
          'No connection. Connect to the internet to accept orders. Accepts are not queued offline.';
        if (!silent) Alert.alert('No connection', message);
        return { ok: false, message, retryable: false };
      }
      if (!isOnline) {
        const message = 'Go online before accepting orders.';
        if (!silent) Alert.alert('Offline', message);
        return { ok: false, message };
      }
      if (order.backendId == null) {
        const message = 'Order is missing a server id and cannot be accepted.';
        if (!silent) Alert.alert('Accept failed', message);
        return { ok: false, message };
      }

      const alreadyActive = activeJobsRef.current.some(
        j => j.backendId === order.backendId || j.id === order.id,
      );
      if (!alreadyActive && activeJobsRef.current.length >= MAX_ACTIVE_ORDERS) {
        const message = 'You can carry up to 5 active orders at once.';
        if (!silent) Alert.alert('Order limit', message);
        return { ok: false, message };
      }

      const recoverFromLocalJobInsertFailure = async (
        localErr: unknown,
      ): Promise<AcceptResult> => {
        const localMessage =
          localErr instanceof Error ? localErr.message : 'Could not add active job';

        await restoreActiveDeliveries({ suppressCancelAlert: true });
        if (!stillCurrent()) return sessionEnded();

        const [activeResult, availableResult] = await Promise.all([
          ordersRepository.fetchActiveOrders(),
          ordersRepository.fetchAvailableOrders(),
        ]);
        if (!stillCurrent()) return sessionEnded();

        const serverCheckFailed = !activeResult.ok && !availableResult.ok;
        const outcome = reconcileAcceptAfterUncertainty(
          order,
          activeResult.ok ? activeResult.data : [],
          availableResult.ok ? availableResult.data : [],
        );
        const recovery = localJobInsertRecoveryResult(outcome, localMessage, {
          serverCheckFailed,
        });

        if (availableResult.ok) {
          const activeRefs = (activeResult.ok ? activeResult.data : [])
            .filter(o => o.backendId != null)
            .map(o => ({ id: o.id, backendId: o.backendId! }));
          setOrders(
            applyAuthoritativeAvailableOrders(availableResult.data, activeRefs),
          );
        }

        if (recovery.showAsAccepted) {
          selectActiveJob(outcome.kind === 'accepted' ? outcome.order.id : order.id);
          return { ok: true };
        }

        if (!silent) Alert.alert(recovery.alertTitle, recovery.message);
        return {
          ok: false,
          message: recovery.message,
          retryable: recovery.retryable,
        };
      };

      if (ownsLock) {
        acceptingRef.current = true;
        setAccepting(true);
      }
      setAcceptingOrderKey(ordersRepository.orderListKey(order));
      try {
        const result = await ordersRepository.updateOrderStatus(order.backendId, {
          status: 'Accepted',
        });
        if (!stillCurrent()) return sessionEnded();

        if (result.ok) {
          try {
            acceptOrderAsJob({
              ...order,
              backendStatus: 'Accepted',
              acceptedAt: order.acceptedAt || new Date().toISOString(),
            });
          } catch (err) {
            return recoverFromLocalJobInsertFailure(err);
          }

          setOrders(prev =>
            prev.filter(
              o =>
                o.id !== order.id &&
                !(order.backendId != null && o.backendId === order.backendId),
            ),
          );
          setSelectedKeys(prev =>
            prev.filter(k => k !== ordersRepository.orderListKey(order)),
          );
          return { ok: true };
        }

        if (!isUncertainAcceptFailure(result.error)) {
          if (!silent) Alert.alert('Accept failed', result.error.message);
          return { ok: false, message: result.error.message };
        }

        const [activeResult, availableResult] = await Promise.all([
          ordersRepository.fetchActiveOrders(),
          ordersRepository.fetchAvailableOrders(),
        ]);
        if (!stillCurrent()) return sessionEnded();

        if (availableResult.ok) {
          setOrders(
            applyAuthoritativeAvailableOrders(
              availableResult.data,
              activeJobsRef.current,
            ),
          );
        }

        if (!activeResult.ok && !availableResult.ok) {
          const message = `${result.error.message} Could not verify Active or Available after the uncertain accept.`;
          if (!silent) Alert.alert('Accept status unknown', message);
          return { ok: false, message, retryable: false };
        }

        const outcome = reconcileAcceptAfterUncertainty(
          order,
          activeResult.ok ? activeResult.data : [],
          availableResult.ok ? availableResult.data : [],
        );

        if (outcome.kind === 'accepted') {
          try {
            acceptOrderAsJob({
              ...outcome.order,
              backendStatus: outcome.order.backendStatus || 'Accepted',
              acceptedAt:
                outcome.order.acceptedAt || new Date().toISOString(),
            });
          } catch (err) {
            return recoverFromLocalJobInsertFailure(err);
          }
          if (availableResult.ok && outcome.order.backendId != null) {
            setOrders(
              applyAuthoritativeAvailableOrders(availableResult.data, [
                ...activeJobsRef.current,
                {
                  id: outcome.order.id,
                  backendId: outcome.order.backendId,
                },
              ]),
            );
          }
          setSelectedKeys(prev =>
            prev.filter(k => k !== ordersRepository.orderListKey(order)),
          );
          return { ok: true };
        }

        if (outcome.kind === 'available') {
          const message =
            'Accept did not complete. The order is still Available — you can try again.';
          if (!silent) Alert.alert('Accept not confirmed', message);
          return { ok: false, message, retryable: true };
        }

        if (outcome.kind === 'other') {
          if (!silent) Alert.alert('Accept failed', outcome.message);
          return { ok: false, message: outcome.message, retryable: false };
        }

        const message = `${result.error.message} ${outcome.message}`;
        if (!silent) Alert.alert('Accept status unknown', message);
        return { ok: false, message, retryable: false };
      } finally {
        if (ownsLock) {
          // Only clear the lock if this session still owns accepting UI.
          if (stillCurrent()) {
            acceptingRef.current = false;
            setAccepting(false);
          }
        }
        if (stillCurrent()) {
          setAcceptingOrderKey(null);
        }
      }
    },
    [
      acceptOrderAsJob,
      isOnline,
      isConnected,
      restoreActiveDeliveries,
      selectActiveJob,
    ],
  );

  const acceptSelectedOrders = useCallback(async (): Promise<BatchAcceptResult> => {
    const empty: BatchAcceptResult = { ok: false, succeeded: [], failed: [] };
    const session = captureAuthSession();
    const batchStillCurrent = () => isAuthSessionCurrent(session);

    if (!session) {
      return empty;
    }
    if (acceptingRef.current) {
      return empty;
    }
    if (!isConnected) {
      Alert.alert(
        'No connection',
        'Connect to the internet to accept orders. Accepts are not queued offline.',
      );
      return empty;
    }
    if (!isOnline) {
      Alert.alert('Offline', 'Go online before accepting orders.');
      return empty;
    }

    const slots = Math.max(0, MAX_ACTIVE_ORDERS - activeJobsRef.current.length);
    if (slots <= 0) {
      Alert.alert(
        'Order limit',
        'You already have 5 active orders. Finish a delivery before accepting more.',
      );
      return empty;
    }

    const selected = selectedKeys
      .map(key =>
        ordersRef.current.find(o => ordersRepository.orderListKey(o) === key),
      )
      .filter((o): o is AvailableOrder => !!o && o.backendId != null);

    if (selected.length === 0) {
      return empty;
    }

    const toAccept = selected.slice(0, slots);
    const skippedOverCap = selected.slice(slots);

    acceptingRef.current = true;
    setAccepting(true);

    const succeeded: AvailableOrder[] = [];
    const failed: Array<{ order: AvailableOrder; message: string }> = [];
    let abortedBySession = false;

    try {
      for (const order of toAccept) {
        if (!batchStillCurrent()) {
          abortedBySession = true;
          break;
        }

        // Stop early if capacity filled by concurrent accepts elsewhere.
        const liveSlots =
          MAX_ACTIVE_ORDERS - activeJobsRef.current.length;
        const already = activeJobsRef.current.some(
          j => j.backendId === order.backendId || j.id === order.id,
        );
        if (!already && liveSlots <= 0) {
          failed.push({
            order,
            message: 'Active order limit reached.',
          });
          continue;
        }

        const result = await acceptOrder(order, { silent: true });
        if (!batchStillCurrent()) {
          abortedBySession = true;
          break;
        }

        if (result.ok) {
          succeeded.push(order);
        } else {
          failed.push({
            order,
            message: result.message || 'Accept failed',
          });
        }
      }

      if (abortedBySession) {
        // Do not apply remaining results, alerts, or list updates for a stale session.
        return empty;
      }

      for (const order of skippedOverCap) {
        failed.push({
          order,
          message: 'Skipped — would exceed 5 active orders.',
        });
      }

      // Drop successful keys; keep failed keys so rider can retry.
      const okKeys = new Set(
        succeeded.map(o => ordersRepository.orderListKey(o)),
      );
      setSelectedKeys(prev => prev.filter(k => !okKeys.has(k)));

      await refreshOrders();
      if (!batchStillCurrent()) return empty;

      await restoreActiveDeliveries({ suppressCancelAlert: true });
      if (!batchStillCurrent()) return empty;

      if (succeeded.length > 0 && failed.length === 0) {
        Alert.alert(
          'Orders accepted',
          succeeded.length === 1
            ? `Accepted ${shortLabel(succeeded[0])}.`
            : `Accepted ${succeeded.length} orders.`,
        );
      } else if (succeeded.length > 0 && failed.length > 0) {
        const failLines = failed
          .slice(0, 5)
          .map(f => `• ${shortLabel(f.order)} — ${f.message}`)
          .join('\n');
        Alert.alert(
          'Partial accept',
          `Accepted ${succeeded.length}. Failed ${failed.length}:\n${failLines}`,
        );
      } else if (failed.length > 0) {
        const failLines = failed
          .slice(0, 5)
          .map(f => `• ${shortLabel(f.order)} — ${f.message}`)
          .join('\n');
        Alert.alert('Accept failed', failLines);
      }

      return {
        ok: succeeded.length > 0,
        succeeded,
        failed,
      };
    } finally {
      if (batchStillCurrent()) {
        acceptingRef.current = false;
        setAccepting(false);
        setAcceptingOrderKey(null);
      }
    }
  }, [
    acceptOrder,
    isConnected,
    isOnline,
    refreshOrders,
    restoreActiveDeliveries,
    selectedKeys,
  ]);

  const rejectOrder = useCallback(
    async (
      order: AvailableOrder,
      reason: RejectReason,
    ): Promise<AcceptResult> => {
      const session = captureAuthSession();
      if (!session) {
        return { ok: false, message: 'Session ended.', retryable: false };
      }
      if (!isConnected) {
        const message =
          'No connection. Connect to the internet to reject orders. Rejects are not queued offline.';
        Alert.alert('No connection', message);
        return { ok: false, message, retryable: false };
      }
      if (order.backendId == null) {
        const message = 'Order is missing a server id and cannot be rejected.';
        Alert.alert('Reject failed', message);
        return { ok: false, message };
      }

      const result = await ordersRepository.rejectOrder(order.backendId, {
        reason,
      });
      if (!isAuthSessionCurrent(session)) {
        return { ok: false, message: 'Session ended.', retryable: false };
      }
      if (!result.ok) {
        Alert.alert('Reject failed', result.error.message);
        return { ok: false, message: result.error.message };
      }

      // Optimistic hide. Backend omits this rider's rejects until requeue clears them.
      setOrders(prev =>
        prev.filter(
          o =>
            o.id !== order.id &&
            !(order.backendId != null && o.backendId === order.backendId),
        ),
      );
      setSelectedKeys(prev =>
        prev.filter(k => k !== ordersRepository.orderListKey(order)),
      );
      return { ok: true };
    },
    [isConnected],
  );

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const value = useMemo(
    () => ({
      orders,
      loading,
      error,
      accepting,
      acceptingOrderKey,
      selectedKeys,
      remainingSlots,
      getOrderById,
      resolveOrder,
      isOrderSelected,
      toggleOrderSelected,
      clearSelection,
      acceptOrder,
      acceptSelectedOrders,
      rejectOrder,
      refreshOrders,
    }),
    [
      orders,
      loading,
      error,
      accepting,
      acceptingOrderKey,
      selectedKeys,
      remainingSlots,
      getOrderById,
      resolveOrder,
      isOrderSelected,
      toggleOrderSelected,
      clearSelection,
      acceptOrder,
      acceptSelectedOrders,
      rejectOrder,
      refreshOrders,
    ],
  );

  return (
    <AvailableOrdersContext.Provider value={value}>
      {children}
    </AvailableOrdersContext.Provider>
  );
}

export function useAvailableOrders() {
  const ctx = useContext(AvailableOrdersContext);
  if (!ctx) {
    throw new Error(
      'useAvailableOrders must be used within AvailableOrdersProvider',
    );
  }
  return ctx;
}
