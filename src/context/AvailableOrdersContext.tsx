import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import {
  AvailableOrder,
  RejectReason,
} from '../data/orders';
import * as ordersRepository from '../repositories/ordersRepository';
import {
  isUncertainAcceptFailure,
  localJobInsertRecoveryResult,
  reconcileAcceptAfterUncertainty,
} from '../utils/acceptReconciliation';
import { applyAuthoritativeAvailableOrders } from '../utils/availableOrdersSync';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import { useRiderSession } from './RiderSessionContext';

type AcceptResult = { ok: boolean; message?: string; retryable?: boolean };

type AvailableOrdersContextValue = {
  orders: AvailableOrder[];
  loading: boolean;
  error: string | null;
  accepting: boolean;
  getOrderById: (id: string) => AvailableOrder | undefined;
  resolveOrder: (
    id: string,
    backendId?: number,
  ) => Promise<AvailableOrder | undefined>;
  acceptOrder: (order: AvailableOrder) => Promise<AcceptResult>;
  rejectOrder: (order: AvailableOrder, reason: RejectReason) => Promise<AcceptResult>;
  refreshOrders: () => Promise<void>;
};

const AvailableOrdersContext =
  createContext<AvailableOrdersContextValue | null>(null);

const MAX_ACTIVE = 5;

export function AvailableOrdersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { acceptOrderAsJob, activeJobs, isOnline, restoreActiveDeliveries, selectActiveJob } =
    useRiderSession();
  const { isConnected } = useNetworkConnectivity();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const acceptingRef = useRef(false);
  const activeJobsRef = useRef(activeJobs);
  activeJobsRef.current = activeJobs;

  // Drop rows that became this rider's active job without waiting for refresh.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    setOrders(prev => applyAuthoritativeAvailableOrders(prev, activeJobs));
  }, [activeJobs]);

  const getOrderById = useCallback(
    (id: string) => {
      const key = id.trim();
      return orders.find(
        o =>
          o.id === key ||
          o.externalOrderId === key ||
          (o.backendId != null && String(o.backendId) === key),
      );
    },
    [orders],
  );

  const resolveOrder = useCallback(
    async (id: string, backendId?: number) => {
      const local = getOrderById(id);
      if (local) return local;

      const pk =
        backendId ??
        (/^\d+$/.test(id.trim()) ? Number(id.trim()) : undefined);
      if (pk == null || !Number.isFinite(pk)) return undefined;

      const result = await ordersRepository.fetchOrderById(pk);
      if (!result.ok) return undefined;
      return result.data;
    },
    [getOrderById],
  );

  const refreshOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await ordersRepository.fetchAvailableOrders();
    if (!result.ok) {
      setError(result.error.message);
      setOrders([]);
      setLoading(false);
      return;
    }
    // Server Available is authoritative (requeue can return a previously accepted id).
    setOrders(
      applyAuthoritativeAvailableOrders(result.data, activeJobsRef.current),
    );
    setLoading(false);
  }, []);

  const acceptOrder = useCallback(
    async (order: AvailableOrder): Promise<AcceptResult> => {
      if (acceptingRef.current) {
        return {
          ok: false,
          message: 'Accept already in progress.',
          retryable: false,
        };
      }
      if (!isConnected) {
        const message =
          'No connection. Connect to the internet to accept orders. Accepts are not queued offline.';
        Alert.alert('No connection', message);
        return { ok: false, message, retryable: false };
      }
      if (!isOnline) {
        const message = 'Go online before accepting orders.';
        Alert.alert('Offline', message);
        return { ok: false, message };
      }
      if (order.backendId == null) {
        const message = 'Order is missing a server id and cannot be accepted.';
        Alert.alert('Accept failed', message);
        return { ok: false, message };
      }

      const alreadyActive = activeJobs.some(
        j => j.backendId === order.backendId || j.id === order.id,
      );
      if (!alreadyActive && activeJobs.length >= MAX_ACTIVE) {
        const message = 'You can carry up to 5 active orders at once.';
        Alert.alert('Order limit', message);
        return { ok: false, message };
      }

      const recoverFromLocalJobInsertFailure = async (
        localErr: unknown,
      ): Promise<AcceptResult> => {
        const localMessage =
          localErr instanceof Error ? localErr.message : 'Could not add active job';

        await restoreActiveDeliveries({ suppressCancelAlert: true });

        const [activeResult, availableResult] = await Promise.all([
          ordersRepository.fetchActiveOrders(),
          ordersRepository.fetchAvailableOrders(),
        ]);

        const serverCheckFailed = !activeResult.ok && !availableResult.ok;
        const outcome = reconcileAcceptAfterUncertainty(
          order,
          activeResult.ok ? activeResult.data : [],
          availableResult.ok ? availableResult.data : [],
        );
        const recovery = localJobInsertRecoveryResult(outcome, localMessage, {
          serverCheckFailed,
        });

        if (availableResult.ok) {
          const activeRefs = (activeResult.ok ? activeResult.data : [])
            .filter(o => o.backendId != null)
            .map(o => ({ id: o.id, backendId: o.backendId! }));
          setOrders(
            applyAuthoritativeAvailableOrders(availableResult.data, activeRefs),
          );
        }

        if (recovery.showAsAccepted) {
          selectActiveJob(outcome.kind === 'accepted' ? outcome.order.id : order.id);
          return { ok: true };
        }

        Alert.alert(recovery.alertTitle, recovery.message);
        return {
          ok: false,
          message: recovery.message,
          retryable: recovery.retryable,
        };
      };

      acceptingRef.current = true;
      setAccepting(true);
      try {
        const result = await ordersRepository.updateOrderStatus(order.backendId, {
          status: 'Accepted',
        });

        if (result.ok) {
          try {
            acceptOrderAsJob({
              ...order,
              backendStatus: 'Accepted',
              acceptedAt: order.acceptedAt || new Date().toISOString(),
            });
          } catch (err) {
            return recoverFromLocalJobInsertFailure(err);
          }

          setOrders(prev =>
            prev.filter(
              o =>
                o.id !== order.id &&
                !(order.backendId != null && o.backendId === order.backendId),
            ),
          );
          return { ok: true };
        }

        if (!isUncertainAcceptFailure(result.error)) {
          Alert.alert('Accept failed', result.error.message);
          return { ok: false, message: result.error.message };
        }

        const [activeResult, availableResult] = await Promise.all([
          ordersRepository.fetchActiveOrders(),
          ordersRepository.fetchAvailableOrders(),
        ]);

        if (availableResult.ok) {
          setOrders(
            applyAuthoritativeAvailableOrders(
              availableResult.data,
              activeJobsRef.current,
            ),
          );
        }

        if (!activeResult.ok && !availableResult.ok) {
          const message = `${result.error.message} Could not verify Active or Available after the uncertain accept.`;
          Alert.alert('Accept status unknown', message);
          return { ok: false, message, retryable: false };
        }

        const outcome = reconcileAcceptAfterUncertainty(
          order,
          activeResult.ok ? activeResult.data : [],
          availableResult.ok ? availableResult.data : [],
        );

        if (outcome.kind === 'accepted') {
          try {
            acceptOrderAsJob({
              ...outcome.order,
              backendStatus: outcome.order.backendStatus || 'Accepted',
              acceptedAt:
                outcome.order.acceptedAt || new Date().toISOString(),
            });
          } catch (err) {
            return recoverFromLocalJobInsertFailure(err);
          }
          if (availableResult.ok && outcome.order.backendId != null) {
            setOrders(
              applyAuthoritativeAvailableOrders(availableResult.data, [
                ...activeJobsRef.current,
                {
                  id: outcome.order.id,
                  backendId: outcome.order.backendId,
                },
              ]),
            );
          }
          return { ok: true };
        }

        if (outcome.kind === 'available') {
          const message =
            'Accept did not complete. The order is still Available — you can try again.';
          Alert.alert('Accept not confirmed', message);
          return { ok: false, message, retryable: true };
        }

        if (outcome.kind === 'other') {
          Alert.alert('Accept failed', outcome.message);
          return { ok: false, message: outcome.message, retryable: false };
        }

        const message = `${result.error.message} ${outcome.message}`;
        Alert.alert('Accept status unknown', message);
        return { ok: false, message, retryable: false };
      } finally {
        acceptingRef.current = false;
        setAccepting(false);
      }
    },
    [
      acceptOrderAsJob,
      activeJobs,
      isOnline,
      isConnected,
      restoreActiveDeliveries,
      selectActiveJob,
    ],
  );

  const rejectOrder = useCallback(
    async (
      order: AvailableOrder,
      reason: RejectReason,
    ): Promise<AcceptResult> => {
      if (!isConnected) {
        const message =
          'No connection. Connect to the internet to reject orders. Rejects are not queued offline.';
        Alert.alert('No connection', message);
        return { ok: false, message, retryable: false };
      }
      if (order.backendId == null) {
        const message = 'Order is missing a server id and cannot be rejected.';
        Alert.alert('Reject failed', message);
        return { ok: false, message };
      }

      const result = await ordersRepository.rejectOrder(order.backendId, {
        reason,
      });
      if (!result.ok) {
        Alert.alert('Reject failed', result.error.message);
        return { ok: false, message: result.error.message };
      }

      // Optimistic hide. Backend omits this rider's rejects until requeue clears them.
      setOrders(prev =>
        prev.filter(
          o =>
            o.id !== order.id &&
            !(order.backendId != null && o.backendId === order.backendId),
        ),
      );
      return { ok: true };
    },
    [isConnected],
  );

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const value = useMemo(
    () => ({
      orders,
      loading,
      error,
      accepting,
      getOrderById,
      resolveOrder,
      acceptOrder,
      rejectOrder,
      refreshOrders,
    }),
    [
      orders,
      loading,
      error,
      accepting,
      getOrderById,
      resolveOrder,
      acceptOrder,
      rejectOrder,
      refreshOrders,
    ],
  );

  return (
    <AvailableOrdersContext.Provider value={value}>
      {children}
    </AvailableOrdersContext.Provider>
  );
}

export function useAvailableOrders() {
  const ctx = useContext(AvailableOrdersContext);
  if (!ctx) {
    throw new Error(
      'useAvailableOrders must be used within AvailableOrdersProvider',
    );
  }
  return ctx;
}
