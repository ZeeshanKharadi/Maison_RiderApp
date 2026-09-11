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
import { useRiderSession } from './RiderSessionContext';

type AcceptResult = { ok: boolean; message?: string };

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
  const { acceptOrderAsJob, activeJobs, isOnline } = useRiderSession();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const removedIdsRef = useRef<Set<string>>(new Set());
  const removedBackendIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const job of activeJobs) {
      removedIdsRef.current.add(job.id);
      removedBackendIdsRef.current.add(job.backendId);
    }
    if (activeJobs.length > 0) {
      setOrders(prev =>
        prev.filter(
          o =>
            !activeJobs.some(
              j =>
                j.id === o.id ||
                (o.backendId != null && j.backendId === o.backendId),
            ),
        ),
      );
    }
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

  const acceptOrder = useCallback(
    async (order: AvailableOrder): Promise<AcceptResult> => {
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

      setAccepting(true);
      const result = await ordersRepository.updateOrderStatus(order.backendId, {
        status: 'Accepted',
      });
      setAccepting(false);

      if (!result.ok) {
        Alert.alert('Accept failed', result.error.message);
        return { ok: false, message: result.error.message };
      }

      try {
        acceptOrderAsJob({
          ...order,
          backendStatus: 'Accepted',
          acceptedAt: order.acceptedAt || new Date().toISOString(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not add active job';
        Alert.alert('Accept failed', message);
        return { ok: false, message };
      }

      removedIdsRef.current.add(order.id);
      removedBackendIdsRef.current.add(order.backendId);
      setOrders(prev =>
        prev.filter(
          o =>
            o.id !== order.id &&
            !(order.backendId != null && o.backendId === order.backendId),
        ),
      );
      return { ok: true };
    },
    [acceptOrderAsJob, activeJobs, isOnline],
  );

  const rejectOrder = useCallback(
    async (
      order: AvailableOrder,
      reason: RejectReason,
    ): Promise<AcceptResult> => {
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

      removedIdsRef.current.add(order.id);
      removedBackendIdsRef.current.add(order.backendId);
      setOrders(prev =>
        prev.filter(
          o =>
            o.id !== order.id &&
            !(order.backendId != null && o.backendId === order.backendId),
        ),
      );
      return { ok: true };
    },
    [],
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
    setOrders(
      result.data.filter(
        o =>
          !removedIdsRef.current.has(o.id) &&
          !(
            o.backendId != null &&
            removedBackendIdsRef.current.has(o.backendId)
          ),
      ),
    );
    setLoading(false);
  }, []);

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
