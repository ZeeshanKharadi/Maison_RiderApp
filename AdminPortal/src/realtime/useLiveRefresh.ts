import { useEffect, useRef } from 'react';
import {
  ensureAdminHub,
  isAdminHubConnected,
  onAdminHubReconnect,
  subscribeOrderChanged,
  subscribeRiderAvailabilityChanged,
} from './adminHub';

const POLL_MS = 30_000;

type LiveEvent = 'OrderChanged' | 'RiderAvailabilityChanged';

/**
 * Refetch on OrderChanged / RiderAvailabilityChanged (and after hub reconnect).
 * When the hub is disconnected, falls back to a bounded 30s poll.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  events: LiveEvent[] = ['OrderChanged', 'RiderAvailabilityChanged'],
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const run = () => {
      void Promise.resolve(refreshRef.current()).catch(() => {
        /* page owns error UI */
      });
    };

    void ensureAdminHub().catch(() => {
      /* polling covers offline hub */
    });

    const unsubs: Array<() => void> = [];
    if (events.includes('OrderChanged')) {
      unsubs.push(subscribeOrderChanged(() => run()));
    }
    if (events.includes('RiderAvailabilityChanged')) {
      unsubs.push(subscribeRiderAvailabilityChanged(() => run()));
    }
    unsubs.push(onAdminHubReconnect(() => run()));

    const poll = window.setInterval(() => {
      if (!isAdminHubConnected()) run();
    }, POLL_MS);

    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(poll);
    };
  }, [events.join(',')]);
}
