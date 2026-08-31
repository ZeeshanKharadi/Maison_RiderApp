import { AvailableOrder } from '../data/orders';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import {
  ApiAvailableOrder,
  mapApiOrderToAvailable,
} from '../api/mappers/orderMapper';
import { ApiResult, fail, ok } from './types';

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
    return ok(rows.map(mapApiOrderToAvailable));
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
