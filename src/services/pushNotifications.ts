import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  getInitialNotification as getInitialFcmNotification,
  onMessage,
  onNotificationOpenedApp as onFcmNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

const messaging = getMessaging();

export type { RemoteMessage };

export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }
  }

  const status = await requestPermission(messaging);
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

export async function getFcmToken(): Promise<string | null> {
  try {
    await registerDeviceForRemoteMessages(messaging);
    return await getToken(messaging);
  } catch {
    return null;
  }
}

export function onFcmTokenRefresh(listener: (token: string) => void) {
  return onTokenRefresh(messaging, listener);
}

export function onForegroundMessage(
  listener: (message: RemoteMessage) => void,
) {
  return onMessage(messaging, listener);
}

export function getInitialNotification() {
  return getInitialFcmNotification(messaging);
}

export function onNotificationOpenedApp(
  listener: (message: RemoteMessage) => void,
) {
  return onFcmNotificationOpenedApp(messaging, listener);
}
