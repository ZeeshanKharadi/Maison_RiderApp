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
    const week = new Date(today);
    week.setDate(week.getDate() - 7);
    return d >= week;
  }
  const month = new Date(today);
  month.setDate(month.getDate() - 30);
  return d >= month;
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
        return b.deliveryFee + b.tip - (a.deliveryFee + a.tip);
      case 'lowest_amount':
        return a.deliveryFee + a.tip - (b.deliveryFee + b.tip);
      case 'longest_distance':
        return b.distanceMiles - a.distanceMiles;
      case 'shortest_distance':
        return a.distanceMiles - b.distanceMiles;
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
  todayDeliveries: number;
  todayEarnings: number;
  weeklyDeliveries: number;
  monthlyDeliveries: number;
  avgRating: number;
  avgDeliveryTime: number;
  completionRate: number;
  totalDeliveries: number;
  totalEarnings: number;
  codDeliveries: number;
  cardDeliveries: number;
  highestEarning: number;
  longestDistance: number;
  shortestDeliveryMin: number;
};

export function computeHistoryArchiveStats(
  items: DeliveryHistoryItem[],
  now = new Date(),
): HistoryArchiveStats {
  const today = startOfDay(now);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const delivered = items.filter(i => i.status === 'delivered');
  const cancelled = items.filter(i => i.status === 'cancelled');
  const todayItems = delivered.filter(i => new Date(i.deliveredAt) >= today);
  const weekItems = delivered.filter(i => new Date(i.deliveredAt) >= week);
  const monthItems = delivered.filter(i => new Date(i.deliveredAt) >= month);

  const earn = (i: DeliveryHistoryItem) => i.deliveryFee + i.tip;
  const rated = delivered.filter(i => i.rating != null);
  const timed = delivered.filter(i => i.durationMin > 0);

  const totalEarnings = delivered.reduce((s, i) => s + earn(i), 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((s, i) => s + (i.rating || 0), 0) / rated.length
      : 0;
  const avgDeliveryTime =
    timed.length > 0
      ? timed.reduce((s, i) => s + i.durationMin, 0) / timed.length
      : 0;

  const denom = delivered.length + cancelled.length;
  const completionRate =
    denom > 0 ? Math.round((delivered.length / denom) * 100) : 100;

  const earningsList = delivered.map(earn);
  const distances = delivered.map(i => i.distanceMiles);
  const durations = timed.map(i => i.durationMin);

  return {
    todayDeliveries: todayItems.length,
    todayEarnings: todayItems.reduce((s, i) => s + earn(i), 0),
    weeklyDeliveries: weekItems.length,
    monthlyDeliveries: monthItems.length,
    avgRating,
    avgDeliveryTime,
    completionRate,
    totalDeliveries: delivered.length,
    totalEarnings,
    codDeliveries: delivered.filter(i => i.isCod).length,
    cardDeliveries: delivered.filter(i => i.paymentMethod === 'card').length,
    highestEarning: earningsList.length ? Math.max(...earningsList) : 0,
    longestDistance: distances.length ? Math.max(...distances) : 0,
    shortestDeliveryMin: durations.length ? Math.min(...durations) : 0,
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
