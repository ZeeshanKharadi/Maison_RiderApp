import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import HistoryDeliveryCard from '../components/HistoryDeliveryCard';
import HistoryFilterSheet from '../components/ui/HistoryFilterSheet';
import {
  AppButton,
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
  mergeHistoryPages,
} from '../data/historyQuery';
import { mapOrderToHistoryItem } from '../api/mappers/historyMapper';
import * as ordersRepository from '../repositories/ordersRepository';
import type { RiderPerformance } from '../repositories/ordersRepository';
import { formatMoney } from '../utils/format';
import {
  formatDateRangeLabel,
  performanceSevenCalendarDayWindow,
  performanceTodayWindow,
} from '../utils/performanceRange';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

const PAGE_SIZE = 20;

/**
 * Delivery Archive — loads from GET /api/Order/History with pagination.
 */
export default function HistoryScreen() {
  const navigation = useNavigation();

  const [history, setHistory] = useState<DeliveryHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [draft, setDraft] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverToday, setServerToday] = useState<RiderPerformance | null>(null);
  const [serverWeek, setServerWeek] = useState<RiderPerformance | null>(null);
  const [weekRangeLabel, setWeekRangeLabel] = useState('');
  const [todayRangeLabel, setTodayRangeLabel] = useState('');

  const loadServerTotals = useCallback(async () => {
    const now = new Date();
    const todayWin = performanceTodayWindow(now);
    const weekWin = performanceSevenCalendarDayWindow(now);
    setTodayRangeLabel(formatDateRangeLabel(todayWin.from, todayWin.to));
    setWeekRangeLabel(formatDateRangeLabel(weekWin.from, weekWin.to));

    const [todayRes, weekRes] = await Promise.all([
      ordersRepository.fetchPerformance({
        from: todayWin.from,
        to: todayWin.to,
      }),
      ordersRepository.fetchPerformance({
        from: weekWin.from,
        to: weekWin.to,
      }),
    ]);
    setServerToday(todayRes.ok ? todayRes.data : null);
    setServerWeek(weekRes.ok ? weekRes.data : null);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorMessage(null);
    setLoadMoreError(null);
    setPage(1);

    const [result] = await Promise.all([
      ordersRepository.fetchOrderHistory(1, PAGE_SIZE),
      loadServerTotals(),
    ]);

    if (!result.ok) {
      setError(true);
      setErrorMessage(result.error.message);
      setHistory([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setHistory(result.data.items.map(mapOrderToHistoryItem));
    setHasMore(result.data.hasMore);
    setLoading(false);
  }, [loadServerTotals]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    const nextPage = page + 1;
    const result = await ordersRepository.fetchOrderHistory(nextPage, PAGE_SIZE);
    if (!result.ok) {
      // Keep already-loaded rows; offer Retry on the failed page.
      setLoadMoreError(
        result.error.message || 'Could not load older deliveries.',
      );
      setLoadingMore(false);
      return;
    }
    const mapped = result.data.items.map(mapOrderToHistoryItem);
    setHistory(prev => mergeHistoryPages(prev, mapped));
    setPage(nextPage);
    setHasMore(result.data.hasMore);
    setLoadMoreError(null);
    setLoadingMore(false);
  }, [hasMore, loading, loadingMore, page]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const visible = useMemo(
    () => filterAndSortHistory(history, query, filters),
    [history, query, filters],
  );

  const isFiltered = Boolean(query || countActiveHistoryFilters(filters) > 0);

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

  const listHeader = useMemo(() => {
    const summaryItems = [
      {
        label: todayRangeLabel
          ? `Today · ${todayRangeLabel}`
          : 'Today (server)',
        value:
          serverToday != null ? String(serverToday.completedCount) : '—',
      },
      {
        label: 'COD today',
        value:
          serverToday != null
            ? formatMoney(serverToday.codCollected)
            : '—',
      },
      {
        label: weekRangeLabel
          ? `7 days · ${weekRangeLabel}`
          : '7 days (server)',
        value: serverWeek != null ? String(serverWeek.completedCount) : '—',
      },
    ];

    const archiveChips: Array<{ label: string; value: string }> = [
      {
        label: isFiltered ? 'Matching deliveries' : 'Loaded deliveries',
        value: String(filteredStats.deliveredCount),
      },
      {
        label: 'COD trips',
        value: String(filteredStats.codDeliveries),
      },
      {
        label: 'Card trips',
        value: String(filteredStats.cardDeliveries),
      },
    ];

    if (filteredStats.hasCodAmounts && filteredStats.totalCodCollected != null) {
      archiveChips.push({
        label: 'COD collected (not earnings)',
        value: formatMoney(filteredStats.totalCodCollected),
      });
    }

    if (filteredStats.hasEarnings && filteredStats.totalEarnings != null) {
      archiveChips.push({
        label: 'Rider earnings (loaded)',
        value: formatMoney(filteredStats.totalEarnings),
      });
    }
    if (filteredStats.hasEarnings && filteredStats.highestEarning != null) {
      archiveChips.push({
        label: 'Highest earning (loaded)',
        value: formatMoney(filteredStats.highestEarning),
      });
    }
    if (filteredStats.hasDistance && filteredStats.longestDistance != null) {
      archiveChips.push({
        label: 'Longest distance (loaded)',
        value: `${filteredStats.longestDistance.toFixed(1)} mi`,
      });
    }
    if (filteredStats.shortestDeliveryMin != null) {
      archiveChips.push({
        label: 'Shortest trip (loaded)',
        value: `${filteredStats.shortestDeliveryMin} min`,
      });
    }
    if (filteredStats.avgDeliveryTime != null) {
      archiveChips.push({
        label: 'Avg trip time (loaded)',
        value: `${Math.round(filteredStats.avgDeliveryTime)} min`,
      });
    }
    if (filteredStats.completionRate != null) {
      archiveChips.push({
        label: 'Complete rate (loaded)',
        value: `${filteredStats.completionRate}%`,
      });
    }
    if (filteredStats.avgRating != null) {
      archiveChips.push({
        label: 'Avg rating (loaded)',
        value: filteredStats.avgRating.toFixed(1),
      });
    }

    return (
      <View>
        <SummaryCard
          items={summaryItems}
          style={{ marginBottom: spacing.sm }}
        />
        <Text style={styles.scopeHint}>
          Server totals use Performance API (completed count + COD cash). “7
          days” is exactly seven calendar days ending today
          {weekRangeLabel ? ` (${weekRangeLabel})` : ''}. Rider fee / tip /
          distance stay hidden until History supplies them.
        </Text>

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

        <SectionHeader
          title={
            isFiltered
              ? 'Stats for matching rows'
              : 'Stats for loaded rows'
          }
        />
        <Text style={styles.scopeHint}>
          {isFiltered
            ? `Based on ${visible.length} filtered of ${history.length} loaded — not a lifetime total.`
            : `Based on ${history.length} loaded delivery${history.length === 1 ? '' : 'ies'}${hasMore ? ' (more available)' : ''} — not a lifetime total.`}
        </Text>
        <View style={styles.statsGrid}>
          {archiveChips.map(chip => (
            <StatChip key={chip.label} label={chip.label} value={chip.value} />
          ))}
        </View>

        <Text style={styles.count} accessibilityLiveRegion="polite">
          Showing {visible.length}
          {isFiltered ? ` of ${history.length} loaded` : ''}
          {hasMore && !isFiltered ? ' · load more for older trips' : ''}
        </Text>
      </View>
    );
  }, [
    serverToday,
    serverWeek,
    todayRangeLabel,
    weekRangeLabel,
    filteredStats,
    query,
    filters,
    activeFilterCount,
    visible.length,
    history.length,
    isFiltered,
    hasMore,
  ]);

  const listFooter = useMemo(() => {
    if (loadMoreError) {
      return (
        <View style={styles.footer}>
          <Text style={styles.loadMoreError} accessibilityLiveRegion="polite">
            {loadMoreError}
          </Text>
          <AppButton
            label="Retry"
            variant="outline"
            fullWidth
            onPress={() => void loadMore()}
            disabled={loadingMore}
            accessibilityLabel="Retry loading older deliveries"
          />
        </View>
      );
    }
    if (!hasMore && !loadingMore) return null;
    return (
      <View style={styles.footer}>
        {loadingMore ? (
          <ActivityIndicator color={colors.primaryDark} />
        ) : (
          <AppButton
            label="Load older deliveries"
            variant="outline"
            fullWidth
            onPress={() => void loadMore()}
            accessibilityLabel="Load older deliveries"
          />
        )}
      </View>
    );
  }, [hasMore, loadingMore, loadMore, loadMoreError]);

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
          message={errorMessage || 'Something went wrong loading your archive.'}
          actionLabel="Try again"
          onAction={() => void loadHistory()}
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
          ListFooterComponent={listFooter}
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
  scopeHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.md,
  },
  loadMoreError: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
