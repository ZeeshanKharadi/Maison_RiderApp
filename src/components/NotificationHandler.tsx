import React, { useContext, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import {
  NotificationContext,
} from '../context/NotificationContext';
import * as accountRepository from '../repositories/accountRepository';
import notificationService from '../services/NotificationService';
import { shouldRegisterPushToken } from '../utils/pushRegistration';

const listenersSetupRef = { current: false };

/**
 * Request OS permission after login when push preference is on.
 * Lives above AccountProvider — reads preference from AsyncStorage.
 */
export function NotificationPermissionHandler() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      const loaded = await accountRepository.loadSettings();
      const enabled = loaded.ok ? loaded.data.pushNotifications : true;
      if (!shouldRegisterPushToken(enabled)) return;

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
  const { settings, ready, refreshNotifications } = useAccount();
  const { restoreActiveDeliveries } = useRiderSession();

  useEffect(() => {
    if (!user?.id || !ready) return;

    let cleanup = () => {};
    let mounted = true;

    const setup = async () => {
      if (listenersSetupRef.current) return;

      notificationService.setPushPreferred(settings.pushNotifications);

      if (shouldRegisterPushToken(settings.pushNotifications)) {
        await notificationService.requestNotificationPermission();
        await notificationService.saveTokensToBackend();
      } else {
        // Preference off: ensure this device token is not on the server.
        await notificationService.removeTokenFromBackend();
      }

      if (!mounted) return;

      listenersSetupRef.current = true;
      cleanup = notificationService.setupNotificationListeners({
        incrementUnreadCount,
        onOrderNotification: data => {
          void refreshNotifications();
          void refreshOrders();
          const event = String(data?.event || '').toLowerCase();
          const title = String(data?.title || '').toLowerCase();
          if (event === 'order_cancelled' || title.includes('cancelled')) {
            Alert.alert(
              'Order cancelled',
              'An active delivery was cancelled. Refreshing your jobs.',
            );
            // Restore refreshes jobs and records durable ack without a second Alert.
            void restoreActiveDeliveries({ suppressCancelAlert: true });
          }
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
    // settings.pushNotifications applied on ready; toggles use updateSettings → applyPushPreference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    ready,
    incrementUnreadCount,
    setUnreadCount,
    refreshNotifications,
    refreshOrders,
    restoreActiveDeliveries,
  ]);

  return null;
}
