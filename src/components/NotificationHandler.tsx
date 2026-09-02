import React, { useContext, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import {
  NotificationContext,
} from '../context/NotificationContext';
import notificationService from '../services/NotificationService';

const listenersSetupRef = { current: false };

/** Reference: request notification permission after login. */
export function NotificationPermissionHandler() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 2000));
      const granted = await notificationService.requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications in Settings to receive delivery assignment alerts.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }
    };

    void run();
  }, [user?.id]);

  return null;
}

/** Reference: token registration + FCM listeners once per session. */
export function NotificationHandler() {
  const { user } = useAuth();
  const { incrementUnreadCount, setUnreadCount } = useContext(NotificationContext);
  const { refreshOrders } = useAvailableOrders();
  const { refreshNotifications } = useAccount();

  useEffect(() => {
    if (!user?.id) return;

    let cleanup = () => {};
    let mounted = true;

    const setup = async () => {
      if (listenersSetupRef.current) return;

      await notificationService.requestNotificationPermission();
      await notificationService.saveTokensToBackend();

      if (!mounted) return;

      listenersSetupRef.current = true;
      cleanup = notificationService.setupNotificationListeners({
        incrementUnreadCount,
        onOrderNotification: () => {
          void refreshNotifications();
          void refreshOrders();
        },
      });

      setUnreadCount(0);
    };

    void setup();

    return () => {
      mounted = false;
      listenersSetupRef.current = false;
      cleanup();
    };
  }, [
    user?.id,
    incrementUnreadCount,
    setUnreadCount,
    refreshNotifications,
    refreshOrders,
  ]);

  return null;
}
