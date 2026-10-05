import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useAuth } from '../services/AuthContext';
import * as notificationsRepository from '../repositories/notificationsRepository';
import {
  isOrderCancellationNotification,
  shouldAlertNotification,
  showOrderNotificationAlert,
} from '../utils/notificationAlert';
import { shouldApplyInboxForRider } from '../utils/accountSession';

const POLL_MS = 8_000;

/**
 * Polls server notifications while the rider is logged in.
 * Inbox always syncs. Local/system alerts honor pushNotifications.
 * Cancel catch-up still restores active delivery even when push is OFF.
 * Restarts when the authenticated rider changes so late polls cannot leak.
 */
export function useRiderNotificationPoll(enabled: boolean) {
  const { user } = useAuth();
  const riderId = user?.id ?? null;
  const { settings, syncNotifications, notifications } = useAccount();
  const { refreshOrders } = useAvailableOrders();
  const { restoreActiveDeliveries } = useRiderSession();
  const alertedRef = useRef<Set<string>>(new Set());
  const notificationsRef = useRef(notifications);
  const riderIdRef = useRef(riderId);
  riderIdRef.current = riderId;

  useEffect(() => {
    notificationsRef.current = notifications;
    for (const n of notifications) {
      if (n.read) alertedRef.current.add(n.id);
    }
  }, [notifications]);

  useEffect(() => {
    alertedRef.current = new Set();
  }, [riderId]);

  useEffect(() => {
    if (!enabled || !riderId) return;

    let alive = true;
    let initialPollDone = false;
    const pollForUserId = riderId;

    const poll = async () => {
      const result = await notificationsRepository.fetchNotifications();
      if (!alive) return;
      if (!shouldApplyInboxForRider(pollForUserId, riderIdRef.current)) return;
      if (!result.ok) return;

      const incoming = result.data;
      await syncNotifications(incoming);

      if (!shouldApplyInboxForRider(pollForUserId, riderIdRef.current)) return;

      if (!initialPollDone) {
        for (const n of incoming) {
          alertedRef.current.add(n.id);
        }
        initialPollDone = true;
        return;
      }

      for (const n of incoming) {
        if (alertedRef.current.has(n.id)) continue;
        alertedRef.current.add(n.id);

        if (n.category === 'orders') {
          void refreshOrders();
          if (isOrderCancellationNotification(n)) {
            // Cancel Alert comes from restore (or FCM). No second local toast.
            void restoreActiveDeliveries();
            continue;
          }
        }

        if (!shouldAlertNotification(n, settings.pushNotifications)) continue;

        void showOrderNotificationAlert(n.title, n.description, {
          category: n.category,
        });
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void poll();
    });

    return () => {
      alive = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [
    enabled,
    riderId,
    settings.pushNotifications,
    syncNotifications,
    refreshOrders,
    restoreActiveDeliveries,
  ]);
}
