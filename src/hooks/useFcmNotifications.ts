import { useEffect, useRef } from 'react';
import { Alert, Vibration } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import * as deviceTokenRepository from '../repositories/deviceTokenRepository';
import {
  getFcmToken,
  onFcmTokenRefresh,
  onForegroundMessage,
  requestPushPermission,
} from '../services/pushNotifications';

/**
 * Registers the device FCM token with the backend and handles foreground push alerts.
 */
export function useFcmNotifications(enabled: boolean) {
  const { user } = useAuth();
  const { settings, refreshNotifications } = useAccount();
  const { refreshOrders } = useAvailableOrders();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;

    let alive = true;

    const register = async (token: string) => {
      tokenRef.current = token;
      await deviceTokenRepository.registerDeviceToken(token, 'android');
    };

    const setup = async () => {
      const granted = await requestPushPermission();
      if (!alive || !granted) return;

      const token = await getFcmToken();
      if (!alive || !token) return;
      await register(token);
    };

    void setup();

    const unsubToken = onFcmTokenRefresh(token => {
      void register(token);
    });

    const unsubMessage = onForegroundMessage(message => {
      if (!settings.pushNotifications) return;

      const title =
        message.notification?.title ?? message.data?.title ?? 'New notification';
      const body =
        message.notification?.body ?? message.data?.body ?? '';

      Vibration.vibrate(400);
      Alert.alert(title, body, [{ text: 'OK', style: 'default' }]);
      void refreshNotifications();
      if (message.data?.category === 'orders') {
        void refreshOrders();
      }
    });

    return () => {
      alive = false;
      unsubToken();
      unsubMessage();
      const token = tokenRef.current;
      if (token) {
        void deviceTokenRepository.removeDeviceToken(token);
      }
    };
  }, [
    enabled,
    user?.id,
    settings.pushNotifications,
    refreshNotifications,
    refreshOrders,
  ]);
}
