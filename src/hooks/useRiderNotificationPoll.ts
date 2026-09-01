import { useEffect, useRef } from 'react';
import { Alert, AppState, Vibration } from 'react-native';
import { useAccount } from '../context/AccountContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import * as notificationsRepository from '../repositories/notificationsRepository';

const POLL_MS = 20_000;

/**
 * Polls server notifications while the rider is logged in.
 * Works regardless of the Dashboard online/offline toggle — that toggle is UI-only today.
 * Shows an in-app alert for new order assignments; refreshes the orders list.
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

      if (!settings.pushNotifications) return;

      for (const n of incoming) {
        if (n.category !== 'orders' || n.read || alertedRef.current.has(n.id)) {
          continue;
        }
        alertedRef.current.add(n.id);
        Vibration.vibrate(400);
        Alert.alert(n.title, n.description, [
          { text: 'OK', style: 'default' },
        ]);
        void refreshOrders();
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
