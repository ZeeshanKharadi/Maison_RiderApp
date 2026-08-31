import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useRiderSession } from '../context/RiderSessionContext';
import HistoryDeliveryCard from '../components/HistoryDeliveryCard';
import HistoryFilterSheet from '../components/ui/HistoryFilterSheet';
import {
  AppHeader,
  EmptyState,
  SearchBar,
  SectionHeader,
  SkeletonCard,
  SummaryCard,
} from '../components/ui';
import { DeliveryHistoryItem } from '../data/deliveryHistory';
import {
  computeHistoryArchiveStats,
  countActiveHistoryFilters,
  DEFAULT_HISTORY_FILTERS,
  filterAndSortHistory,
  HistoryFilters,
} from '../data/historyQuery';
import { formatMoney } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

/**
 * Delivery Archive — consumes RiderSessionContext history only.
 */
export default function HistoryScreen() {
  const navigation = useNavigation();
  const { history } = useRiderSession();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [draft, setDraft] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState(false);

  // Brief skeleton while archive hydrates from session
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  const visible = useMemo(
    () => filterAndSortHistory(history, query, filters),
    [history, query, filters],
  );

  const stats = useMemo(
    () => computeHistoryArchiveStats(history),
    [history],
  );

  const filteredStats = useMemo(
    () => computeHistoryArchiveStats(visible),
    [visible],
  );

  const activeFilterCount = useMemo(
    () => countActiveHistoryFilters(filters),
    [filters],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const renderItem: ListRenderItem<DeliveryHistoryItem> = useCallback(
    ({ item }) => (
      <HistoryDeliveryCard
        item={item}
        expanded={expandedId === item.id}
        onToggle={() => toggleExpand(item.id)}
      />
    ),
    [expandedId, toggleExpand],
  );

  const keyExtractor = useCallback((item: DeliveryHistoryItem) => item.id, []);

  const clearAll = useCallback(() => {
    setQuery('');
    setFilters(DEFAULT_HISTORY_FILTERS);
  }, []);

  const listHeader = useMemo(
    () => (
      <View>
        <SummaryCard
          items={[
            { label: "Today's", value: String(stats.todayDeliveries) },
            {
              label: 'Earned today',
              value: formatMoney(stats.todayEarnings),
            },
            { label: 'Weekly', value: String(stats.weeklyDeliveries) },
          ]}
          style={{ marginBottom: spacing.sm }}
        />
        <SummaryCard
          variant="surface"
          items={[
            { label: 'Monthly', value: String(stats.monthlyDeliveries) },
            {
              label: 'Avg rating',
              value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—',
            },
            {
              label: 'Avg time',
              value:
                stats.avgDeliveryTime > 0
                  ? `${Math.round(stats.avgDeliveryTime)}m`
                  : '—',
            },
            {
              label: 'Complete',
              value: `${stats.completionRate}%`,
            },
          ]}
          style={{ marginBottom: spacing.md }}
        />

        <View style={styles.toolbar}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search ID, customer, address, store…"
            style={styles.search}
          />
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => {
              setDraft(filters);
              setFilterOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open history filters">
            <Icon name="filter-variant" size={22} color={colors.primaryDark} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <SectionHeader title="Archive stats" />
        <View style={styles.statsGrid}>
          <StatChip
            label="Total deliveries"
            value={String(filteredStats.totalDeliveries)}
          />
          <StatChip
            label="Total earnings"
            value={formatMoney(filteredStats.totalEarnings)}
          />
          <StatChip
            label="COD deliveries"
            value={String(filteredStats.codDeliveries)}
          />
          <StatChip
            label="Card deliveries"
            value={String(filteredStats.cardDeliveries)}
          />
          <StatChip
            label="Highest earning"
            value={formatMoney(filteredStats.highestEarning)}
          />
          <StatChip
            label="Longest distance"
            value={`${filteredStats.longestDistance.toFixed(1)} mi`}
          />
          <StatChip
            label="Shortest delivery"
            value={
              filteredStats.shortestDeliveryMin > 0
                ? `${filteredStats.shortestDeliveryMin} min`
                : '—'
            }
          />
          <StatChip
            label="Avg delivery time"
            value={
              filteredStats.avgDeliveryTime > 0
                ? `${Math.round(filteredStats.avgDeliveryTime)} min`
                : '—'
            }
          />
        </View>

        <Text style={styles.count} accessibilityLiveRegion="polite">
          {visible.length} delivery{visible.length === 1 ? '' : 'ies'}
          {query || activeFilterCount > 0 ? ' · filtered' : ''}
        </Text>
      </View>
    ),
    [
      stats,
      filteredStats,
      query,
      filters,
      activeFilterCount,
      visible.length,
    ],
  );

  if (error) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Delivery Archive"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          variant="error"
          title="Couldn't load history"
          message="Something went wrong loading your archive."
          actionLabel="Try again"
          onAction={() => setLoading(true)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title="Delivery Archive"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.loadingPad}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <EmptyState
              variant={
                query || activeFilterCount > 0 ? 'search' : 'empty'
              }
              icon={
                query || activeFilterCount > 0 ? undefined : 'history'
              }
              title={
                query || activeFilterCount > 0
                  ? 'No matching deliveries'
                  : 'No deliveries yet'
              }
              message={
                query || activeFilterCount > 0
                  ? 'Try clearing search or filters.'
                  : 'Completed trips will appear in your archive.'
              }
              actionLabel={
                query || activeFilterCount > 0 ? 'Clear filters' : undefined
              }
              onAction={
                query || activeFilterCount > 0 ? clearAll : undefined
              }
            />
          }
        />
      )}

      <HistoryFilterSheet
        visible={filterOpen}
        draft={draft}
        onChangeDraft={setDraft}
        onClose={() => setFilterOpen(false)}
        onApply={() => {
          setFilters(draft);
          setFilterOpen(false);
        }}
        onReset={() => setDraft(DEFAULT_HISTORY_FILTERS)}
      />
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingPad: {
    padding: spacing.md,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  search: { flex: 1 },
  filterBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  statChip: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...elevation.small,
  },
  statValue: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  count: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
});
