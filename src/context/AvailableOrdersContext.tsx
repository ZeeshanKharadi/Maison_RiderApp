import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AvailableOrder,
  RejectReason,
} from '../data/orders';
import { saveRejectedOrder } from '../data/rejectStorage';
import * as ordersRepository from '../repositories/ordersRepository';
import { useRiderSession } from './RiderSessionContext';

type AvailableOrdersContextValue = {
  orders: AvailableOrder[];
  loading: boolean;
  error: string | null;
  getOrderById: (id: string) => AvailableOrder | undefined;
  acceptOrder: (order: AvailableOrder) => void;
  rejectOrder: (order: AvailableOrder, reason: RejectReason) => Promise<void>;
  refreshOrders: () => Promise<void>;
};

const AvailableOrdersContext =
  createContext<AvailableOrdersContextValue | null>(null);

export function AvailableOrdersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { acceptOrderAsJob, activeJobs } = useRiderSession();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const removedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const job of activeJobs) {
      removedIdsRef.current.add(job.id);
    }
    if (activeJobs.length > 0) {
      setOrders(prev =>
        prev.filter(o => !activeJobs.some(j => j.id === o.id)),
      );
    }
  }, [activeJobs]);

  const getOrderById = useCallback(
    (id: string) => orders.find(o => o.id === id),
    [orders],
  );

  const acceptOrder = useCallback(
    (order: AvailableOrder) => {
      acceptOrderAsJob(order);
      removedIdsRef.current.add(order.id);
      setOrders(prev => prev.filter(o => o.id !== order.id));
    },
    [acceptOrderAsJob],
  );

  const rejectOrder = useCallback(
    async (order: AvailableOrder, reason: RejectReason) => {
      await saveRejectedOrder({
        orderId: order.id,
        reason,
        rejectedAt: new Date().toISOString(),
        restaurant: order.restaurant,
      });
      removedIdsRef.current.add(order.id);
      setOrders(prev => prev.filter(o => o.id !== order.id));
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
      result.data.filter(o => !removedIdsRef.current.has(o.id)),
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
      getOrderById,
      acceptOrder,
      rejectOrder,
      refreshOrders,
    }),
    [
      orders,
      loading,
      error,
      getOrderById,
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
