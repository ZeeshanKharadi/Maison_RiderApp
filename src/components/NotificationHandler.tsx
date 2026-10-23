import React, { useContext, useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import {
  NotificationContext,
} from '../context/NotificationContext';
import * as accountRepository from '../repositories/accountRepository';
import {
  bindNotificationOrderNavigation,
  clearNotificationOrderNavigation,
  flushPendingNotificationNavigation,
} from '../navigation/notificationOrderNavigation';
import { navigationRef } from '../navigation/RootNavigation';
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
  const { settings, ready, refreshNotifications, markNotificationRead } =
    useAccount();
  const { restoreActiveDeliveries, selectActiveJob, activeJobs } =
    useRiderSession();

  const sessionUserIdRef = useRef<string | null>(user?.id ?? null);
  const activeJobsRef = useRef(activeJobs);
  const markReadRef = useRef(markNotificationRead);
  const selectJobRef = useRef(selectActiveJob);
  const restoreRef = useRef(restoreActiveDeliveries);

  sessionUserIdRef.current = user?.id ?? null;
  activeJobsRef.current = activeJobs;
  markReadRef.current = markNotificationRead;
  selectJobRef.current = selectActiveJob;
  restoreRef.current = restoreActiveDeliveries;

  // Bind once per authenticated session. Keep callbacks fresh via refs so ordinary
  // inbox updates (markNotificationRead identity changes) do NOT clear pending work.
  useEffect(() => {
    if (!user?.id || !ready) {
      clearNotificationOrderNavigation();
      return;
    }

    bindNotificationOrderNavigation({
      getSessionUserId: () => sessionUserIdRef.current,
      markNotificationRead: id => markReadRef.current(id),
      selectActiveJob: jobId => selectJobRef.current(jobId),
      getActiveJobs: () => activeJobsRef.current,
      restoreActiveDeliveries: opts => restoreRef.current(opts),
    });

    if (navigationRef.isReady()) {
      void flushPendingNotificationNavigation();
    }

    return () => {
      clearNotificationOrderNavigation();
    };
  }, [user?.id, ready]);

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
            void restoreRef.current({ suppressCancelAlert: true });
          }
        },
      });

      setUnreadCount(0);
      if (navigationRef.isReady()) {
        void flushPendingNotificationNavigation();
      }
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
  ]);

  return null;
}
