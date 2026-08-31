import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ListRenderItem,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSideMenu } from '../context/SideMenuContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { navigate } from '../navigation/RootNavigation';
import { APP_NAME_SHORT } from '../constants/app';
import {
  Badge,
  AppHeader,
  EmptyState,
  SearchBar,
  SectionHeader,
  StatusPill,
  SummaryCard,
  confirmDialog,
} from '../components/ui';
import { WalletTransaction } from '../delivery/sessionUpdates';
import {
  avgDeliveryFee,
  computeMonthlyWalletSummary,
  filterWalletTransactions,
  formatLastUpdated,
  suggestWithdrawAmount,
  walletTxTypeLabel,
} from '../data/walletCenter';
import { formatMoney } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type QuickAction = {
  icon: string;
  label: string;
  onPress: () => void;
};

/**
 * Rider Earnings Center — single source of truth: RiderSessionContext.wallet + stats.
 */
export default function WalletScreen() {
  const { openMenu } = useSideMenu();
  const { wallet, stats, withdrawFunds } = useRiderSession();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);

  const transactions = useMemo(
    () => filterWalletTransactions(wallet.transactions, query),
    [wallet.transactions, query],
  );

  const visibleTx = useMemo(
    () => (showAllTx ? transactions : transactions.slice(0, 8)),
    [transactions, showAllTx],
  );

  const monthly = useMemo(
    () => computeMonthlyWalletSummary(wallet, stats),
    [wallet, stats],
  );

  const avgFee = useMemo(() => avgDeliveryFee(stats), [stats]);

  const handleWithdraw = useCallback(() => {
    const amount = suggestWithdrawAmount(wallet.balance);
    if (amount <= 0) {
      Alert.alert('Withdraw', 'Insufficient available balance.');
      return;
    }
    confirmDialog({
      title: 'Confirm withdrawal',
      message: `Withdraw ${formatMoney(amount)} to your linked bank account?`,
      confirmLabel: 'Withdraw',
      onConfirm: () => {
        const ok = withdrawFunds(amount);
        if (ok) {
          Alert.alert(
            'Withdrawal successful',
            `${formatMoney(amount)} is on the way to your bank. A transaction was added.`,
          );
        } else {
          Alert.alert('Withdrawal failed', 'Could not process this amount.');
        }
      },
    });
  }, [wallet.balance, withdrawFunds]);

  const showInfo = useCallback((title: string, body: string) => {
    Alert.alert(title, body);
  }, []);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        icon: 'bank-transfer-out',
        label: 'Withdraw',
        onPress: handleWithdraw,
      },
      {
        icon: 'history',
        label: 'History',
        onPress: () => setShowAllTx(true),
      },
      {
        icon: 'gift-outline',
        label: 'Bonuses',
        onPress: () =>
          showInfo(
            'Bonuses',
            `Lifetime bonuses: ${formatMoney(wallet.bonusTotal)}. See the Bonuses section below.`,
          ),
      },
      {
        icon: 'credit-card-outline',
        label: 'Payment',
        onPress: () =>
          showInfo(
            'Payment details',
            'Bank · ****4412 · Maison Delivery Payouts.',
          ),
      },
      {
        icon: 'file-document-outline',
        label: 'Statements',
        onPress: () =>
          showInfo(
            'Statements',
            'Monthly PDF statements will appear here once available for your account.',
          ),
      },
    ],
    [handleWithdraw, showInfo, wallet.bonusTotal],
  );

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const renderTx: ListRenderItem<WalletTransaction> = useCallback(
    ({ item }) => (
      <TransactionRow
        item={item}
        expanded={expandedId === item.id}
        onToggle={() => toggleExpand(item.id)}
      />
    ),
    [expandedId, toggleExpand],
  );

  const listHeader = useMemo(
    () => (
      <View>
        {/* Balance */}
        <View
          style={styles.balanceCard}
          accessibilityRole="summary"
          accessibilityLabel={`Available ${formatMoney(wallet.balance)}, pending ${formatMoney(wallet.pending)}`}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceAmount}>{formatMoney(wallet.balance)}</Text>
          <View style={styles.balanceMetaRow}>
            <View style={styles.balanceMeta}>
              <Text style={styles.metaLabel}>Pending</Text>
              <Text style={styles.metaValue}>{formatMoney(wallet.pending)}</Text>
            </View>
            <View style={styles.balanceMeta}>
              <Text style={styles.metaLabel}>Lifetime</Text>
              <Text style={styles.metaValue}>
                {formatMoney(wallet.lifetimeEarnings)}
              </Text>
            </View>
          </View>
          <Text style={styles.updated}>
            {formatLastUpdated(wallet.lastUpdated)}
          </Text>
        </View>

        {/* Today's earnings */}
        <SectionHeader title="Today's earnings" />
        <SummaryCard
          variant="surface"
          items={[
            {
              label: 'Earned',
              value: formatMoney(stats.todayEarnings),
            },
            {
              label: 'Deliveries',
              value: String(stats.todayDeliveries),
            },
            {
              label: 'Avg fee',
              value: formatMoney(avgFee),
            },
          ]}
          style={{ marginBottom: spacing.lg }}
        />

        {/* Pending highlight */}
        <View style={styles.pendingCard}>
          <Icon name="timer-sand" size={22} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>Pending earnings</Text>
            <Text style={styles.pendingBody}>
              {formatMoney(wallet.pending)} settling to available balance.
            </Text>
          </View>
        </View>

        {/* Quick actions */}
        <SectionHeader title="Quick actions" />
        <ScrollActions actions={quickActions} />

        {/* Bonuses */}
        <SectionHeader title="Bonuses" />
        <View style={styles.bonusGrid}>
          {wallet.bonuses.map(b => (
            <View
              key={b.id}
              style={[styles.bonusCard, !b.unlocked && styles.bonusLocked]}
              accessibilityLabel={`${b.title}, ${formatMoney(b.amount)}, ${b.unlocked ? 'earned' : 'locked'}`}>
              <Text style={styles.bonusTitle}>{b.title}</Text>
              <Text style={styles.bonusAmount}>{formatMoney(b.amount)}</Text>
              <Text style={styles.bonusPeriod}>{b.period}</Text>
              <Badge
                label={b.unlocked ? 'Earned' : 'Locked'}
                tone={b.unlocked ? 'success' : 'neutral'}
              />
            </View>
          ))}
        </View>

        {/* Monthly summary */}
        <SectionHeader title="Monthly summary" />
        <View style={styles.monthCard}>
          <MonthRow label="Total earnings" value={formatMoney(monthly.totalEarnings)} />
          <MonthRow label="Withdrawn" value={formatMoney(monthly.withdrawn)} />
          <MonthRow label="Pending" value={formatMoney(monthly.pending)} />
          <MonthRow label="Bonuses" value={formatMoney(monthly.bonuses)} />
          <MonthRow label="Deliveries" value={String(monthly.deliveries)} />
          <MonthRow
            label="Avg per delivery"
            value={formatMoney(monthly.averagePerDelivery)}
          />
        </View>

        <SectionHeader title="Recent transactions" />
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions…"
          style={{ marginBottom: spacing.sm }}
        />
      </View>
    ),
    [
      wallet,
      stats,
      avgFee,
      quickActions,
      monthly,
      query,
    ],
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title="Wallet"
        showMenu
        onMenuPress={openMenu}
        rightIcon="bell-outline"
        onRightPress={() =>
          navigate('MainDrawer', { screen: 'Notifications' })
        }
      />

      <FlatList
        data={visibleTx}
        keyExtractor={item => item.id}
        renderItem={renderTx}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title={query ? 'No matching transactions' : 'No transactions yet'}
            message={
              query
                ? 'Try a different search.'
                : 'Completed deliveries will appear here.'
            }
            actionLabel={query ? 'Clear search' : undefined}
            onAction={query ? () => setQuery('') : undefined}
          />
        }
        ListFooterComponent={
          !showAllTx && transactions.length > 8 ? (
            <TouchableOpacity
              style={styles.viewAll}
              onPress={() => setShowAllTx(true)}
              accessibilityRole="button"
              accessibilityLabel="View all transactions">
              <Text style={styles.viewAllText}>View all transactions</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

function ScrollActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.actionsRow}>
      {actions.map(a => (
        <TouchableOpacity
          key={a.label}
          style={styles.actionCard}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.label}>
          <View style={styles.actionIcon}>
            <Icon name={a.icon} size={20} color={colors.primaryDark} />
          </View>
          <Text style={styles.actionLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MonthRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.monthRow}>
      <Text style={styles.monthLabel}>{label}</Text>
      <Text style={styles.monthValue}>{value}</Text>
    </View>
  );
}

const TransactionRow = memo(function TransactionRow({
  item,
  expanded,
  onToggle,
}: {
  item: WalletTransaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const positive = item.amount >= 0;
  const statusTone =
    item.status === 'completed'
      ? 'success'
      : item.status === 'pending'
        ? 'warning'
        : 'error';

  return (
    <Pressable
      style={({ pressed }) => [styles.txCard, pressed && { opacity: 0.96 }]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${item.label}, ${formatMoney(Math.abs(item.amount))}, ${item.status}`}>
      <View style={styles.txTop}>
        <View style={styles.txIcon}>
          <Icon
            name={
              item.type === 'withdrawal'
                ? 'bank-transfer-out'
                : item.type === 'bonus'
                  ? 'gift-outline'
                  : item.type === 'cod'
                    ? 'cash'
                    : 'truck-delivery'
            }
            size={18}
            color={colors.primaryDark}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txLabel}>{item.label}</Text>
          <Text style={styles.txDate}>{item.dateLabel}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={[
              styles.txAmount,
              positive ? styles.txPositive : styles.txNegative,
            ]}>
            {positive ? '+' : '-'}
            {formatMoney(Math.abs(item.amount))}
          </Text>
          <StatusPill label={item.status} tone={statusTone} />
        </View>
      </View>
      {expanded ? (
        <View style={styles.txExpanded}>
          <Text style={styles.txDesc}>{item.description}</Text>
          <View style={styles.txBadges}>
            <Badge label={walletTxTypeLabel(item.type)} tone="neutral" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  balanceCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
  },
  balanceAmount: {
    ...typography.display,
    color: colors.textOnPrimary,
    marginTop: spacing.xxs,
  },
  balanceMetaRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  balanceMeta: { flex: 1 },
  metaLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  metaValue: {
    ...typography.bodyStrong,
    color: colors.textOnPrimary,
    marginTop: 2,
  },
  updated: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.65)',
    marginTop: spacing.md,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  pendingTitle: { ...typography.bodyStrong },
  pendingBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionCard: {
    width: '30%',
    flexGrow: 1,
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: TOUCH_TARGET + 24,
    ...elevation.small,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bonusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  bonusCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...elevation.small,
  },
  bonusLocked: { opacity: 0.7 },
  bonusTitle: { ...typography.bodyStrong, marginBottom: 4 },
  bonusAmount: {
    ...typography.title,
    color: colors.success,
  },
  bonusPeriod: {
    ...typography.caption,
    marginVertical: spacing.xs,
  },
  monthCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 36,
    alignItems: 'center',
  },
  monthLabel: { ...typography.body, color: colors.textSecondary },
  monthValue: { ...typography.bodyStrong },
  txCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
  },
  txTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLabel: { ...typography.bodyStrong },
  txDate: { ...typography.caption, marginTop: 2 },
  txAmount: { ...typography.bodyStrong, marginBottom: 4 },
  txPositive: { color: colors.success },
  txNegative: { color: colors.primaryDark },
  txExpanded: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  txDesc: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  txBadges: { flexDirection: 'row' },
  viewAll: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
  viewAllText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
});
