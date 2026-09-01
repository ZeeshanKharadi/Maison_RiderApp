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
import { getNextState, isCompletionStep, isTerminalState } from '../delivery/stateMachine';
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

function isActiveJob(job: ActiveDeliveryJob): boolean {
  return !isTerminalState(job.state);
}

function pickSelectedJob(
  jobs: ActiveDeliveryJob[],
  selectedId: string | null,
): ActiveDeliveryJob | null {
  if (selectedId) {
    const selected = jobs.find(j => j.id === selectedId && isActiveJob(j));
    if (selected) return selected;
  }
  return jobs.find(isActiveJob) ?? null;
}

type RiderSessionContextValue = {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  toggleOnline: () => void;
  shiftStartedAt: Date | null;
  /** Non-completed delivery jobs (multi-order). */
  activeJobs: ActiveDeliveryJob[];
  selectedJobId: string | null;
  /** Currently selected active job — backward compatible alias. */
  activeJob: ActiveDeliveryJob | null;
  /** @deprecated alias — prefer activeJob */
  activeDelivery: ActiveDeliveryJob | null;
  selectActiveJob: (jobId: string) => void;
  acceptOrderAsJob: (order: AvailableOrder) => void;
  setActiveJob: (job: ActiveDeliveryJob | null) => void;
  clearActiveDelivery: () => void;
  advanceDelivery: () => void;
  setCashCollected: (collected: boolean) => void;
  completeDelivery: (opts?: { cashCollected?: boolean }) => CompleteResult | null;
  needsCodConfirmation: boolean;
  history: DeliveryHistoryItem[];
  wallet: WalletState;
  stats: SessionStats;
  withdrawFunds: (amount: number) => boolean;
};

const RiderSessionContext = createContext<RiderSessionContextValue | null>(
  null,
);

export function RiderSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [shiftStartedAt, setShiftStartedAt] = useState<Date | null>(
    () => new Date(Date.now() - 5.5 * 60 * 60 * 1000),
  );
  const [activeJobs, setActiveJobs] = useState<ActiveDeliveryJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<DeliveryHistoryItem[]>([]);
  const [wallet, setWallet] = useState<WalletState>(INITIAL_WALLET);
  const [stats, setStats] = useState<SessionStats>(INITIAL_SESSION_STATS);

  const activeJob = useMemo(
    () => pickSelectedJob(activeJobs, selectedJobId),
    [activeJobs, selectedJobId],
  );

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

  const updateJobInList = useCallback(
    (jobId: string, updater: (job: ActiveDeliveryJob) => ActiveDeliveryJob) => {
      setActiveJobs(prev =>
        prev.map(job => (job.id === jobId ? updater(job) : job)),
      );
    },
    [],
  );

  const selectActiveJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
  }, []);

  const clearActiveDelivery = useCallback(() => {
    setActiveJobs(prev => {
      if (!selectedJobId) {
        return [];
      }
      const remaining = prev.filter(j => j.id !== selectedJobId);
      setSelectedJobId(remaining.find(isActiveJob)?.id ?? null);
      return remaining;
    });
  }, [selectedJobId]);

  const acceptOrderAsJob = useCallback(
    (order: AvailableOrder) => {
      setActiveJobs(prev => {
        const existing = prev.find(j => j.id === order.id);
        if (existing && isActiveJob(existing)) {
          setSelectedJobId(order.id);
          return prev;
        }
        const withoutCompleted = prev.filter(j => j.id !== order.id);
        const next = [...withoutCompleted, createJobFromOrder(order)];
        setSelectedJobId(order.id);
        return next;
      });
      setOnline(true);
    },
    [setOnline],
  );

  const setActiveJob = useCallback((job: ActiveDeliveryJob | null) => {
    if (!job) {
      setActiveJobs([]);
      setSelectedJobId(null);
      return;
    }
    setActiveJobs(prev => {
      const idx = prev.findIndex(j => j.id === job.id);
      if (idx < 0) return [...prev, job];
      const copy = [...prev];
      copy[idx] = job;
      return copy;
    });
    setSelectedJobId(job.id);
  }, []);

  const advanceDelivery = useCallback(() => {
    if (!activeJob) return;
    const jobId = activeJob.id;
    updateJobInList(jobId, prev => {
      if (isCompletionStep(prev.state)) return prev;
      const next = getNextState(prev.state);
      if (!next || next === 'DELIVERED' || next === 'COMPLETED') {
        if (prev.state === 'ARRIVED_AT_DESTINATION') return prev;
      }
      return advanceJob(prev);
    });
  }, [activeJob, updateJobInList]);

  const setCashCollected = useCallback(
    (collected: boolean) => {
      if (!activeJob) return;
      updateJobInList(activeJob.id, prev => ({
        ...prev,
        cashCollected: collected,
      }));
    },
    [activeJob, updateJobInList],
  );

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

      setActiveJobs(prev => {
        const remaining = prev.filter(j => j.id !== delivered.id);
        const nextSelected = remaining.find(isActiveJob)?.id ?? null;
        setSelectedJobId(nextSelected);
        return remaining;
      });
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
      activeJobs: activeJobs.filter(isActiveJob),
      selectedJobId,
      activeJob,
      activeDelivery: activeJob,
      selectActiveJob,
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
      activeJobs,
      selectedJobId,
      activeJob,
      selectActiveJob,
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
