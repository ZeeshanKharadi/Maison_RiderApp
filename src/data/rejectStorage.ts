import AsyncStorage from '@react-native-async-storage/async-storage';
import { RejectReason } from './orders';

const STORAGE_KEY = '@rapid_delivery/rejected_orders';

export type RejectedOrderRecord = {
  orderId: string;
  reason: RejectReason;
  rejectedAt: string;
  restaurant?: string;
};

export async function loadRejectedOrders(): Promise<RejectedOrderRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RejectedOrderRecord[];
  } catch {
    return [];
  }
}

export async function saveRejectedOrder(
  record: RejectedOrderRecord,
): Promise<void> {
  const existing = await loadRejectedOrders();
  const next = [record, ...existing].slice(0, 100);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
