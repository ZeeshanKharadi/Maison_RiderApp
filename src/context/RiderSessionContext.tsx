import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { DeliveryHistoryItem } from '../data/deliveryHistory';
import {
  ActiveDeliveryJob,
  advanceJob,
  backendStatusForAdvance,
  buildDeliveryTimeline,
  createJobFromOrder,
  isInProgressTransition,
  transitionJob,
} from '../delivery/types';
import {
  getNextState,
  isCompletionStep,
  isTerminalState,
} from '../delivery/stateMachine';
import {
  applyCompletionToStats,
  INITIAL_SESSION_STATS,
  INITIAL_WALLET,
  jobToHistoryItem,
  SessionStats,
  WalletState,
} from '../delivery/sessionUpdates';
import { AvailableOrder } from '../data/orders';
import {
  isCancelledBackendStatus,
} from '../api/mappers/orderMapper';
import * as ordersRepository from '../repositories/ordersRepository';
import type { OrderStatusPayload } from '../repositories/ordersRepository';
import * as authRepository from '../repositories/authRepository';
import { useAuth } from '../services/AuthContext';

const MAX_ACTIVE_JOBS = 5;

type CompleteOpts = {
  cashCollected?: boolean;
  cashCollectedAmount?: number;
  cashCollectedReason?: string;
};

type CompleteResult = {
  ok: boolean;
  historyItem?: DeliveryHistoryItem;
  message?: string;
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
  setOnline: (online: boolean) => Promise<boolean>;
  toggleOnline: () => Promise<boolean>;
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
  advanceDelivery: () => Promise<boolean>;
  setCashCollected: (collected: boolean) => void;
  completeDelivery: (opts?: CompleteOpts) => Promise<CompleteResult | null>;
  needsCodConfirmation: boolean;
  history: DeliveryHistoryItem[];
  wallet: WalletState;
  stats: SessionStats;
  withdrawFunds: (amount: number) => boolean;
  restoreActiveDeliveries: () => Promise<void>;
  lifecyclePending: boolean;
  lastLifecycleError: string | null;
};

const RiderSessionContext = createContext<RiderSessionContextValue | null>(
  null,
);

export function RiderSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [shiftStartedAt, setShiftStartedAt] = useState<Date | null>(null);
  const [activeJobs, setActiveJobs] = useState<ActiveDeliveryJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<DeliveryHistoryItem[]>([]);
  const [wallet, setWallet] = useState<WalletState>(INITIAL_WALLET);
  const [stats, setStats] = useState<SessionStats>(INITIAL_SESSION_STATS);
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const [lastLifecycleError, setLastLifecycleError] = useState<string | null>(
    null,
  );
  const restoringRef = useRef(false);

  const activeJob = useMemo(
    () => pickSelectedJob(activeJobs, selectedJobId),
    [activeJobs, selectedJobId],
  );

  const setOnline = useCallback(async (online: boolean): Promise<boolean> => {
    setLifecyclePending(true);
    setLastLifecycleError(null);
    const result = await ordersRepository.setAvailability(online);
    setLifecyclePending(false);
    if (!result.ok) {
      setLastLifecycleError(result.error.message);
      Alert.alert('Availability', result.error.message);
      return false;
    }
    setIsOnline(online);
    if (online) {
      setShiftStartedAt(prev => prev ?? new Date());
    } else {
      setShiftStartedAt(null);
    }
    return true;
  }, []);

  const toggleOnline = useCallback(async () => {
    return setOnline(!isOnline);
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

  const acceptOrderAsJob = useCallback((order: AvailableOrder) => {
    if (order.backendId == null) {
      throw new Error('backendId is required to accept an order as a job');
    }
    setActiveJobs(prev => {
      const existing = prev.find(
        j =>
          (j.backendId === order.backendId || j.id === order.id) &&
          isActiveJob(j),
      );
      if (existing) {
        return prev;
      }
      const activeCount = prev.filter(isActiveJob).length;
      if (activeCount >= MAX_ACTIVE_JOBS) {
        throw new Error('You can carry up to 5 active orders at once.');
      }
      const withoutDup = prev.filter(
        j => j.backendId !== order.backendId && j.id !== order.id,
      );
      return [...withoutDup, createJobFromOrder(order)];
    });
    setSelectedJobId(order.id);
  }, []);

  const setActiveJob = useCallback((job: ActiveDeliveryJob | null) => {
    if (!job) {
      setActiveJobs([]);
      setSelectedJobId(null);
      return;
    }
    setActiveJobs(prev => {
      const idx = prev.findIndex(
        j => j.backendId === job.backendId || j.id === job.id,
      );
      if (idx < 0) return [...prev, job];
      const copy = [...prev];
      copy[idx] = job;
      return copy;
    });
    setSelectedJobId(job.id);
  }, []);

  const restoreActiveDeliveries = useCallback(async () => {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setLifecyclePending(true);
    try {
      const result = await ordersRepository.fetchActiveOrders();
      if (!result.ok) {
        setLastLifecycleError(result.error.message);
        return;
      }

      const cancelled: AvailableOrder[] = [];
      const active: AvailableOrder[] = [];
      for (const order of result.data) {
        if (isCancelledBackendStatus(order.backendStatus)) {
          cancelled.push(order);
        } else if (
          order.backendStatus &&
          /completed/i.test(order.backendStatus)
        ) {
          // Completed should not appear in Active; skip if it does.
        } else {
          active.push(order);
        }
      }

      if (cancelled.length > 0) {
        const labels = cancelled.map(o => o.id).join(', ');
        Alert.alert(
          'Order cancelled',
          cancelled.length === 1
            ? `Order ${labels} was cancelled.`
            : `Orders cancelled: ${labels}`,
        );
      }

      const jobs: ActiveDeliveryJob[] = [];
      for (const order of active) {
        try {
          jobs.push(createJobFromOrder(order, { restore: true }));
        } catch {
          // Skip rows missing backendId
        }
      }

      setActiveJobs(jobs);
      setSelectedJobId(prev => {
        if (prev && jobs.some(j => j.id === prev && isActiveJob(j))) {
          return prev;
        }
        return jobs.find(isActiveJob)?.id ?? null;
      });
      setLastLifecycleError(null);
    } finally {
      setLifecyclePending(false);
      restoringRef.current = false;
    }
  }, []);

  // Clear rider-scoped UI state on logout / account switch
  useEffect(() => {
    if (user) return;
    setIsOnline(false);
    setShiftStartedAt(null);
    setActiveJobs([]);
    setSelectedJobId(null);
    setHistory([]);
    setWallet(INITIAL_WALLET);
    setStats(INITIAL_SESSION_STATS);
    setLifecyclePending(false);
    setLastLifecycleError(null);
  }, [user]);

  // Hydrate online flag + active jobs once auth is ready
  useEffect(() => {
    if (authLoading || !user) return;
    // Reset session caches when switching accounts so prior rider data cannot leak.
    setActiveJobs([]);
    setSelectedJobId(null);
    setHistory([]);
    setWallet(INITIAL_WALLET);
    setStats(INITIAL_SESSION_STATS);
    setLastLifecycleError(null);

    let cancelled = false;
    (async () => {
      const me = await authRepository.fetchCurrentUser();
      if (cancelled) return;
      if (me.ok && typeof me.data.isAvailableOnline === 'boolean') {
        setIsOnline(me.data.isAvailableOnline);
        if (me.data.isAvailableOnline) {
          setShiftStartedAt(prev => prev ?? new Date());
        } else {
          setShiftStartedAt(null);
        }
      }
      await restoreActiveDeliveries();
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, restoreActiveDeliveries]);

  // Refresh active jobs when app returns to foreground
  useEffect(() => {
    if (!user) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void restoreActiveDeliveries();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [user, restoreActiveDeliveries]);

  const advanceDelivery = useCallback(async (): Promise<boolean> => {
    if (!activeJob) return false;
    if (isCompletionStep(activeJob.state)) return false;

    const next = getNextState(activeJob.state);
    if (!next || next === 'DELIVERED' || next === 'COMPLETED') {
      return false;
    }

    const jobId = activeJob.id;
    const backendId = activeJob.backendId;
    const backendStatus = backendStatusForAdvance(next);
    if (!backendStatus) return false;

    setLifecyclePending(true);
    setLastLifecycleError(null);
    updateJobInList(jobId, prev => ({
      ...prev,
      pendingAction: isInProgressTransition(activeJob.state, next)
        ? 'pickup'
        : 'advance',
      lastError: null,
    }));

    const result = await ordersRepository.updateOrderStatus(backendId, {
      status: backendStatus as OrderStatusPayload['status'],
    });

    setLifecyclePending(false);
    if (!result.ok) {
      setLastLifecycleError(result.error.message);
      updateJobInList(jobId, prev => ({
        ...prev,
        pendingAction: null,
        lastError: result.error.message,
      }));
      Alert.alert('Update failed', result.error.message);
      return false;
    }

    const now = new Date().toISOString();
    updateJobInList(jobId, prev => ({
      ...advanceJob(prev),
      backendStatus,
      ...(isInProgressTransition(activeJob.state, next)
        ? { pickedUpAt: now }
        : {}),
      pendingAction: null,
      lastError: null,
    }));
    return true;
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
    async (opts?: CompleteOpts): Promise<CompleteResult | null> => {
      if (!activeJob) return null;
      if (activeJob.state !== 'ARRIVED_AT_DESTINATION') return null;

      if (activeJob.isCod) {
        const amount = opts?.cashCollectedAmount;
        if (amount == null || !Number.isFinite(amount)) {
          return {
            ok: false,
            message: 'Enter the cash amount collected.',
          };
        }
        const expected = activeJob.expectedCash ?? activeJob.orderAmount;
        if (
          expected != null &&
          Number(amount) !== Number(expected) &&
          !(opts?.cashCollectedReason ?? '').trim()
        ) {
          return {
            ok: false,
            message: 'A reason is required when cash differs from expected.',
          };
        }
      }

      const jobId = activeJob.id;
      const backendId = activeJob.backendId;

      setLifecyclePending(true);
      setLastLifecycleError(null);
      updateJobInList(jobId, prev => ({
        ...prev,
        pendingAction: 'complete',
        lastError: null,
      }));

      const result = await ordersRepository.updateOrderStatus(backendId, {
        status: 'Completed',
        cashCollected: activeJob.isCod
          ? opts?.cashCollectedAmount
          : undefined,
        cashCollectedReason: activeJob.isCod
          ? opts?.cashCollectedReason
          : undefined,
      });

      setLifecyclePending(false);

      if (!result.ok) {
        setLastLifecycleError(result.error.message);
        updateJobInList(jobId, prev => ({
          ...prev,
          pendingAction: null,
          lastError: result.error.message,
        }));
        Alert.alert('Complete failed', result.error.message);
        return { ok: false, message: result.error.message };
      }

      let delivered: ActiveDeliveryJob = {
        ...activeJob,
        cashCollected: activeJob.isCod ? true : activeJob.cashCollected,
        cashCollectedAmount: opts?.cashCollectedAmount ?? null,
        cashCollectedReason: opts?.cashCollectedReason ?? null,
        backendStatus: 'Completed',
        pendingAction: null,
        lastError: null,
      };
      delivered = transitionJob(delivered, 'DELIVERED');
      delivered = transitionJob(delivered, 'COMPLETED');
      const timeline = buildDeliveryTimeline(delivered);
      const historyItem = jobToHistoryItem(delivered, timeline);

      setHistory(prev => [historyItem, ...prev]);
      // Do not auto-credit wallet as withdrawable money — settlements are admin-managed.
      setStats(prev => applyCompletionToStats(prev, delivered));

      setActiveJobs(prev => {
        const remaining = prev.filter(j => j.id !== delivered.id);
        const nextSelected = remaining.find(isActiveJob)?.id ?? null;
        setSelectedJobId(nextSelected);
        return remaining;
      });

      return { historyItem, ok: true };
    },
    [activeJob, updateJobInList],
  );

  const withdrawFunds = useCallback((_amount: number): boolean => {
    Alert.alert(
      'Withdraw unavailable',
      'Not available — settlements are managed by admin.',
    );
    return false;
  }, []);

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
      restoreActiveDeliveries,
      lifecyclePending,
      lastLifecycleError,
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
      restoreActiveDeliveries,
      lifecyclePending,
      lastLifecycleError,
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
