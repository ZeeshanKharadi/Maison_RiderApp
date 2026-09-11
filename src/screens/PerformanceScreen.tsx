import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppHeader,
  EmptyState,
  SectionHeader,
  StatCard,
} from '../components/ui';
import * as ordersRepository from '../repositories/ordersRepository';
import type { RiderPerformance } from '../repositories/ordersRepository';
import { formatMoney } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';

/**
 * Rider Performance — GET /api/Order/Performance only.
 * Rankings, ratings, and acceptance rates are hidden when the API does not provide them.
 */
export default function PerformanceScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState<RiderPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await ordersRepository.fetchPerformance();
    if (!result.ok) {
      setError(result.error.message);
      setData(null);
      setLoading(false);
      return;
    }
    setData(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <AppHeader
        title="Performance"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }>
        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load performance"
            message={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : null}

        {!error && data ? (
          <>
            <SectionHeader title="Summary" />
            <View style={styles.statsRow}>
              <StatCard
                icon="package-variant"
                label="Completed"
                value={String(data.completedCount)}
              />
              <StatCard
                icon="timer-outline"
                label="Avg duration"
                value={
                  data.avgDurationMinutes != null
                    ? `${Math.round(data.avgDurationMinutes)}m`
                    : '—'
                }
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="clock-outline"
                label="Online hours"
                value={`${Number(data.onlineHours).toFixed(1)}h`}
                iconColor={colors.info}
              />
              <StatCard
                icon="cash"
                label="COD collected"
                value={formatMoney(data.codCollected)}
                iconColor={colors.success}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="cash-clock"
                label="COD outstanding"
                value={formatMoney(data.codOutstanding)}
                iconColor={colors.warning}
              />
              <View style={{ flex: 1 }} />
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>About this data</Text>
              <Text style={styles.noteBody}>
                Rankings, ratings, and acceptance rates are not available from
                the server yet. Settlements and payouts are managed by admin.
              </Text>
            </View>
          </>
        ) : null}

        {!error && !data && !loading ? (
          <EmptyState
            icon="chart-line"
            title="No performance data"
            message="Complete deliveries to see your stats."
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    ...elevation.small,
  },
  noteTitle: { ...typography.bodyStrong, marginBottom: spacing.xxs },
  noteBody: { ...typography.body, color: colors.textSecondary },
});
