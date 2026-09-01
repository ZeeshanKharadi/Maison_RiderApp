import { Platform } from 'react-native';
import * as deviceTokenRepository from '../repositories/deviceTokenRepository';
import { getFcmToken, requestPushPermission } from './pushNotifications';

let lastRegisteredToken: string | null = null;

/** Register this device's FCM token with the backend (safe to call repeatedly). */
export async function syncFcmDeviceToken(): Promise<boolean> {
  await requestPushPermission();

  const token = await getFcmToken();
  if (!token) {
    if (__DEV__) {
      console.warn('[FCM] Could not obtain device token — rebuild the app after adding google-services.json');
    }
    return false;
  }

  if (token === lastRegisteredToken) {
    return true;
  }

  const result = await deviceTokenRepository.registerDeviceToken(
    token,
    Platform.OS === 'ios' ? 'ios' : 'android',
  );

  if (!result.ok) {
    if (__DEV__) {
      console.warn('[FCM] Backend registration failed:', result.message);
    }
    return false;
  }

  lastRegisteredToken = token;
  if (__DEV__) {
    console.log('[FCM] Device token registered with backend');
  }
  return true;
}

export async function unregisterFcmDeviceToken(): Promise<void> {
  const token = lastRegisteredToken ?? (await getFcmToken());
  if (!token) return;

  await deviceTokenRepository.removeDeviceToken(token);
  lastRegisteredToken = null;
}
