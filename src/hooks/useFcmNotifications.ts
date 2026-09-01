import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { syncFcmDeviceToken } from '../services/fcmRegistration';
import {
  onFcmTokenRefresh,
  onForegroundMessage,
} from '../services/pushNotifications';
import { showOrderNotificationAlert } from '../utils/notificationAlert';

/**
 * Keeps FCM token synced with backend and shows foreground push alerts.
 */
export function useFcmNotifications(enabled: boolean) {
  const { user } = useAuth();
  const { settings, refreshNotifications } = useAccount();
  const { refreshOrders } = useAvailableOrders();

  useEffect(() => {
    if (!enabled || !user) return;

    void syncFcmDeviceToken();

    const unsubToken = onFcmTokenRefresh(() => {
      void syncFcmDeviceToken(true);
    });

    const unsubMessage = onForegroundMessage(message => {
      const title =
        message.notification?.title ??
        message.data?.title ??
        'New notification';
      const body =
        message.notification?.body ?? message.data?.body ?? '';
      const isOrder = message.data?.category === 'orders';

      if (!isOrder && !settings.pushNotifications) return;

      showOrderNotificationAlert(title, body);
      void refreshNotifications();
      if (isOrder) {
        void refreshOrders();
      }
    });

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncFcmDeviceToken(true);
      }
    });

    const resyncInterval = setInterval(() => {
      void syncFcmDeviceToken(true);
    }, 5 * 60_000);

    return () => {
      unsubToken();
      unsubMessage();
      appStateSub.remove();
      clearInterval(resyncInterval);
    };
  }, [enabled, user?.id, settings.pushNotifications, refreshNotifications, refreshOrders]);
}
