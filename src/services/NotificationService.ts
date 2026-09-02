import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import * as deviceTokenRepository from '../repositories/deviceTokenRepository';
import * as notificationsRepository from '../repositories/notificationsRepository';
import { navigationRef } from '../navigation/RootNavigation';

const CHANNEL_ID = 'maison_orders';
const messaging = getMessaging();

class NotificationService {
  private fcmToken: string | null = null;
  private listenersSetup = false;

  async initializeChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Order assignments',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
    });
  }

  async requestNotificationPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        const authStatus = await requestPermission(messaging);
        const granted =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;
        if (granted) {
          await registerDeviceForRemoteMessages(messaging);
        }
        return granted;
      }

      const version =
        typeof Platform.Version === 'string'
          ? parseInt(Platform.Version, 10)
          : Platform.Version;

      if (version >= 33) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Show Notifications',
            message:
              'This app needs notification permission to alert you about new delivery assignments.',
            buttonPositive: 'Allow',
            buttonNegative: "Don't Allow",
          },
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }
      }

      await getToken(messaging);
      return true;
    } catch {
      return false;
    }
  }

  async getFcmToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'ios') {
        await registerDeviceForRemoteMessages(messaging);
      }
      const token = await getToken(messaging);
      this.fcmToken = token;
      return token;
    } catch {
      return null;
    }
  }

  async saveTokensToBackend(): Promise<boolean> {
    const token = await this.getFcmToken();
    if (!token) return false;

    const result = await deviceTokenRepository.registerDeviceToken(
      token,
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
    if (!result.ok) {
      console.warn('[FCM] Backend registration failed:', result.message);
      return false;
    }

    this.fcmToken = token;
    return true;
  }

  async removeTokenFromBackend(): Promise<void> {
    const token = this.fcmToken ?? (await this.getFcmToken());
    if (!token) return;
    await deviceTokenRepository.removeDeviceToken(token);
    this.fcmToken = null;
  }

  async showNotification(
    remoteMessage: RemoteMessage,
    notificationId?: string,
  ): Promise<void> {
    await this.initializeChannels();

    const title =
      remoteMessage.notification?.title ||
      remoteMessage.data?.title ||
      'Notification';
    const body =
      remoteMessage.notification?.body ||
      remoteMessage.data?.body ||
      remoteMessage.data?.message ||
      '';

    await notifee.displayNotification({
      id:
        notificationId ||
        remoteMessage.messageId ||
        `notif_${Date.now()}`,
      title: String(title),
      body: String(body),
      data: (remoteMessage.data as Record<string, string>) || {},
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        color: '#C8102E',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
        autoCancel: true,
      },
      ios: {
        sound: 'default',
        foregroundPresentationOptions: {
          alert: true,
          badge: true,
          sound: true,
        },
      },
    });
  }

  async showLocalNotification(
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.initializeChannels();
    await notifee.displayNotification({
      id: `local_${Date.now()}`,
      title,
      body,
      data: data || {},
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        color: '#C8102E',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
        autoCancel: true,
      },
    });
  }

  setupNotificationListeners(options: {
    incrementUnreadCount: () => void;
    onOrderNotification?: () => void;
  }): () => void {
    if (this.listenersSetup) {
      return () => {};
    }
    this.listenersSetup = true;

    const queue = new Set<string>();

    const unsubscribeForeground = onMessage(messaging, async remoteMessage => {
      const notificationId =
        remoteMessage.messageId ||
        remoteMessage.data?.messageId ||
        `fg_${Date.now()}`;

      if (queue.has(String(notificationId))) return;
      queue.add(String(notificationId));
      setTimeout(() => queue.delete(String(notificationId)), 2000);

      await this.showNotification(remoteMessage, String(notificationId));
      options.incrementUnreadCount();

      if (remoteMessage.data?.category === 'orders') {
        options.onOrderNotification?.();
      }
    });

    const unsubscribeOpened = onNotificationOpenedApp(
      messaging,
      remoteMessage => {
        this.handleNotificationNavigation(remoteMessage.data);
      },
    );

    getInitialNotification(messaging).then(remoteMessage => {
      if (remoteMessage) {
        this.handleNotificationNavigation(remoteMessage.data);
      }
    });

    const notifeeUnsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        this.handleNotificationNavigation(detail.notification?.data);
      }
    });

    const unsubscribeTokenRefresh = onTokenRefresh(messaging, async () => {
      await this.saveTokensToBackend();
    });

    return () => {
      this.listenersSetup = false;
      unsubscribeForeground();
      unsubscribeOpened();
      notifeeUnsubscribe();
      unsubscribeTokenRefresh();
    };
  }

  handleNotificationNavigation(data?: Record<string, unknown> | null): void {
    if (!data || !navigationRef.isReady()) return;
    if (
      data.category === 'orders' ||
      data.screen === 'notifications' ||
      data.screen === 'Notifications'
    ) {
      navigationRef.navigate(
        'MainDrawer' as never,
        { screen: 'Notifications' } as never,
      );
    }
  }

  fetchNotifications = notificationsRepository.fetchNotifications;
  markNotificationRead = notificationsRepository.markNotificationRead;
  markAllNotificationsRead = notificationsRepository.markAllNotificationsRead;
}

const notificationService = new NotificationService();
export default notificationService;
