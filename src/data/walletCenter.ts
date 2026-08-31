import { SessionStats, WalletState, WalletTransaction } from '../delivery/sessionUpdates';
import { formatMoney } from '../utils/format';

export type WalletMonthlySummary = {
  totalEarnings: number;
  withdrawn: number;
  pending: number;
  bonuses: number;
  deliveries: number;
  averagePerDelivery: number;
};

export function computeMonthlyWalletSummary(
  wallet: WalletState,
  stats: SessionStats,
): WalletMonthlySummary {
  const withdrawn = wallet.transactions
    .filter(t => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const deliveries = stats.monthlyDeliveries;
  const totalEarnings = stats.monthlyEarnings;
  const averagePerDelivery =
    deliveries > 0 ? totalEarnings / deliveries : 0;

  return {
    totalEarnings,
    withdrawn,
    pending: wallet.pending,
    bonuses: wallet.bonusTotal,
    deliveries,
    averagePerDelivery,
  };
}

export function filterWalletTransactions(
  transactions: WalletTransaction[],
  query: string,
): WalletTransaction[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...transactions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return transactions
    .filter(t => {
      const hay = [t.label, t.description, t.type, t.status]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function walletTxTypeLabel(type: WalletTransaction['type']): string {
  switch (type) {
    case 'delivery':
      return 'Delivery Payment';
    case 'cod':
      return 'COD Settlement';
    case 'bonus':
      return 'Bonus';
    case 'withdrawal':
      return 'Withdrawal';
    case 'adjustment':
      return 'Adjustment';
    default:
      return 'Transaction';
  }
}

export function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  return `Updated ${d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function suggestWithdrawAmount(balance: number): number {
  if (balance <= 0) return 0;
  // Withdraw most available, leave a small cushion for demo realism
  return Number(Math.max(0, balance - 20).toFixed(2));
}

export function avgDeliveryFee(stats: SessionStats): number {
  if (stats.todayDeliveries <= 0) return 0;
  return stats.todayEarnings / stats.todayDeliveries;
}

export { formatMoney };
