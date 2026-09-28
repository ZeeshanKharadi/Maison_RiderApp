import { AvailableOrder } from '../data/orders';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import {
  ApiAvailableOrder,
  ApiRiderPerformance,
  mapApiOrderToAvailable,
} from '../api/mappers/orderMapper';
import { ApiResult, fail, ok } from './types';

export type OrderStatusPayload = {
  status:
    | 'Accepted'
    | 'NavigatingToPickup'
    | 'ArrivedAtPickup'
    | 'InProgress'
    | 'OnTheWay'
    | 'ArrivedAtCustomer'
    | 'Delivered'
    | 'Completed';
  cashCollected?: number;
  cashCollectedReason?: string;
  requestId?: string;
};

export type RejectOrderPayload = {
  reason?: string;
  requestId?: string;
};

export type DeliveryIssueReason =
  | 'CustomerUnreachable'
  | 'CustomerRefused'
  | 'AddressIssue'
  | 'Other';

export type ReportDeliveryIssuePayload = {
  reason: DeliveryIssueReason;
  note?: string;
  requestId?: string;
};

export type DeliveryIssueReport = {
  id: number;
  assignedOrderId: number;
  orderId: string;
  orderNo: string;
  storeId: string;
  reasonCode: DeliveryIssueReason | string;
  reasonLabel: string;
  note?: string | null;
  riderUserId: string;
  requestId?: string | null;
  createdAt: string;
  orderStatus: string;
  status?: string;
  statusLabel?: string;
  acknowledgedAt?: string | null;
  closedAt?: string | null;
};

export type RiderPerformance = {
  completedCount: number;
  avgDurationMinutes: number | null;
  onlineHours: number;
  codCollected: number;
  codOutstanding: number;
  from?: string | null;
  to?: string | null;
};

/** Simple RFC4122-ish uuid v4 for idempotency keys. */
export function createRequestId(): string {
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return hex.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** One card per external order id — keep the newest backend row. */
function dedupeAvailableOrders(orders: AvailableOrder[]): AvailableOrder[] {
  const byRef = new Map<string, AvailableOrder>();

  for (const order of orders) {
    const ref = (order.externalOrderId || order.id).trim().toLowerCase();
    const existing = byRef.get(ref);
    if (!existing) {
      byRef.set(ref, order);
      continue;
    }

    const existingTime = new Date(existing.postedAt).getTime();
    const nextTime = new Date(order.postedAt).getTime();
    const existingPk = existing.backendId ?? 0;
    const nextPk = order.backendId ?? 0;

    if (nextPk > existingPk || nextTime > existingTime) {
      byRef.set(ref, order);
    }
  }

  return [...byRef.values()].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
}

function mapNetworkError(err: unknown, fallback: string): ApiResult<never> {
  if (err instanceof HttpError) {
    return fail(err.code, err.message);
  }
  return fail(
    'NETWORK',
    err instanceof Error ? err.message : fallback,
  );
}

/**
 * Loads available offers created only via AssignOrder (backend Status = Available).
 */
export async function fetchAvailableOrders(): Promise<
  ApiResult<AvailableOrder[]>
> {
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder[]>(
      API_PATHS.availableOrders,
      { auth: true },
    );

    if (!envelope.status) {
      return fail('ORDERS_FAILED', envelope.message || 'Failed to load orders');
    }

    const rows = Array.isArray(envelope.Data) ? envelope.Data : [];
    return ok(dedupeAvailableOrders(rows.map(mapApiOrderToAvailable)));
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach orders API');
  }
}

export async function fetchActiveOrders(): Promise<ApiResult<AvailableOrder[]>> {
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder[]>(
      API_PATHS.activeOrders,
      { auth: true },
    );

    if (!envelope.status) {
      return fail(
        'ACTIVE_ORDERS_FAILED',
        envelope.message || 'Failed to load active orders',
      );
    }

    const rows = Array.isArray(envelope.Data) ? envelope.Data : [];
    return ok(rows.map(mapApiOrderToAvailable));
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach active orders API');
  }
}

/** Unacknowledged cancellations for this rider (server inbox; no time window). */
export async function fetchRecentCancellations(): Promise<
  ApiResult<AvailableOrder[]>
> {
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder[]>(
      API_PATHS.recentCancellations,
      { auth: true },
    );

    if (!envelope.status) {
      return fail(
        'RECENT_CANCELLATIONS_FAILED',
        envelope.message || 'Failed to load cancellations',
      );
    }

    const rows = Array.isArray(envelope.Data) ? envelope.Data : [];
    return ok(rows.map(mapApiOrderToAvailable));
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach cancellations API');
  }
}

/** Server durable ack — marks cancel-inbox rows read for this rider. */
export async function acknowledgeCancellations(
  assignedOrderIds: number[],
): Promise<ApiResult<void>> {
  const ids = assignedOrderIds.filter(id => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return ok(undefined);
  try {
    const envelope = await apiEnvelope<string>(API_PATHS.acknowledgeCancellations, {
      method: 'POST',
      auth: true,
      body: { assignedOrderIds: ids },
    });
    if (!envelope.status) {
      return fail(
        'ACK_CANCELLATIONS_FAILED',
        envelope.message || 'Failed to acknowledge cancellations',
      );
    }
    return ok(undefined);
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach acknowledge cancellations API');
  }
}

export async function fetchOrderHistory(
  page = 1,
  pageSize = 20,
): Promise<ApiResult<AvailableOrder[]>> {
  try {
    const qs = `?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`;
    const envelope = await apiEnvelope<ApiAvailableOrder[]>(
      `${API_PATHS.orderHistory}${qs}`,
      { auth: true },
    );

    if (!envelope.status) {
      return fail(
        'HISTORY_FAILED',
        envelope.message || 'Failed to load order history',
      );
    }

    const rows = Array.isArray(envelope.Data) ? envelope.Data : [];
    return ok(rows.map(mapApiOrderToAvailable));
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach order history API');
  }
}

export async function fetchPerformance(opts?: {
  from?: Date | string | null;
  to?: Date | string | null;
}): Promise<ApiResult<RiderPerformance>> {
  try {
    const qs = new URLSearchParams();
    if (opts?.from) {
      const from =
        opts.from instanceof Date ? opts.from.toISOString() : String(opts.from);
      qs.set('from', from);
    }
    if (opts?.to) {
      const to =
        opts.to instanceof Date ? opts.to.toISOString() : String(opts.to);
      qs.set('to', to);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const envelope = await apiEnvelope<ApiRiderPerformance>(
      `${API_PATHS.orderPerformance}${suffix}`,
      { auth: true },
    );

    if (!envelope.status || !envelope.Data) {
      return fail(
        'PERFORMANCE_FAILED',
        envelope.message || 'Failed to load performance',
      );
    }

    const d = envelope.Data;
    return ok({
      completedCount: Number(d.completedCount) || 0,
      avgDurationMinutes:
        d.avgDurationMinutes == null ? null : Number(d.avgDurationMinutes),
      onlineHours: Number(d.onlineHours) || 0,
      codCollected: Number(d.codCollected) || 0,
      codOutstanding: Number(d.codOutstanding) || 0,
      from: d.from ?? null,
      to: d.to ?? null,
    });
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach performance API');
  }
}

export async function setAvailability(
  isOnline: boolean,
): Promise<
  ApiResult<{ isOnline: boolean; currentOnlineStartedAt: string | null }>
> {
  try {
    const envelope = await apiEnvelope<{
      isOnline?: boolean;
      currentOnlineStartedAt?: string | null;
    }>(API_PATHS.availability, {
      method: 'POST',
      auth: true,
      body: { isOnline },
    });

    if (!envelope.status) {
      return fail(
        'AVAILABILITY_FAILED',
        envelope.message || 'Failed to update availability',
      );
    }

    const data = envelope.Data;
    return ok({
      isOnline: Boolean(data?.isOnline ?? isOnline),
      currentOnlineStartedAt: data?.currentOnlineStartedAt ?? null,
    });
  } catch (err) {
    return mapNetworkError(err, 'Unable to update availability');
  }
}

export async function updateOrderStatus(
  backendId: number,
  payload: OrderStatusPayload,
): Promise<ApiResult<true>> {
  const requestId = payload.requestId?.trim() || createRequestId();
  try {
    const envelope = await apiEnvelope<string>(
      API_PATHS.orderStatus(backendId),
      {
        method: 'POST',
        auth: true,
        headers: { 'Idempotency-Key': requestId },
        body: {
          status: payload.status,
          cashCollected: payload.cashCollected,
          cashCollectedReason: payload.cashCollectedReason,
          requestId,
        },
      },
    );

    if (!envelope.status) {
      return fail(
        'STATUS_FAILED',
        envelope.message || 'Failed to update order status',
      );
    }

    return ok(true);
  } catch (err) {
    return mapNetworkError(err, 'Unable to update order status');
  }
}

export async function rejectOrder(
  backendId: number,
  payload: RejectOrderPayload = {},
): Promise<ApiResult<true>> {
  const requestId = payload.requestId?.trim() || createRequestId();
  try {
    const envelope = await apiEnvelope<string>(
      API_PATHS.orderReject(backendId),
      {
        method: 'POST',
        auth: true,
        headers: { 'Idempotency-Key': requestId },
        body: {
          reason: payload.reason,
          requestId,
        },
      },
    );

    if (!envelope.status) {
      return fail(
        'REJECT_FAILED',
        envelope.message || 'Failed to reject order',
      );
    }

    return ok(true);
  } catch (err) {
    return mapNetworkError(err, 'Unable to reject order');
  }
}

export async function reportDeliveryIssue(
  backendId: number,
  payload: ReportDeliveryIssuePayload,
): Promise<ApiResult<DeliveryIssueReport>> {
  const requestId = payload.requestId?.trim() || createRequestId();
  try {
    const envelope = await apiEnvelope<DeliveryIssueReport>(
      API_PATHS.orderReportIssue(backendId),
      {
        method: 'POST',
        auth: true,
        headers: { 'Idempotency-Key': requestId },
        body: {
          reason: payload.reason,
          note: payload.note,
          requestId,
        },
      },
    );

    if (!envelope.status || !envelope.Data) {
      return fail(
        'REPORT_ISSUE_FAILED',
        envelope.message || 'Failed to report delivery issue',
      );
    }

    return ok(envelope.Data);
  } catch (err) {
    return mapNetworkError(err, 'Unable to report delivery issue');
  }
}

export async function requestFailedDelivery(
  backendId: number,
  payload: ReportDeliveryIssuePayload,
): Promise<ApiResult<AvailableOrder>> {
  const requestId = payload.requestId?.trim() || createRequestId();
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder>(
      API_PATHS.orderRequestFailedDelivery(backendId),
      {
        method: 'POST',
        auth: true,
        headers: { 'Idempotency-Key': requestId },
        body: {
          reason: payload.reason,
          note: payload.note,
          requestId,
        },
      },
    );

    if (!envelope.status || !envelope.Data) {
      return fail(
        'FAILED_DELIVERY_REQUEST_FAILED',
        envelope.message || 'Failed to submit failure request',
      );
    }

    return ok(mapApiOrderToAvailable(envelope.Data));
  } catch (err) {
    return mapNetworkError(err, 'Unable to submit failure request');
  }
}

export async function confirmReturnToStore(
  backendId: number,
  requestId?: string,
): Promise<ApiResult<AvailableOrder>> {
  const id = requestId?.trim() || createRequestId();
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder>(
      API_PATHS.orderConfirmReturnToStore(backendId),
      {
        method: 'POST',
        auth: true,
        headers: { 'Idempotency-Key': id },
        body: { requestId: id },
      },
    );

    if (!envelope.status || !envelope.Data) {
      return fail(
        'CONFIRM_RETURN_FAILED',
        envelope.message || 'Failed to confirm return',
      );
    }

    return ok(mapApiOrderToAvailable(envelope.Data));
  } catch (err) {
    return mapNetworkError(err, 'Unable to confirm return');
  }
}

export async function fetchOrderById(
  backendId: number,
): Promise<ApiResult<AvailableOrder>> {
  try {
    const envelope = await apiEnvelope<ApiAvailableOrder>(
      API_PATHS.orderById(backendId),
      { auth: true },
    );

    if (!envelope.status || !envelope.Data) {
      return fail('ORDER_NOT_FOUND', envelope.message || 'Order not found');
    }

    return ok(mapApiOrderToAvailable(envelope.Data));
  } catch (err) {
    return mapNetworkError(err, 'Unable to reach orders API');
  }
}

/** No local seed — list comes from AssignOrder only. */
export function getSeedOrders(): AvailableOrder[] {
  return [];
}

export function orderListKey(order: AvailableOrder): string {
  return order.backendId != null ? String(order.backendId) : order.id;
}
