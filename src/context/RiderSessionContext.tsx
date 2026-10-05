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
  isLiveRiderActiveStatus,
} from '../api/mappers/orderMapper';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import * as ordersRepository from '../repositories/ordersRepository';
import type { OrderStatusPayload } from '../repositories/ordersRepository';
import {
  isUncertainMutationFailure,
  reconcileStatusMutation,
  resolveCodCashAfterServerCompleted,
} from '../utils/mutationReconciliation';
import * as authRepository from '../repositories/authRepository';
import * as cancellationAckRepository from '../repositories/cancellationAckRepository';
import { planCancellationAlerts } from '../utils/cancellationAlertPlan';
import { applyServerAvailability } from '../utils/shiftAvailability';
import { useAuth } from '../services/AuthContext';
import { useDeliveryLocationTracking } from '../hooks/useDeliveryLocationTracking';
import { stopNativeLocationTracking } from '../services/locationTrackingNative';

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
  /** COD: false when completion confirmed but cash not verified on server. */
  cashVerified?: boolean | null;
};

function isActiveJob(job: ActiveDeliveryJob): boolean {
  if (isTerminalState(job.state)) return false;
  // Drop jobs that admin finished / requeued (Available/Failed/Cancelled/…).
  if (
    job.backendStatus != null &&
    !isLiveRiderActiveStatus(job.backendStatus)
  ) {
    return false;
  }
  return true;
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
  restoreActiveDeliveries: (opts?: {
    /** Skip cancel Alert (caller already showed one). Still persists ack for new cancels. */
    suppressCancelAlert?: boolean;
  }) => Promise<void>;
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
  const { isConnected } = useNetworkConnectivity();
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
  const restoreQueuedRef = useRef(false);
  const restoreOptsRef = useRef<{ suppressCancelAlert?: boolean } | undefined>(
    undefined,
  );

  const activeJob = useMemo(
    () => pickSelectedJob(activeJobs, selectedJobId),
    [activeJobs, selectedJobId],
  );

  const trackingEnabled = !!user && activeJobs.some(isActiveJob);
  useDeliveryLocationTracking(trackingEnabled, user?.id ?? null);

  const setOnline = useCallback(async (online: boolean): Promise<boolean> => {
    setLifecyclePending(true);
    setLastLifecycleError(null);
    const result = await ordersRepository.setAvailability(online);
    setLifecyclePending(false);
    if (!result.ok) {
      // Network / JWT failure: do not invent online state or shift start.
      setLastLifecycleError(result.error.message);
      Alert.alert('Availability', result.error.message);
      return false;
    }
    const applied = applyServerAvailability({
      isOnline: result.data.isOnline,
      currentOnlineStartedAt: result.data.currentOnlineStartedAt,
    });
    setIsOnline(applied.isOnline);
    setShiftStartedAt(applied.shiftStartedAt);
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

  const restoreActiveDeliveries = useCallback(
    async (opts?: { suppressCancelAlert?: boolean }) => {
      if (opts?.suppressCancelAlert) {
        restoreOptsRef.current = { suppressCancelAlert: true };
      } else if (!restoringRef.current) {
        restoreOptsRef.current = opts;
      }

      if (restoringRef.current) {
        restoreQueuedRef.current = true;
        return;
      }

      restoringRef.current = true;
      setLifecyclePending(true);
      try {
        do {
          restoreQueuedRef.current = false;
          const runOpts = restoreOptsRef.current;
          restoreOptsRef.current = undefined;

          const [activeResult, cancelledResult] = await Promise.all([
            ordersRepository.fetchActiveOrders(),
            ordersRepository.fetchRecentCancellations(),
          ]);

          if (!activeResult.ok) {
            setLastLifecycleError(activeResult.error.message);
            continue;
          }

          const cancelledFromApi =
            cancelledResult.ok && Array.isArray(cancelledResult.data)
              ? cancelledResult.data
              : [];

          // Also honor cancelled rows if Active ever returns them (legacy / edge).
          const cancelledFromActive: AvailableOrder[] = [];
          const active: AvailableOrder[] = [];
          for (const order of activeResult.data) {
            if (isCancelledBackendStatus(order.backendStatus)) {
              cancelledFromActive.push(order);
            } else if (!isLiveRiderActiveStatus(order.backendStatus)) {
              // Available / Completed / Failed / requeued — leave Active list.
            } else {
              active.push(order);
            }
          }

          const cancelledByKey = new Map<string, AvailableOrder>();
          for (const order of [...cancelledFromApi, ...cancelledFromActive]) {
            const eventKey = cancellationAckRepository.cancellationEventKey({
              backendId: order.backendId,
              externalOrderId: order.externalOrderId,
              id: order.id,
            });
            if (!eventKey) continue;
            cancelledByKey.set(eventKey, order);
          }

          // Always restore Active jobs even if cancel-ack storage fails.
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

          const riderKey = user?.id ? String(user.id) : '';
          if (cancelledByKey.size > 0 && riderKey) {
            try {
              let durableAcked = new Set<string>();
              try {
                durableAcked =
                  await cancellationAckRepository.loadAcknowledgedCancellationKeys(
                    riderKey,
                  );
              } catch {
                durableAcked = new Set();
              }

              const sessionAlerted =
                cancellationAckRepository.getSessionCancellationAlerts(riderKey);
              const plan = planCancellationAlerts({
                eventKeys: [...cancelledByKey.keys()],
                durableAcked,
                sessionAlerted,
                suppressUiAlert: Boolean(runOpts?.suppressCancelAlert),
              });

              if (plan.keysToShowAlert.length > 0) {
                const labels = plan.keysToShowAlert
                  .map(k => {
                    const o = cancelledByKey.get(k);
                    return o?.externalOrderId || o?.id || k;
                  })
                  .join(', ');
                Alert.alert(
                  'Order cancelled',
                  plan.keysToShowAlert.length === 1
                    ? `Order ${labels} was cancelled.`
                    : `Orders cancelled: ${labels}`,
                );
                cancellationAckRepository.markSessionCancellationAlerts(
                  riderKey,
                  plan.keysToShowAlert,
                );
              }

              if (runOpts?.suppressCancelAlert && plan.keysNeedingAck.length > 0) {
                cancellationAckRepository.markSessionCancellationAlerts(
                  riderKey,
                  plan.keysNeedingAck,
                );
              }

              if (plan.keysNeedingAck.length > 0) {
                await cancellationAckRepository.acknowledgeCancellationKeys(
                  riderKey,
                  plan.keysNeedingAck,
                );
              }

              const aoIds = [...cancelledByKey.values()]
                .map(o => o.backendId)
                .filter((id): id is number => typeof id === 'number' && id > 0);
              if (aoIds.length > 0) {
                try {
                  await ordersRepository.acknowledgeCancellations(aoIds);
                } catch {
                  // ignore
                }
              }
            } catch {
              // Ack/storage failures must not undo Active job restore above.
            }
          }
        } while (restoreQueuedRef.current);
      } finally {
        setLifecyclePending(false);
        restoringRef.current = false;
        if (restoreQueuedRef.current) {
          restoreQueuedRef.current = false;
          void restoreActiveDeliveries(restoreOptsRef.current);
        }
      }
    },
    [user?.id],
  );

  // Clear rider-scoped UI state on logout / account switch
  useEffect(() => {
    if (user) return;
    void stopNativeLocationTracking();
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
        const applied = applyServerAvailability({
          isOnline: me.data.isAvailableOnline,
          currentOnlineStartedAt: me.data.currentOnlineStartedAt,
        });
        setIsOnline(applied.isOnline);
        setShiftStartedAt(applied.shiftStartedAt);
      }
      await restoreActiveDeliveries();
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, restoreActiveDeliveries]);

  // Refresh active jobs + server online interval when app returns to foreground
  useEffect(() => {
    if (!user) return;
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void (async () => {
        const me = await authRepository.fetchCurrentUser();
        if (me.ok && typeof me.data.isAvailableOnline === 'boolean') {
          const applied = applyServerAvailability({
            isOnline: me.data.isAvailableOnline,
            currentOnlineStartedAt: me.data.currentOnlineStartedAt,
          });
          setIsOnline(applied.isOnline);
          setShiftStartedAt(applied.shiftStartedAt);
        }
        await restoreActiveDeliveries();
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [user, restoreActiveDeliveries]);

  const advanceDelivery = useCallback(async (): Promise<boolean> => {
    if (!activeJob) return false;
    if (isCompletionStep(activeJob.state)) return false;

    if (!isConnected) {
      Alert.alert(
        'No connection',
        'Connect to the internet to update this delivery. Status changes are not queued offline.',
      );
      return false;
    }

    const next = getNextState(activeJob.state);
    if (!next || next === 'DELIVERED' || next === 'COMPLETED') {
      return false;
    }

    const jobId = activeJob.id;
    const backendId = activeJob.backendId;
    const previousStatus = activeJob.backendStatus;
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

    if (result.ok) {
      setLifecyclePending(false);
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
    }

    if (!isUncertainMutationFailure(result.error)) {
      setLifecyclePending(false);
      setLastLifecycleError(result.error.message);
      updateJobInList(jobId, prev => ({
        ...prev,
        pendingAction: null,
        lastError: result.error.message,
      }));
      Alert.alert('Update failed', result.error.message);
      return false;
    }

    const serverResult = await ordersRepository.fetchOrderById(backendId);
    const reconcile = reconcileStatusMutation({
      expectedBackendStatus: backendStatus,
      previousBackendStatus: previousStatus,
      serverOrder: serverResult.ok ? serverResult.data : null,
      fetchFailed: !serverResult.ok,
    });

    setLifecyclePending(false);
    updateJobInList(jobId, prev => ({
      ...prev,
      pendingAction: null,
      lastError: reconcile.kind === 'applied' ? null : reconcile.message,
    }));

    if (reconcile.kind === 'applied') {
      await restoreActiveDeliveries({ suppressCancelAlert: true });
      return true;
    }

    if (reconcile.kind === 'unchanged') {
      Alert.alert('Update not confirmed', reconcile.message);
      setLastLifecycleError(reconcile.message);
      return false;
    }

    await restoreActiveDeliveries({ suppressCancelAlert: true });
    Alert.alert(
      reconcile.kind === 'unknown' ? 'Update status unknown' : 'Update failed',
      reconcile.message,
    );
    setLastLifecycleError(reconcile.message);
    return false;
  }, [activeJob, isConnected, restoreActiveDeliveries, updateJobInList]);

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

      if (!isConnected) {
        Alert.alert(
          'No connection',
          'Connect to the internet to complete delivery and submit COD. Cash and status are not queued offline.',
        );
        return {
          ok: false,
          message: 'No connection — cash and status were not submitted.',
        };
      }

      if (activeJob.isCod) {
        const amount = opts?.cashCollectedAmount;
        if (amount == null || !Number.isFinite(amount)) {
          return {
            ok: false,
            message: 'Enter the cash amount collected.',
          };
        }
        const expected = activeJob.expectedCash;
        if (expected == null || !Number.isFinite(Number(expected))) {
          return {
            ok: false,
            message:
              'Expected COD is unknown. Contact the store before completing.',
          };
        }
        if (Number(amount) !== Number(expected)) {
          return {
            ok: false,
            message: `Collected amount must equal expected COD (${expected}).`,
          };
        }
      }

      const jobId = activeJob.id;
      const backendId = activeJob.backendId;
      const previousStatus = activeJob.backendStatus;

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

      const finishLocalCompletion = (cash?: {
        amount: number | null;
        reason: string | null;
        verified: boolean;
        message?: string;
      }) => {
        const isCod = activeJob.isCod;
        const amount =
          cash != null
            ? cash.amount
            : isCod
              ? opts?.cashCollectedAmount ?? null
              : null;
        const reason =
          cash != null
            ? cash.reason
            : isCod
              ? opts?.cashCollectedReason ?? null
              : null;
        const verified = cash != null ? cash.verified : true;

        let delivered: ActiveDeliveryJob = {
          ...activeJob,
          cashCollected: isCod ? verified : activeJob.cashCollected,
          cashCollectedAmount: isCod && verified ? amount : null,
          cashCollectedReason: isCod && verified ? reason : null,
          backendStatus: 'Completed',
          pendingAction: null,
          lastError: null,
        };
        if (isCod && !verified) {
          delivered = {
            ...delivered,
            cashCollected: false,
            cashCollectedAmount: null,
            cashCollectedReason: null,
          };
        }
        delivered = transitionJob(delivered, 'DELIVERED');
        delivered = transitionJob(delivered, 'COMPLETED');
        const timeline = buildDeliveryTimeline(delivered);
        const historyItem = jobToHistoryItem(delivered, timeline);

        setHistory(prev => [historyItem, ...prev]);
        setStats(prev => applyCompletionToStats(prev, delivered));

        setActiveJobs(prev => {
          const remaining = prev.filter(j => j.id !== delivered.id);
          const nextSelected = remaining.find(isActiveJob)?.id ?? null;
          setSelectedJobId(nextSelected);
          return remaining;
        });

        return {
          historyItem,
          ok: true as const,
          cashVerified: isCod ? verified : null,
          message: cash?.message,
        };
      };

      if (result.ok) {
        setLifecyclePending(false);
        return finishLocalCompletion();
      }

      if (!isUncertainMutationFailure(result.error)) {
        setLifecyclePending(false);
        setLastLifecycleError(result.error.message);
        updateJobInList(jobId, prev => ({
          ...prev,
          pendingAction: null,
          lastError: result.error.message,
        }));
        Alert.alert('Complete failed', result.error.message);
        return { ok: false, message: result.error.message };
      }

      const serverResult = await ordersRepository.fetchOrderById(backendId);
      const reconcile = reconcileStatusMutation({
        expectedBackendStatus: 'Completed',
        previousBackendStatus: previousStatus,
        serverOrder: serverResult.ok ? serverResult.data : null,
        fetchFailed: !serverResult.ok,
      });

      setLifecyclePending(false);
      updateJobInList(jobId, prev => ({
        ...prev,
        pendingAction: null,
        lastError: reconcile.kind === 'applied' ? null : reconcile.message,
      }));

      if (reconcile.kind === 'applied') {
        const cash = resolveCodCashAfterServerCompleted({
          isCod: activeJob.isCod,
          submittedAmount: opts?.cashCollectedAmount,
          submittedReason: opts?.cashCollectedReason,
          serverCashCollected: reconcile.order.cashCollectedAmount,
          serverCashReason: reconcile.order.cashCollectedReason,
        });
        const finished = finishLocalCompletion({
          amount: cash.amount,
          reason: cash.reason,
          verified: cash.verified,
          message: cash.message,
        });
        if (!cash.verified || cash.matchedSubmitted === false) {
          Alert.alert('Delivery completed', cash.message);
        }
        return finished;
      }

      if (reconcile.kind === 'unchanged') {
        Alert.alert('Complete not confirmed', reconcile.message);
        setLastLifecycleError(reconcile.message);
        return { ok: false, message: reconcile.message };
      }

      await restoreActiveDeliveries({ suppressCancelAlert: true });
      Alert.alert(
        reconcile.kind === 'unknown'
          ? 'Complete status unknown'
          : 'Complete failed',
        reconcile.message,
      );
      setLastLifecycleError(reconcile.message);
      return { ok: false, message: reconcile.message };
    },
    [activeJob, isConnected, restoreActiveDeliveries, updateJobInList],
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
