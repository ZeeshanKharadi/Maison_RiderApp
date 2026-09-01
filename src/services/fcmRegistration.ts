import { Platform } from 'react-native';
import { getAccessToken } from '../api/tokenStorage';
import * as deviceTokenRepository from '../repositories/deviceTokenRepository';
import { getFcmToken, requestPushPermission } from './pushNotifications';

const SYNC_DEBOUNCE_MS = 15_000;
let lastSynced: { token: string; at: number } | null = null;

function logFcm(message: string, detail?: unknown) {
  if (detail !== undefined) {
    console.log(`[FCM] ${message}`, detail);
    return;
  }
  console.log(`[FCM] ${message}`);
}

function warnFcm(message: string, detail?: unknown) {
  if (detail !== undefined) {
    console.warn(`[FCM] ${message}`, detail);
    return;
  }
  console.warn(`[FCM] ${message}`);
}

async function wait(ms: number) {
  await new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function getFcmTokenWithRetry(attempts = 4): Promise<string | null> {
  for (let i = 0; i < attempts; i += 1) {
    const token = await getFcmToken();
    if (token) return token;
    if (i < attempts - 1) {
      await wait(1500 * (i + 1));
    }
  }
  return null;
}

/** Register this device's FCM token with the backend (idempotent upsert). */
export async function syncFcmDeviceToken(force = false): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    warnFcm('No auth token — login before registering device');
    return false;
  }

  await requestPushPermission();

  const token = await getFcmTokenWithRetry();
  if (!token) {
    warnFcm('Could not obtain FCM token — rebuild app after adding google-services.json');
    return false;
  }

  const now = Date.now();
  if (
    !force &&
    lastSynced?.token === token &&
    now - lastSynced.at < SYNC_DEBOUNCE_MS
  ) {
    return true;
  }

  const result = await deviceTokenRepository.registerDeviceToken(
    token,
    Platform.OS === 'ios' ? 'ios' : 'android',
  );

  if (!result.ok) {
    warnFcm('Backend registration failed', result.message);
    return false;
  }

  lastSynced = { token, at: now };
  logFcm('Device token registered with backend');
  return true;
}

export async function unregisterFcmDeviceToken(): Promise<void> {
  const token = lastSynced?.token ?? (await getFcmToken());
  if (!token) return;

  await deviceTokenRepository.removeDeviceToken(token);
  lastSynced = null;
}
