import { DeliveryHistoryItem } from './deliveryHistory';
import { startOfDay } from '../utils/format';

export type HistoryDateRange =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'month'
  | 'custom';

export type HistorySortKey =
  | 'newest'
  | 'oldest'
  | 'highest_amount'
  | 'lowest_amount'
  | 'longest_distance'
  | 'shortest_distance';

export type HistoryFilters = {
  dateRange: HistoryDateRange;
  payment: 'all' | 'card' | 'cash' | 'wallet' | 'cod';
  expressOnly: boolean;
  priorityOnly: boolean;
  status: 'all' | 'completed' | 'cancelled';
  sort: HistorySortKey;
};

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  dateRange: 'all',
  payment: 'all',
  expressOnly: false,
  priorityOnly: false,
  status: 'all',
  sort: 'newest',
};

function inDateRange(iso: string, range: HistoryDateRange, now = new Date()) {
  if (range === 'all' || range === 'custom') return true;
  const d = new Date(iso);
  const today = startOfDay(now);
  if (range === 'today') return d >= today;
  if (range === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return d >= y && d < today;
  }
  if (range === 'last7') {
    // Exactly 7 calendar days ending today (today and the prior 6 days).
    const week = new Date(today);
    week.setDate(week.getDate() - 6);
    return d >= week;
  }
  const month = new Date(today);
  month.setDate(month.getDate() - 30);
  return d >= month;
}

function riderEarning(item: DeliveryHistoryItem): number | null {
  const fee = item.deliveryFee;
  const tip = item.tip ?? 0;
  if (fee == null || !Number.isFinite(fee)) return null;
  return fee + (Number.isFinite(tip) ? tip : 0);
}

export function filterAndSortHistory(
  items: DeliveryHistoryItem[],
  query: string,
  filters: HistoryFilters,
): DeliveryHistoryItem[] {
  const q = query.trim().toLowerCase();

  let list = items.filter(item => {
    if (q) {
      const hay = [
        item.id,
        item.customerName,
        item.restaurant,
        item.pickupAddress,
        item.dropoffAddress,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!inDateRange(item.deliveredAt, filters.dateRange)) return false;
    if (filters.status === 'completed' && item.status !== 'delivered') {
      return false;
    }
    if (filters.status === 'cancelled' && item.status !== 'cancelled') {
      return false;
    }
    if (filters.payment === 'cod' && !item.isCod) return false;
    if (
      filters.payment !== 'all' &&
      filters.payment !== 'cod' &&
      item.paymentMethod !== filters.payment
    ) {
      return false;
    }
    if (filters.expressOnly && !item.express) return false;
    if (filters.priorityOnly && !item.priority) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    switch (filters.sort) {
      case 'oldest':
        return (
          new Date(a.deliveredAt).getTime() - new Date(b.deliveredAt).getTime()
        );
      case 'highest_amount':
        // Order total is supplied by the API; rider fee/tip often are not.
        return b.orderAmount - a.orderAmount;
      case 'lowest_amount':
        return a.orderAmount - b.orderAmount;
      case 'longest_distance':
        return (b.distanceMiles ?? -1) - (a.distanceMiles ?? -1);
      case 'shortest_distance':
        return (
          (a.distanceMiles ?? Number.POSITIVE_INFINITY) -
          (b.distanceMiles ?? Number.POSITIVE_INFINITY)
        );
      case 'newest':
      default:
        return (
          new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
        );
    }
  });

  return list;
}

export type HistoryArchiveStats = {
  /** Delivered rows in the given set (loaded and/or filtered — not a server grand total). */
  deliveredCount: number;
  cancelledCount: number;
  todayDeliveries: number;
  weeklyDeliveries: number;
  monthlyDeliveries: number;
  avgRating: number | null;
  avgDeliveryTime: number | null;
  completionRate: number | null;
  hasEarnings: boolean;
  totalEarnings: number | null;
  todayEarnings: number | null;
  highestEarning: number | null;
  hasDistance: boolean;
  longestDistance: number | null;
  /** COD trip count — not earnings. */
  codDeliveries: number;
  /** Sum of server-verified COD cash on delivered COD rows. */
  hasCodAmounts: boolean;
  totalCodCollected: number | null;
  cardDeliveries: number;
  shortestDeliveryMin: number | null;
};

export function computeHistoryArchiveStats(
  items: DeliveryHistoryItem[],
  now = new Date(),
): HistoryArchiveStats {
  const today = startOfDay(now);
  const week = new Date(today);
  week.setDate(week.getDate() - 6);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const delivered = items.filter(i => i.status === 'delivered');
  const cancelled = items.filter(i => i.status === 'cancelled');
  const todayItems = delivered.filter(i => new Date(i.deliveredAt) >= today);
  const weekItems = delivered.filter(i => new Date(i.deliveredAt) >= week);
  const monthItems = delivered.filter(i => new Date(i.deliveredAt) >= month);

  const earnings = delivered
    .map(riderEarning)
    .filter((v): v is number => v != null);
  const hasEarnings = earnings.length > 0;

  const distances = delivered
    .map(i => i.distanceMiles)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const hasDistance = distances.length > 0;

  const rated = delivered.filter(i => i.rating != null);
  const timed = delivered.filter(i => i.durationMin > 0);

  const denom = delivered.length + cancelled.length;
  const completionRate =
    denom > 0 ? Math.round((delivered.length / denom) * 100) : null;

  const codWithAmount = delivered.filter(
    i =>
      i.isCod &&
      i.cashCollectedAmount != null &&
      Number.isFinite(i.cashCollectedAmount),
  );
  const hasCodAmounts = codWithAmount.length > 0;
  const totalCodCollected = hasCodAmounts
    ? codWithAmount.reduce((s, i) => s + (i.cashCollectedAmount ?? 0), 0)
    : null;

  const todayEarnings = hasEarnings
    ? todayItems.reduce((s, i) => s + (riderEarning(i) ?? 0), 0)
    : null;

  const durations = timed.map(i => i.durationMin);

  return {
    deliveredCount: delivered.length,
    cancelledCount: cancelled.length,
    todayDeliveries: todayItems.length,
    weeklyDeliveries: weekItems.length,
    monthlyDeliveries: monthItems.length,
    avgRating:
      rated.length > 0
        ? rated.reduce((s, i) => s + (i.rating || 0), 0) / rated.length
        : null,
    avgDeliveryTime:
      timed.length > 0
        ? timed.reduce((s, i) => s + i.durationMin, 0) / timed.length
        : null,
    completionRate,
    hasEarnings,
    totalEarnings: hasEarnings
      ? earnings.reduce((s, v) => s + v, 0)
      : null,
    todayEarnings,
    highestEarning: hasEarnings ? Math.max(...earnings) : null,
    hasDistance,
    longestDistance: hasDistance ? Math.max(...distances) : null,
    codDeliveries: delivered.filter(i => i.isCod).length,
    hasCodAmounts,
    totalCodCollected,
    cardDeliveries: delivered.filter(i => i.paymentMethod === 'card').length,
    shortestDeliveryMin: durations.length ? Math.min(...durations) : null,
  };
}

export function countActiveHistoryFilters(filters: HistoryFilters): number {
  let n = 0;
  if (filters.dateRange !== 'all') n += 1;
  if (filters.payment !== 'all') n += 1;
  if (filters.expressOnly) n += 1;
  if (filters.priorityOnly) n += 1;
  if (filters.status !== 'all') n += 1;
  if (filters.sort !== 'newest') n += 1;
  return n;
}

/** Merge pages without duplicating ids (newer page wins order). */
export function mergeHistoryPages(
  existing: DeliveryHistoryItem[],
  incoming: DeliveryHistoryItem[],
): DeliveryHistoryItem[] {
  if (existing.length === 0) return incoming;
  const seen = new Set(existing.map(i => i.id));
  const appended = incoming.filter(i => !seen.has(i.id));
  return [...existing, ...appended];
}
