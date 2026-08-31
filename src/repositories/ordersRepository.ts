import { AvailableOrder } from '../data/orders';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import {
  ApiAvailableOrder,
  mapApiOrderToAvailable,
} from '../api/mappers/orderMapper';
import { ApiResult, fail, ok } from './types';

/** One card per external order id — keep the newest backend row. */
function dedupeAvailableOrders(orders: AvailableOrder[]): AvailableOrder[] {
  const byRef = new Map<string, AvailableOrder>();

  for (const order of orders) {
    const ref = order.id.trim().toLowerCase();
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
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach orders API',
    );
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
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach orders API',
    );
  }
}

/** No local seed — list comes from AssignOrder only. */
export function getSeedOrders(): AvailableOrder[] {
  return [];
}

export function orderListKey(order: AvailableOrder): string {
  return order.backendId != null ? String(order.backendId) : order.id;
}
