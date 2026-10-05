import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppState, AppStateStatus } from 'react-native';
import { useSideMenu } from '../context/SideMenuContext';
import { useAuth } from '../services/AuthContext';
import {
  AppHeader,
  AppButton,
  EmptyState,
  SectionHeader,
} from '../components/ui';
import {
  fetchFinancePage,
  RiderFinanceSummary,
  RiderFinanceTransaction,
} from '../repositories/financeRepository';
import {
  acknowledgeFloat,
  fetchFloatSummary,
  FloatSummary,
} from '../repositories/floatRepository';
import { formatMoney } from '../utils/format';
import { colors, radius, spacing, typography } from '../theme';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable';

function txLabel(type: string): string {
  switch (type) {
    case 'cash_collected':
      return 'Cash collected';
    case 'cash_handover':
      return 'Handed to store';
    case 'legacy_ambiguous':
      return 'Legacy (unreconciled)';
    default:
      return type;
  }
}

/**
 * Read-only rider financial summary from the server.
 * COD cash held ≠ earnings. Compensation is calculated estimate only.
 */
export default function WalletScreen() {
  const { openMenu } = useSideMenu();
  const { user } = useAuth();
  const [summary, setSummary] = useState<RiderFinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<RiderFinanceTransaction[]>(
    [],
  );
  const [floatSummary, setFloatSummary] = useState<FloatSummary | null>(null);
  const [ackBusyId, setAckBusyId] = useState<number | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setState('loading');
    setErrorMessage(null);

    const [result, floatResult] = await Promise.all([
      fetchFinancePage({ page: 1, pageSize: 50 }),
      fetchFloatSummary(),
    ]);
    if (!result.ok) {
      setState('error');
      setErrorMessage(result.error.message);
      setSummary(null);
      setTransactions([]);
      setFloatSummary(null);
      setRefreshing(false);
      return;
    }

    setSummary(result.data.summary);
    setTransactions(result.data.transactions);
    setFloatSummary(floatResult.ok ? floatResult.data : null);
    setState(
      result.data.transactions.length === 0 &&
        result.data.summary.cashCollectedTotal === 0 &&
        !(floatResult.ok && floatResult.data.outstandingFloat > 0) &&
        !(floatResult.ok && floatResult.data.pendingAcknowledgments.length > 0)
        ? 'empty'
        : 'ready',
    );
    setRefreshing(false);
  }, []);

  const onAcknowledge = useCallback(
    async (issueId: number) => {
      setAckBusyId(issueId);
      const res = await acknowledgeFloat(issueId);
      setAckBusyId(null);
      if (!res.ok) {
        Alert.alert('Acknowledge failed', res.error.message);
        return;
      }
      void load(true);
    },
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, user?.id]),
  );

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void load(true);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [load]);

  const renderTx: ListRenderItem<RiderFinanceTransaction> = ({ item }) => (
    <View style={styles.txRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>
          {txLabel(item.type)} · #{item.orderId || item.orderNo}
        </Text>
        {item.note ? <Text style={styles.txNote}>{item.note}</Text> : null}
        <Text style={styles.txMeta}>
          {new Date(item.at).toLocaleString()}
        </Text>
      </View>
      <Text style={styles.txAmount}>{formatMoney(item.amount)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Finances" showMenu onMenuPress={openMenu} />

      {state === 'loading' && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Loading financial summary…</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <EmptyState
          variant="error"
          title="Could not load finances"
          message={errorMessage || 'Try again shortly.'}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : null}

      {state === 'empty' || state === 'ready' ? (
        <FlatList
          data={transactions}
          keyExtractor={(item, index) =>
            `${item.type}-${item.assignedOrderId}-${item.at}-${index}`
          }
          renderItem={renderTx}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
            />
          }
          ListHeaderComponent={
            summary ? (
              <View style={styles.headerBlock}>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Total owed to store</Text>
                  <Text style={styles.cardAmount}>
                    {formatMoney(
                      summary.totalOwedToStore ??
                        summary.cashHeld +
                          (summary.floatOutstanding ??
                            floatSummary?.outstandingFloat ??
                            0),
                    )}
                  </Text>
                  <Text style={styles.cardHint}>
                    COD held + change float. Tips stay with you. Not earnings.
                  </Text>
                </View>

                <SectionHeader title="Change float" />
                <View style={styles.grid}>
                  <Metric
                    label="Outstanding float"
                    value={formatMoney(
                      summary.floatOutstanding ??
                        floatSummary?.outstandingFloat ??
                        0,
                    )}
                  />
                  <Metric
                    label="COD held"
                    value={formatMoney(summary.cashHeld)}
                  />
                </View>
                {floatSummary?.pendingAcknowledgments?.length ? (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={styles.cardHint}>
                      Pending acknowledgment — confirm you received this float.
                    </Text>
                    {floatSummary.pendingAcknowledgments.map(item => (
                      <View key={item.id} style={styles.txRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txTitle}>
                            Issue · {formatMoney(item.amount)}
                          </Text>
                          <Text style={styles.txMeta}>
                            {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <AppButton
                          label={ackBusyId === item.id ? '…' : 'Acknowledge'}
                          variant="secondary"
                          onPress={() => void onAcknowledge(item.id)}
                          disabled={ackBusyId != null}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
                {floatSummary?.recent?.length ? (
                  <View style={{ marginBottom: spacing.md }}>
                    {floatSummary.recent.slice(0, 5).map(item => (
                      <View key={`${item.entryType}-${item.id}`} style={styles.txRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txTitle}>
                            Float · {item.entryType}
                            {item.status ? ` · ${item.status}` : ''}
                          </Text>
                          <Text style={styles.txMeta}>
                            {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.txAmount}>
                          {formatMoney(item.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <SectionHeader title="COD cash" />
                <View style={styles.grid}>
                  <Metric
                    label="Collected from customers"
                    value={formatMoney(summary.cashCollectedTotal)}
                  />
                  <Metric
                    label="Handed to store"
                    value={formatMoney(summary.cashHandedOverTotal)}
                  />
                  <Metric
                    label="COD shortage"
                    value={formatMoney(summary.codShortageTotal)}
                  />
                  <Metric
                    label="Completed cash orders"
                    value={String(summary.completedCashOrders)}
                  />
                </View>

                {summary.legacyAmbiguousCount > 0 ? (
                  <Text style={styles.warn}>
                    {summary.legacyAmbiguousCount} legacy cash record(s)
                    excluded until reconciled.
                  </Text>
                ) : null}

                <SectionHeader title="Calculated compensation" />
                <View style={styles.card}>
                  {summary.compensationAvailable &&
                  summary.calculatedCompensation != null ? (
                    <>
                      <Text style={styles.cardAmount}>
                        {formatMoney(summary.calculatedCompensation)}
                      </Text>
                      <Text style={styles.cardHint}>
                        {summary.compensationNote ||
                          'Estimate only — not paid and not available for withdrawal.'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.cardHint}>
                      {summary.compensationNote ||
                        'Compensation unavailable — payout settings unresolved.'}
                    </Text>
                  )}
                </View>

                <Text style={styles.updated}>
                  As of {new Date(summary.asOfUtc).toLocaleString()}
                  {summary.isPeriodFilter ? ' (filtered period)' : ' (all time)'}
                </Text>

                <SectionHeader title="Activity" />
                {state === 'empty' ? (
                  <Text style={styles.hint}>
                    No cash collections or handovers yet.
                  </Text>
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            state === 'ready' ? (
              <Text style={styles.hint}>No transactions in this view.</Text>
            ) : null
          }
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
        />
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  headerBlock: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: { ...typography.caption, color: colors.textSecondary },
  cardAmount: {
    ...typography.title,
    fontSize: 28,
    color: colors.textPrimary,
    marginVertical: spacing.xs,
  },
  cardHint: { ...typography.caption, color: colors.textSecondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metric: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  metricValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: 4,
  },
  warn: {
    ...typography.caption,
    color: colors.warning,
    marginBottom: spacing.md,
  },
  updated: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  txTitle: { ...typography.subtitle, color: colors.textPrimary },
  txNote: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  txMeta: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  txAmount: { ...typography.subtitle, color: colors.textPrimary },
});
