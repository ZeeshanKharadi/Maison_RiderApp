import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { DeliveryHistoryItem } from '../data/deliveryHistory';
import {
  ActiveDeliveryJob,
  advanceJob,
  buildDeliveryTimeline,
  createJobFromOrder,
  transitionJob,
} from '../delivery/types';
import { getNextState, isCompletionStep } from '../delivery/stateMachine';
import {
  applyCompletionToStats,
  applyCompletionToWallet,
  applyWithdrawal,
  INITIAL_SESSION_STATS,
  INITIAL_WALLET,
  jobToHistoryItem,
  SessionStats,
  WalletState,
} from '../delivery/sessionUpdates';
import { AvailableOrder } from '../data/orders';

type CompleteResult = {
  historyItem: DeliveryHistoryItem;
};

type RiderSessionContextValue = {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  toggleOnline: () => void;
  shiftStartedAt: Date | null;
  activeJob: ActiveDeliveryJob | null;
  /** @deprecated alias — prefer activeJob */
  activeDelivery: ActiveDeliveryJob | null;
  acceptOrderAsJob: (order: AvailableOrder) => void;
  setActiveJob: (job: ActiveDeliveryJob | null) => void;
  clearActiveDelivery: () => void;
  /** Advance one step in the state machine (not for final complete). */
  advanceDelivery: () => void;
  /** Mark COD cash collected before completing. */
  setCashCollected: (collected: boolean) => void;
  /**
   * Finish trip: DELIVERED → COMPLETED, update metrics.
   * Clears after ActiveDeliveryScreen success animation via clearActiveDelivery.
   */
  completeDelivery: (opts?: { cashCollected?: boolean }) => CompleteResult | null;
  needsCodConfirmation: boolean;
  history: DeliveryHistoryItem[];
  wallet: WalletState;
  stats: SessionStats;
  /** Mock withdraw — returns false if amount invalid. */
  withdrawFunds: (amount: number) => boolean;
};

const RiderSessionContext = createContext<RiderSessionContextValue | null>(
  null,
);

/**
 * Unified rider session: online status, active delivery job, and local metrics.
 * Replaces thin RiderStatusContext for Phase 2B lifecycle.
 */
export function RiderSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [shiftStartedAt, setShiftStartedAt] = useState<Date | null>(
    () => new Date(Date.now() - 5.5 * 60 * 60 * 1000),
  );
  const [activeJob, setActiveJob] = useState<ActiveDeliveryJob | null>(null);
  /** Only trips completed from AssignOrder-sourced accepts — no mock seed. */
  const [history, setHistory] = useState<DeliveryHistoryItem[]>([]);
  const [wallet, setWallet] = useState<WalletState>(INITIAL_WALLET);
  const [stats, setStats] = useState<SessionStats>(INITIAL_SESSION_STATS);

  const setOnline = useCallback((online: boolean) => {
    setIsOnline(online);
    if (online) {
      setShiftStartedAt(prev => prev ?? new Date());
    } else {
      setShiftStartedAt(null);
    }
  }, []);

  const toggleOnline = useCallback(() => {
    setOnline(!isOnline);
  }, [isOnline, setOnline]);

  const clearActiveDelivery = useCallback(() => {
    setActiveJob(null);
  }, []);

  const acceptOrderAsJob = useCallback(
    (order: AvailableOrder) => {
      setActiveJob(createJobFromOrder(order));
      setOnline(true);
    },
    [setOnline],
  );

  const advanceDelivery = useCallback(() => {
    setActiveJob(prev => {
      if (!prev) return prev;
      if (isCompletionStep(prev.state)) return prev;
      const next = getNextState(prev.state);
      if (!next || next === 'DELIVERED' || next === 'COMPLETED') {
        // ARRIVED_AT_DESTINATION must go through completeDelivery
        if (prev.state === 'ARRIVED_AT_DESTINATION') return prev;
      }
      return advanceJob(prev);
    });
  }, []);

  const setCashCollected = useCallback((collected: boolean) => {
    setActiveJob(prev => (prev ? { ...prev, cashCollected: collected } : prev));
  }, []);

  const needsCodConfirmation = !!(
    activeJob?.isCod &&
    activeJob.state === 'ARRIVED_AT_DESTINATION' &&
    activeJob.cashCollected !== true
  );

  const completeDelivery = useCallback(
    (opts?: { cashCollected?: boolean }): CompleteResult | null => {
      if (!activeJob) return null;
      if (activeJob.state !== 'ARRIVED_AT_DESTINATION') return null;
      const cashOk =
        !activeJob.isCod ||
        activeJob.cashCollected === true ||
        opts?.cashCollected === true;
      if (!cashOk) return null;

      let delivered: ActiveDeliveryJob = {
        ...activeJob,
        cashCollected: activeJob.isCod ? true : activeJob.cashCollected,
      };
      delivered = transitionJob(delivered, 'DELIVERED');
      delivered = transitionJob(delivered, 'COMPLETED');
      const timeline = buildDeliveryTimeline(delivered);
      const historyItem = jobToHistoryItem(delivered, timeline);

      setHistory(prev => [historyItem, ...prev]);
      setWallet(prev => applyCompletionToWallet(prev, delivered));
      setStats(prev => applyCompletionToStats(prev, delivered));
      setActiveJob(delivered);
      setOnline(true);

      return { historyItem };
    },
    [activeJob, setOnline],
  );

  const withdrawFunds = useCallback(
    (amount: number): boolean => {
      const next = applyWithdrawal(wallet, amount);
      if (!next) return false;
      setWallet(next);
      return true;
    },
    [wallet],
  );

  const value = useMemo(
    () => ({
      isOnline,
      setOnline,
      toggleOnline,
      shiftStartedAt,
      activeJob,
      activeDelivery: activeJob,
      acceptOrderAsJob,
      setActiveJob,
      clearActiveDelivery,
      advanceDelivery,
      setCashCollected,
      completeDelivery,
      needsCodConfirmation,
      history,
      wallet,
      stats,
      withdrawFunds,
    }),
    [
      isOnline,
      setOnline,
      toggleOnline,
      shiftStartedAt,
      activeJob,
      acceptOrderAsJob,
      clearActiveDelivery,
      advanceDelivery,
      setCashCollected,
      completeDelivery,
      needsCodConfirmation,
      history,
      wallet,
      stats,
      withdrawFunds,
    ],
  );

  return (
    <RiderSessionContext.Provider value={value}>
      {children}
    </RiderSessionContext.Provider>
  );
}

export function useRiderSession() {
  const ctx = useContext(RiderSessionContext);
  if (!ctx) {
    throw new Error('useRiderSession must be used within RiderSessionProvider');
  }
  return ctx;
}

/** Back-compat alias used by older screens — prefer useRiderSession. */
export function useRiderStatus() {
  const session = useRiderSession();
  return useMemo(
    () => ({
      isOnline: session.isOnline,
      setOnline: session.setOnline,
      toggleOnline: session.toggleOnline,
      shiftStartedAt: session.shiftStartedAt,
      activeDelivery: session.activeJob,
      setActiveDelivery: session.setActiveJob,
      clearActiveDelivery: session.clearActiveDelivery,
    }),
    [
      session.isOnline,
      session.setOnline,
      session.toggleOnline,
      session.shiftStartedAt,
      session.activeJob,
      session.setActiveJob,
      session.clearActiveDelivery,
    ],
  );
}
