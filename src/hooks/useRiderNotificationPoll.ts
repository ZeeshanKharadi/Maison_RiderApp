import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import * as notificationsRepository from '../repositories/notificationsRepository';
import {
  shouldAlertNotification,
  showOrderNotificationAlert,
} from '../utils/notificationAlert';

const POLL_MS = 8_000;

/**
 * Polls server notifications while the rider is logged in.
 * Order assignments always alert; other categories respect pushNotifications setting.
 */
export function useRiderNotificationPoll(enabled: boolean) {
  const { settings, syncNotifications, notifications } = useAccount();
  const { refreshOrders } = useAvailableOrders();
  const alertedRef = useRef<Set<string>>(new Set());
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    notificationsRef.current = notifications;
    for (const n of notifications) {
      if (n.read) alertedRef.current.add(n.id);
    }
  }, [notifications]);

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    let initialPollDone = false;

    const poll = async () => {
      const result = await notificationsRepository.fetchNotifications();
      if (!alive || !result.ok) return;

      const incoming = result.data;
      await syncNotifications(incoming);

      if (!initialPollDone) {
        for (const n of incoming) {
          alertedRef.current.add(n.id);
        }
        initialPollDone = true;
        return;
      }

      for (const n of incoming) {
        if (alertedRef.current.has(n.id)) continue;
        if (!shouldAlertNotification(n, settings.pushNotifications)) continue;

        alertedRef.current.add(n.id);
        void showOrderNotificationAlert(n.title, n.description, {
          category: n.category,
        });
        if (n.category === 'orders') {
          void refreshOrders();
        }
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
  }, [enabled, settings.pushNotifications, syncNotifications, refreshOrders]);
}
