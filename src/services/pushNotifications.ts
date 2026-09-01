import { PermissionsAndroid, Platform } from 'react-native';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';

export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }
  }

  const status = await messaging().requestPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getFcmToken(): Promise<string | null> {
  try {
    await messaging().registerDeviceForRemoteMessages();
    return await messaging().getToken();
  } catch {
    return null;
  }
}

export function onFcmTokenRefresh(listener: (token: string) => void) {
  return messaging().onTokenRefresh(listener);
}

export function onForegroundMessage(
  listener: (message: FirebaseMessagingTypes.RemoteMessage) => void,
) {
  return messaging().onMessage(listener);
}

export function getInitialNotification() {
  return messaging().getInitialNotification();
}

export function onNotificationOpenedApp(
  listener: (message: FirebaseMessagingTypes.RemoteMessage) => void,
) {
  return messaging().onNotificationOpenedApp(listener);
}
