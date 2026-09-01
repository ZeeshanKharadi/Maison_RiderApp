import { API_PATHS } from '../config';
import { apiEnvelope } from '../httpClient';
import {
  ApiRiderNotification,
  mapApiNotification,
} from '../mappers/notificationMapper';
import { AppNotification } from '../data/account';
import { ApiResult, fail, ok } from './types';

export async function fetchNotifications(): Promise<ApiResult<AppNotification[]>> {
  try {
    const envelope = await apiEnvelope<ApiRiderNotification[]>(
      API_PATHS.notifications,
      { auth: true },
    );
    if (!envelope.status) {
      return fail('NOTIFICATIONS_FAILED', envelope.message || 'Failed to load notifications');
    }
    const rows = Array.isArray(envelope.Data) ? envelope.Data : [];
    return ok(rows.map(mapApiNotification));
  } catch (err) {
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach notifications API',
    );
  }
}

export async function markNotificationRead(
  id: string,
): Promise<ApiResult<void>> {
  try {
    const envelope = await apiEnvelope<string>(
      API_PATHS.notificationRead(id),
      { method: 'POST', auth: true },
    );
    if (!envelope.status) {
      return fail('MARK_READ_FAILED', envelope.message || 'Could not mark read');
    }
    return ok(undefined);
  } catch (err) {
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach notifications API',
    );
  }
}

export async function markAllNotificationsRead(): Promise<ApiResult<void>> {
  try {
    const envelope = await apiEnvelope<string>(API_PATHS.notificationsReadAll, {
      method: 'POST',
      auth: true,
    });
    if (!envelope.status) {
      return fail('MARK_READ_FAILED', envelope.message || 'Could not mark all read');
    }
    return ok(undefined);
  } catch (err) {
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach notifications API',
    );
  }
}
