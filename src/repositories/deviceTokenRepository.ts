import { API_PATHS } from '../config';
import { apiEnvelope } from '../httpClient';
import { ApiResult, fail, ok } from './types';

export async function registerDeviceToken(
  token: string,
  platform: 'android' | 'ios' = 'android',
): Promise<ApiResult<void>> {
  try {
    const envelope = await apiEnvelope<string>(API_PATHS.deviceToken, {
      method: 'POST',
      auth: true,
      body: { token, platform },
    });
    if (!envelope.status) {
      return fail('DEVICE_TOKEN_FAILED', envelope.message || 'Could not register device');
    }
    return ok(undefined);
  } catch (err) {
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to register device token',
    );
  }
}

export async function removeDeviceToken(token: string): Promise<ApiResult<void>> {
  try {
    const envelope = await apiEnvelope<string>(
      `${API_PATHS.deviceToken}?token=${encodeURIComponent(token)}`,
      { method: 'DELETE', auth: true },
    );
    if (!envelope.status) {
      return fail('DEVICE_TOKEN_FAILED', envelope.message || 'Could not remove device');
    }
    return ok(undefined);
  } catch (err) {
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to remove device token',
    );
  }
}
