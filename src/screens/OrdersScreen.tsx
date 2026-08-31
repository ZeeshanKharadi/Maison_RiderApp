import React, { useCallback, useMemo, useState } from 'react';
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
import { useSideMenu } from '../context/SideMenuContext';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { navigate } from '../navigation/RootNavigation';
import OrderCard from '../components/OrderCard';
import {
  AppHeader,
  EmptyState,
  SearchBar,
  confirmDialog,
} from '../components/ui';
import {
  OrderFilterSheet,
  RejectReasonSheet,
} from '../components/ui/OrderSheets';
import {
  AvailableOrder,
  DEFAULT_ORDER_FILTERS,
  filterAndSortOrders,
  OrderFilters,
  RejectReason,
} from '../data/orders';
import * as ordersRepository from '../repositories/ordersRepository';
import { colors, radius, spacing, TOUCH_TARGET, typography } from '../theme';

/**
 * Available offers list — accept sets active delivery and returns to Dashboard.
 */
export default function OrdersScreen() {
  const navigation = useNavigation();
  const { openMenu } = useSideMenu();
  const { orders, loading, error, acceptOrder, rejectOrder, refreshOrders } =
    useAvailableOrders();
  const { activeJob } = useRiderSession();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<OrderFilters>(DEFAULT_ORDER_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AvailableOrder | null>(null);

  const visibleOrders = useMemo(
    () => filterAndSortOrders(orders, query, filters),
    [orders, query, filters],
  );

  const goDetails = useCallback(
    (order: AvailableOrder) => {
      navigate('MainDrawer', {
        screen: 'OrderDetails',
        params: { orderId: order.id },
      });
    },
    [],
  );

  const goDashboard = useCallback(() => {
    navigation.navigate('Dashboard' as never);
  }, [navigation]);

  const handleAccept = useCallback(
    (order: AvailableOrder) => {
      if (activeJob) {
        confirmDialog({
          title: 'Replace active delivery?',
          message: `You already have ${activeJob.id} in progress. Accepting ${order.id} will replace it.`,
          confirmLabel: 'Accept anyway',
          destructive: true,
          onConfirm: () => {
            acceptOrder(order);
            goDashboard();
          },
        });
        return;
      }
      acceptOrder(order);
      goDashboard();
    },
    [activeJob, acceptOrder, goDashboard],
  );

  const handleRejectPress = useCallback((order: AvailableOrder) => {
    setRejectTarget(order);
  }, []);

  const handleRejectConfirm = useCallback(
    async (reason: RejectReason) => {
      if (!rejectTarget) return;
      const target = rejectTarget;
      setRejectTarget(null);
      await rejectOrder(target, reason);
    },
    [rejectTarget, rejectOrder],
  );

  const openFilters = useCallback(() => {
    setDraftFilters(filters);
    setFilterOpen(true);
  }, [filters]);

  const applyFilters = useCallback(() => {
    setFilters(draftFilters);
    setFilterOpen(false);
  }, [draftFilters]);

  const resetFilters = useCallback(() => {
    setDraftFilters(DEFAULT_ORDER_FILTERS);
  }, []);

  const renderItem: ListRenderItem<AvailableOrder> = useCallback(
    ({ item }) => (
      <OrderCard
        order={item}
        onPress={goDetails}
        onAccept={handleAccept}
        onReject={handleRejectPress}
      />
    ),
    [goDetails, handleAccept, handleRejectPress],
  );

  const keyExtractor = useCallback(
    (item: AvailableOrder) => ordersRepository.orderListKey(item),
    [],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.maxDistance != null) n += 1;
    if (filters.paymentMethod !== 'all') n += 1;
    if (filters.codOnly) n += 1;
    if (filters.priorityOnly) n += 1;
    if (filters.expressOnly) n += 1;
    if (filters.fragileOnly) n += 1;
    if (filters.sort !== 'latest') n += 1;
    return n;
  }, [filters]);

  return (
    <View style={styles.container}>
      <AppHeader
        title="Orders"
        showMenu
        onMenuPress={openMenu}
        rightIcon="bell-outline"
        rightBadge
        onRightPress={() =>
          navigate('MainDrawer', { screen: 'Notifications' })
        }
      />

      <View style={styles.toolbar}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search ID, customer, address…"
          style={styles.search}
        />
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={openFilters}
          accessibilityRole="button"
          accessibilityLabel="Open filters">
          <Icon name="filter-variant" size={22} color={colors.primaryDark} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <Text style={styles.count} accessibilityLiveRegion="polite">
        {visibleOrders.length} available
        {query || activeFilterCount > 0 ? ' · filtered' : ''}
      </Text>

      <FlatList
        data={visibleOrders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? (
            <EmptyState
              variant="loading"
              title="Loading orders"
              message="Fetching nearby deliveries…"
            />
          ) : error ? (
            <EmptyState
              variant="error"
              title="Couldn’t load orders"
              message={error}
              actionLabel="Try again"
              onAction={() => void refreshOrders()}
            />
          ) : (
            <EmptyState
              variant={
                query || activeFilterCount > 0 ? 'search' : 'empty'
              }
              icon={
                query || activeFilterCount > 0
                  ? undefined
                  : 'truck-delivery-outline'
              }
              title={
                query || activeFilterCount > 0
                  ? 'No matching orders'
                  : 'No orders right now'
              }
              message={
                query || activeFilterCount > 0
                  ? 'Try clearing search or filters.'
                  : 'New deliveries in your zone will appear here.'
              }
              actionLabel={
                query || activeFilterCount > 0 ? 'Clear filters' : 'Refresh'
              }
              onAction={() => {
                if (query || activeFilterCount > 0) {
                  setQuery('');
                  setFilters(DEFAULT_ORDER_FILTERS);
                } else {
                  void refreshOrders();
                }
              }}
            />
          )
        }
      />

      <OrderFilterSheet
        visible={filterOpen}
        draft={draftFilters}
        onChangeDraft={setDraftFilters}
        onClose={() => setFilterOpen(false)}
        onApply={applyFilters}
        onReset={resetFilters}
      />

      <RejectReasonSheet
        visible={!!rejectTarget}
        restaurant={rejectTarget?.restaurant}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  search: {
    flex: 1,
  },
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
  count: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
});
