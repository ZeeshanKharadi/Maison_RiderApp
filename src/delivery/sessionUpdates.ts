import {
  DeliveryHistoryItem,
} from '../data/deliveryHistory';
import { ActiveDeliveryJob, estimateDurationMin } from './types';
import { DeliveryTimelineStep } from './types';

export type WalletTxType =
  | 'delivery'
  | 'cod'
  | 'bonus'
  | 'withdrawal'
  | 'adjustment';

export type WalletTxStatus = 'completed' | 'pending' | 'failed';

export type WalletTransaction = {
  id: string;
  label: string;
  description: string;
  amount: number;
  dateLabel: string;
  createdAt: string;
  type: WalletTxType;
  status: WalletTxStatus;
};

export type WalletBonus = {
  id: string;
  title: string;
  amount: number;
  period: string;
  unlocked: boolean;
};

export type WalletState = {
  balance: number;
  pending: number;
  lifetimeEarnings: number;
  bonusTotal: number;
  lastUpdated: string;
  bonuses: WalletBonus[];
  transactions: WalletTransaction[];
};

export type SessionStats = {
  todayDeliveries: number;
  todayEarnings: number;
  todayRating: number;
  hoursWorked: number;
  weeklyDeliveries: number;
  monthlyDeliveries: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  completionRate: number;
  onTimeRate: number;
  acceptanceRate: number;
  lateDeliveries: number;
  totalEarnings: number;
  streak: number;
  ranking: number;
  teamAverageRank: number;
  topRiderRank: number;
};

export const INITIAL_WALLET: WalletState = {
  balance: 0,
  pending: 0,
  lifetimeEarnings: 0,
  bonusTotal: 0,
  lastUpdated: new Date().toISOString(),
  bonuses: [],
  transactions: [],
};

export const INITIAL_SESSION_STATS: SessionStats = {
  todayDeliveries: 0,
  todayEarnings: 0,
  todayRating: 0,
  hoursWorked: 0,
  weeklyDeliveries: 0,
  monthlyDeliveries: 0,
  weeklyEarnings: 0,
  monthlyEarnings: 0,
  completionRate: 0,
  onTimeRate: 0,
  acceptanceRate: 0,
  lateDeliveries: 0,
  totalEarnings: 0,
  streak: 0,
  ranking: 0,
  teamAverageRank: 0,
  topRiderRank: 0,
};

export function jobToHistoryItem(
  job: ActiveDeliveryJob,
  timeline: DeliveryTimelineStep[],
): DeliveryHistoryItem {
  const tip = job.tip || (job.isCod ? 0 : 2.5);
  const deliveredAt = new Date().toISOString();
  return {
    id: job.id,
    restaurant: job.restaurant,
    customerName: job.customerName,
    pickupAddress: job.pickupAddress,
    dropoffAddress: job.dropoffAddress,
    deliveredAt,
    orderAmount: job.orderAmount,
    deliveryFee: job.deliveryFee,
    tip,
    distanceMiles: job.distanceMiles,
    durationMin: estimateDurationMin(job),
    items: job.items,
    rating: 5,
    paymentMethod: job.paymentMethod,
    status: 'delivered',
    imageColor: job.imageColor,
    isCod: job.isCod,
    express: job.express,
    priority: false,
    fragile: job.fragile,
    packageInfo: job.packageInfo,
    specialInstructions: job.specialInstructions,
    deliveryNotes: job.isCod ? 'COD collected on delivery.' : undefined,
    cashCollected: job.isCod ? true : null,
    timeline: timeline.map(step => ({
      ...step,
      status: 'done' as const,
      at: step.at ?? deliveredAt,
    })),
  };
}

export function applyCompletionToWallet(
  wallet: WalletState,
  job: ActiveDeliveryJob,
): WalletState {
  const tip = job.tip || (job.isCod ? 0 : 2.5);
  const earned = job.deliveryFee + tip;
  const now = new Date().toISOString();
  const tx: WalletTransaction = {
    id: `tx-${job.id}-${Date.now()}`,
    label: job.isCod ? 'COD Settlement' : 'Delivery Payment',
    description: `${job.id} · ${job.restaurant}`,
    amount: earned,
    dateLabel: 'Just now',
    createdAt: now,
    type: job.isCod ? 'cod' : 'delivery',
    status: 'completed',
  };
  return {
    ...wallet,
    balance: Number((wallet.balance + earned).toFixed(2)),
    pending: Number((wallet.pending + earned).toFixed(2)),
    lifetimeEarnings: Number((wallet.lifetimeEarnings + earned).toFixed(2)),
    lastUpdated: now,
    transactions: [tx, ...wallet.transactions],
  };
}

/** Mock withdraw — moves available balance to a withdrawal transaction. */
export function applyWithdrawal(
  wallet: WalletState,
  amount: number,
): WalletState | null {
  if (amount <= 0 || amount > wallet.balance) return null;
  const now = new Date().toISOString();
  const tx: WalletTransaction = {
    id: `tx-wd-${Date.now()}`,
    label: 'Withdrawal',
    description: `Bank transfer · ${formatMoneyPlain(amount)}`,
    amount: -amount,
    dateLabel: 'Just now',
    createdAt: now,
    type: 'withdrawal',
    status: 'completed',
  };
  return {
    ...wallet,
    balance: Number((wallet.balance - amount).toFixed(2)),
    pending: Math.max(0, Number((wallet.pending - amount * 0.1).toFixed(2))),
    lastUpdated: now,
    transactions: [tx, ...wallet.transactions],
  };
}

function formatMoneyPlain(n: number) {
  return `$${n.toFixed(2)}`;
}

export function applyCompletionToStats(
  stats: SessionStats,
  job: ActiveDeliveryJob,
): SessionStats {
  const tip = job.tip || (job.isCod ? 0 : 2.5);
  const earned = job.deliveryFee + tip;
  const todayDeliveries = stats.todayDeliveries + 1;
  const weeklyDeliveries = stats.weeklyDeliveries + 1;
  const monthlyDeliveries = stats.monthlyDeliveries + 1;
  const ranking = Math.max(1, stats.ranking - (stats.ranking > 5 ? 1 : 0));
  return {
    ...stats,
    todayDeliveries,
    todayEarnings: Number((stats.todayEarnings + earned).toFixed(2)),
    weeklyDeliveries,
    monthlyDeliveries,
    weeklyEarnings: Number((stats.weeklyEarnings + earned).toFixed(2)),
    monthlyEarnings: Number((stats.monthlyEarnings + earned).toFixed(2)),
    totalEarnings: Number((stats.totalEarnings + earned).toFixed(2)),
    completionRate: Math.min(100, Number((stats.completionRate + 0.1).toFixed(1))),
    onTimeRate: Math.min(100, Number((stats.onTimeRate + 0.05).toFixed(1))),
    acceptanceRate: Math.min(100, Number((stats.acceptanceRate + 0.05).toFixed(1))),
    streak: stats.streak + 1,
    ranking,
    todayRating: Number(
      (
        (stats.todayRating * stats.todayDeliveries + 5) /
        todayDeliveries
      ).toFixed(2),
    ),
  };
}
