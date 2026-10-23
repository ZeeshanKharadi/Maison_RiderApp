/**
 * @format
 */

import 'react-native-gesture-handler';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { handleNotificationNavigation } from './src/navigation/notificationOrderNavigation';

const CHANNEL_ID = 'maison_orders';

/**
 * Background/quit FCM handler (required at entry by RNFirebase).
 * - When FCM includes a notification payload, the OS tray already displays it.
 * - Data-only messages (title/body only in data) would otherwise be silent —
 *   display them via Notifee on the existing maison_orders channel.
 */
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  const hasSystemNotification = !!(
    remoteMessage.notification?.title || remoteMessage.notification?.body
  );
  if (hasSystemNotification) {
    return;
  }

  const title =
    remoteMessage.data?.title ||
    remoteMessage.data?.Title ||
    '';
  const body =
    remoteMessage.data?.body ||
    remoteMessage.data?.message ||
    remoteMessage.data?.description ||
    '';
  if (!title && !body) {
    return;
  }

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Order assignments',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
    });
  }

  const data = {};
  const raw = remoteMessage.data || {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null) data[k] = String(v);
  }

  await notifee.displayNotification({
    id:
      remoteMessage.messageId ||
      remoteMessage.data?.notificationId ||
      `bg_${Date.now()}`,
    title: String(title || 'Notification'),
    body: String(body),
    data,
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'ic_notification',
      color: '#C8102E',
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default' },
      autoCancel: true,
    },
  });
});

// Notifee press while JS is in background/killed headless — queue until auth+nav ready.
// Do not add a second FCM opened-app handler here (NotificationService owns those).
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    handleNotificationNavigation(detail.notification?.data ?? null);
  }
});

AppRegistry.registerComponent(appName, () => App);
