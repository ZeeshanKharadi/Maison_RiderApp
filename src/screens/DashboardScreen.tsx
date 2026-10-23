import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../services/AuthContext';
import { useSideMenu } from '../context/SideMenuContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useAccount } from '../context/AccountContext';
import { navigate } from '../navigation/RootNavigation';
import OrderCard from '../components/OrderCard';
import AcceptSelectedBar from '../components/AcceptSelectedBar';
import ActiveOrderSelector from '../components/delivery/ActiveOrderSelector';
import {
  AppButton,
  EmptyState,
  SectionHeader,
  StatusPill,
  confirmDialog,
  RejectReasonSheet,
} from '../components/ui';
import {
  formatDashboardDate,
  formatShiftClock,
  formatWorkingHours,
  getGreeting,
} from '../data/dashboard';
import { getStateConfig } from '../delivery/stateMachine';
import { jobProgress } from '../delivery/types';
import { formatMoney } from '../utils/format';
import { performanceTodayWindow } from '../utils/performanceRange';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import NoConnectionBanner from '../components/NoConnectionBanner';
import * as ordersRepository from '../repositories/ordersRepository';
import type { RiderPerformance } from '../repositories/ordersRepository';
import type { AvailableOrder, RejectReason } from '../data/orders';
import {
  captureAuthSession,
  isAuthSessionCurrent,
} from '../utils/authSession';
import {
  colors,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

function goStack(screen: string) {
  navigate('MainDrawer', { screen });
}

type SummaryMetricProps = {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  iconColor?: string;
};

function SummaryMetricCard({
  icon,
  label,
  value,
  valueColor = colors.primaryDark,
  iconColor = colors.primaryDark,
}: SummaryMetricProps) {
  return (
    <View
      style={styles.metricCard}
      accessibilityRole="summary"
      accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={iconColor} />
      <Text
        style={styles.metricLabel}
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, { color: valueColor }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Rider command center — online status, active job, available offers, then today.
 * Detailed performance stays in the side menu (Performance / History / Wallet).
 */
export default function DashboardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openMenu } = useSideMenu();
  const {
    isOnline,
    setOnline,
    shiftStartedAt,
    activeJob,
    activeJobs,
    selectedJobId,
    selectActiveJob,
    restoreActiveDeliveries,
  } = useRiderSession();
  const { profile, unreadCount } = useAccount();
  const {
    orders,
    accepting,
    acceptingOrderKey,
    acceptOrder,
    acceptSelectedOrders,
    rejectOrder,
    refreshOrders,
    selectedKeys,
    remainingSlots,
    isOrderSelected,
    toggleOrderSelected,
  } = useAvailableOrders();
  const { isConnected } = useNetworkConnectivity();

  const [now, setNow] = useState(() => new Date());
  const [todayPerf, setTodayPerf] = useState<RiderPerformance | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AvailableOrder | null>(null);
  const perfRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isOnline || !shiftStartedAt) {
      setNow(new Date());
      return;
    }
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [isOnline, shiftStartedAt]);

  const loadPerformance = useCallback(async () => {
    const session = captureAuthSession();
    if (!session) return;

    const requestId = ++perfRequestIdRef.current;
    const end = new Date();
    const todayWin = performanceTodayWindow(end);
    const today = await ordersRepository.fetchPerformance({
      from: todayWin.from,
      to: todayWin.to,
    });

    // Drop overlapping / post-logout responses.
    if (
      requestId !== perfRequestIdRef.current ||
      !isAuthSessionCurrent(session)
    ) {
      return;
    }
    setTodayPerf(today.ok ? today.data : null);
  }, []);

  useEffect(() => {
    setTodayPerf(null);
    void loadPerformance();
  }, [user?.id, loadPerformance]);

  useEffect(() => {
    const unsub = navigation.addListener?.('focus', () => {
      void loadPerformance();
      void restoreActiveDeliveries();
      void refreshOrders();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [navigation, loadPerformance, restoreActiveDeliveries, refreshOrders]);

  // Single dashboard refresh tick — orders, active jobs, and financial summary.
  useEffect(() => {
    const tick = () => {
      if (AppState.currentState !== 'active') return;
      void restoreActiveDeliveries();
      void refreshOrders();
      void loadPerformance();
    };
    const id = setInterval(tick, 15_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [restoreActiveDeliveries, refreshOrders, loadPerformance]);

  const greeting = useMemo(() => getGreeting(now), [now]);
  const dateLabel = useMemo(() => formatDashboardDate(now), [now]);
  const workingHours = useMemo(
    () => formatWorkingHours(shiftStartedAt, now),
    [shiftStartedAt, now],
  );

  const activeCount = activeJobs.length;
  const activeConfig = activeJob ? getStateConfig(activeJob.state) : null;
  const activeProgress = activeJob ? jobProgress(activeJob) : 0;

  const goTab = useCallback(
    (tab: string) => {
      navigation.navigate(tab as never);
    },
    [navigation],
  );

  const goOrderDetails = useCallback((order: AvailableOrder) => {
    navigate('MainDrawer', {
      screen: 'OrderDetails',
      params: {
        orderId: order.id,
        backendId: order.backendId,
      },
    });
  }, []);

  const handleAccept = useCallback(
    async (order: AvailableOrder) => {
      if (accepting) return;
      if (!isConnected) {
        confirmDialog({
          title: 'No connection',
          message:
            'Connect to the internet to accept orders. Accepts are not queued offline.',
          confirmLabel: 'OK',
          onConfirm: () => {},
        });
        return;
      }
      if (!isOnline) {
        confirmDialog({
          title: 'Offline',
          message: 'Go online before accepting orders.',
          confirmLabel: 'OK',
          onConfirm: () => {},
        });
        return;
      }
      const alreadyActive = activeJobs.some(
        j => j.backendId === order.backendId || j.id === order.id,
      );
      if (!alreadyActive && activeJobs.length >= 5) {
        confirmDialog({
          title: 'Order limit',
          message: 'You can carry up to 5 active orders at once.',
          confirmLabel: 'OK',
          onConfirm: () => {},
        });
        return;
      }
      const result = await acceptOrder(order);
      if (result.ok) {
        goStack('ActiveDelivery');
      }
    },
    [accepting, activeJobs, acceptOrder, isOnline, isConnected],
  );

  const handleAcceptSelected = useCallback(async () => {
    if (accepting || selectedKeys.length === 0) return;
    const result = await acceptSelectedOrders();
    if (result.ok) {
      goStack('ActiveDelivery');
    }
  }, [accepting, selectedKeys.length, acceptSelectedOrders]);

  const handleRejectPress = useCallback((order: AvailableOrder) => {
    setRejectTarget(order);
  }, []);

  const selectionAtCap =
    remainingSlots <= 0 || selectedKeys.length >= remainingSlots;

  const handleRejectConfirm = useCallback(
    async (reason: RejectReason) => {
      if (!rejectTarget) return;
      const target = rejectTarget;
      setRejectTarget(null);
      await rejectOrder(target, reason);
    },
    [rejectTarget, rejectOrder],
  );

  const handleOnlineChange = useCallback(
    (next: boolean) => {
      if (!isConnected) {
        Alert.alert(
          'No connection',
          'Connect to Wi‑Fi or mobile data before changing online status. Status changes are not queued offline.',
        );
        return;
      }
      if (!next && activeJob) {
        confirmDialog({
          title: 'Go offline?',
          message:
            'You still have an active delivery. Finish it before going offline, or go offline anyway.',
          confirmLabel: 'Go offline',
          destructive: true,
          onConfirm: () => {
            void setOnline(false);
          },
        });
        return;
      }
      void setOnline(next);
    },
    [activeJob, setOnline, isConnected],
  );

  const handleContinueDelivery = useCallback(() => {
    goStack('ActiveDelivery');
  }, []);

  const statusSub = !isConnected
    ? 'Reconnect to sync'
    : isOnline
      ? `Shift duration ${workingHours}${
          shiftStartedAt ? ` · since ${formatShiftClock(shiftStartedAt)}` : ''
        }`
      : 'Go online to receive orders';

  const payValue =
    todayPerf?.deliveryPayAvailable && todayPerf.estimatedDeliveryPay != null
      ? formatMoney(todayPerf.estimatedDeliveryPay)
      : '—';
  const deliveredValue = todayPerf ? String(todayPerf.completedCount) : '—';
  const cashCollectedValue = todayPerf
    ? formatMoney(todayPerf.codCollected)
    : '—';
  const cashHandValue = todayPerf
    ? formatMoney(todayPerf.codOutstanding)
    : '—';
  const onlineHoursValue = todayPerf
    ? `${Number(todayPerf.onlineHours).toFixed(1)}h`
    : '—';

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.greetingHeader,
          { paddingTop: Math.max(insets.top, spacing.sm) },
        ]}>
        <TouchableOpacity
          onPress={openMenu}
          style={styles.iconHit}
          accessibilityRole="button"
          accessibilityLabel="Open menu">
          <Icon name="menu" size={26} color={colors.primaryDark} />
        </TouchableOpacity>

        <View style={styles.greetingCenter}>
          <Text style={styles.greetingEyebrow}>{greeting}</Text>
          <Text style={styles.greetingName} numberOfLines={1}>
            {user?.name || profile.fullName || 'Rider'}
          </Text>
          <Text style={styles.greetingDate}>{dateLabel}</Text>
        </View>

        <View style={styles.greetingRight}>
          <TouchableOpacity
            onPress={() => goStack('Notifications')}
            style={styles.iconHit}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
            accessibilityHint="Opens notification center">
            <Icon name="bell-outline" size={24} color={colors.primaryDark} />
            {unreadCount > 0 ? <View style={styles.notifDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => goTab('Profile')}
            style={styles.avatarBtn}
            accessibilityRole="button"
            accessibilityLabel="Open profile">
            <Icon name="account" size={22} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          selectedKeys.length > 0 && { paddingBottom: spacing.xxxl + 72 },
        ]}
        showsVerticalScrollIndicator={false}>
        <NoConnectionBanner detail="Phone has no internet. Dashboard numbers may show — until you reconnect. Status and COD changes are not queued offline." />

        {/* Compact online / offline */}
        <View
          style={[styles.statusBar, !isOnline && styles.statusBarOffline]}
          accessibilityRole="summary"
          accessibilityLabel={
            isOnline
              ? `Online. Shift duration ${workingHours}${
                  shiftStartedAt
                    ? `. Started ${formatShiftClock(shiftStartedAt)}`
                    : ''
                }`
              : 'Offline'
          }>
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOnline
                    ? colors.success
                    : colors.textMuted,
                },
              ]}
            />
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              <Text style={styles.statusSub} numberOfLines={2}>
                {statusSub}
              </Text>
            </View>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleOnlineChange}
            disabled={!isConnected}
            trackColor={{ false: colors.disabled, true: colors.successSoft }}
            thumbColor={isOnline ? colors.success : colors.textMuted}
            accessibilityLabel="Online status"
            accessibilityState={{ checked: isOnline, disabled: !isConnected }}
          />
        </View>

        {/* Compact today summary — before active deliveries */}
        <View
          style={styles.summaryBlock}
          accessibilityRole="summary"
          accessibilityLabel={`Your pay today ${payValue}. Delivered today ${deliveredValue}. Cash collected today ${cashCollectedValue}. Cash to hand in ${cashHandValue}. Online hours today ${onlineHoursValue}.`}>
          <View style={styles.summaryGrid}>
            <SummaryMetricCard
              icon="cash-plus"
              label="Your pay today"
              value={payValue}
              iconColor={colors.success}
              valueColor={colors.success}
            />
            <SummaryMetricCard
              icon="package-variant-closed"
              label="Delivered today"
              value={deliveredValue}
              iconColor={colors.primaryDark}
              valueColor={colors.primaryDark}
            />
            <SummaryMetricCard
              icon="cash"
              label="Cash collected today"
              value={cashCollectedValue}
              iconColor={colors.primaryDark}
              valueColor={colors.primaryDark}
            />
            <SummaryMetricCard
              icon="cash-clock"
              label="Cash to hand in"
              value={cashHandValue}
              iconColor={colors.warning}
              valueColor={colors.warning}
            />
          </View>
          <View style={styles.onlineHoursRow}>
            <Icon name="clock-outline" size={16} color={colors.textSecondary} />
            <Text
              style={styles.onlineHoursLabel}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              Online hours today
            </Text>
            <Text
              style={styles.onlineHoursValue}
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              {onlineHoursValue}
            </Text>
          </View>
          {todayPerf && !todayPerf.deliveryPayAvailable ? (
            <Text
              style={styles.payUnavailable}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              {todayPerf.deliveryPayNote ||
                'Your pay shows when the rate is set'}
            </Text>
          ) : null}
        </View>

        {/* Active delivery */}
        {activeJob && activeConfig ? (
          <View style={styles.sectionBlock}>
            <SectionHeader
              title={
                activeCount > 1
                  ? `Active delivery · ${activeCount}`
                  : 'Active delivery'
              }
            />
            {activeCount > 1 ? (
              <ActiveOrderSelector
                jobs={activeJobs}
                selectedJobId={selectedJobId}
                onSelect={selectActiveJob}
                embedded
              />
            ) : null}
            <View
              style={styles.activeCard}
              accessibilityLabel={`Active order ${activeJob.id}, ${activeConfig.pillLabel}`}>
              <View style={styles.activeTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeId}>{activeJob.id}</Text>
                  <Text style={styles.activeCustomer}>
                    {activeJob.customerName} · {activeJob.restaurant}
                  </Text>
                </View>
                <StatusPill
                  label={activeConfig.pillLabel}
                  tone={activeConfig.pillTone}
                />
              </View>

              <View style={styles.routeMini}>
                <View style={styles.routeDots}>
                  <View style={styles.dotPickup} />
                  <View style={styles.routeLine} />
                  <View style={styles.dotDrop} />
                </View>
                <View style={styles.routeText}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeValue} numberOfLines={1}>
                    {activeJob.pickupAddress}
                  </Text>
                  <Text style={[styles.routeLabel, { marginTop: spacing.sm }]}>
                    Drop-off
                  </Text>
                  <Text style={styles.routeValue} numberOfLines={1}>
                    {activeJob.dropoffAddress}
                  </Text>
                </View>
              </View>

              <View style={styles.progressBlock}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${activeProgress}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {activeProgress}% · {activeConfig.title}
                </Text>
              </View>

              <AppButton
                label={
                  activeJob.state === 'RETURNING_TO_STORE'
                    ? 'Return to store'
                    : activeJob.state === 'AWAITING_STORE_RECEIPT'
                      ? 'Waiting for store confirmation'
                      : 'Continue delivery'
                }
                icon={
                  activeJob.state === 'RETURNING_TO_STORE' ||
                  activeJob.state === 'AWAITING_STORE_RECEIPT'
                    ? 'store-marker'
                    : 'navigation-variant'
                }
                fullWidth
                onPress={handleContinueDelivery}
                accessibilityLabel="Continue active delivery"
              />
            </View>
          </View>
        ) : null}

        {/* Available orders — no View all */}
        <SectionHeader
          title={
            isOnline && isConnected && orders.length > 0
              ? `Available · ${orders.length}`
              : 'Available orders'
          }
        />
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Icon name="pause-circle-outline" size={22} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineTitle}>Shift is offline</Text>
              <Text style={styles.offlineBody}>
                Turn on your status to receive new delivery offers. This is not
                the same as Wi‑Fi / mobile data.
              </Text>
            </View>
          </View>
        ) : !isConnected ? (
          <View style={styles.offlineBanner}>
            <Icon name="wifi-off" size={22} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineTitle}>No internet connection</Text>
              <Text style={styles.offlineBody}>
                You may still be on shift, but the phone cannot reach the server
                until Wi‑Fi or mobile data is back.
              </Text>
            </View>
          </View>
        ) : orders.length === 0 ? (
          <EmptyState
            icon="truck-delivery-outline"
            title="No nearby orders"
            message="New offers in your zone will show up here."
            actionLabel="Refresh orders"
            onAction={() => void refreshOrders()}
          />
        ) : (
          <>
            {remainingSlots <= 0 ? (
              <Text style={styles.limitHint}>
                Active order limit reached (5). Finish a delivery before
                accepting more.
              </Text>
            ) : null}
            {orders.map(order => {
              const key = ordersRepository.orderListKey(order);
              const selected = isOrderSelected(order);
              return (
                <OrderCard
                  key={key}
                  order={order}
                  onPress={goOrderDetails}
                  onAccept={handleAccept}
                  onReject={handleRejectPress}
                  actionsDisabled={accepting || !isConnected}
                  isAccepting={acceptingOrderKey === key}
                  selected={selected}
                  onToggleSelect={toggleOrderSelected}
                  selectionDisabled={selectionAtCap && !selected}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      <RejectReasonSheet
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={reason => void handleRejectConfirm(reason)}
      />

      <AcceptSelectedBar
        selectedCount={selectedKeys.length}
        remainingSlots={remainingSlots}
        onAcceptSelected={() => void handleAcceptSelected()}
        disabled={!isConnected || !isOnline}
        loading={accepting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  iconHit: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingCenter: {
    flex: 1,
    minWidth: 0,
  },
  greetingEyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  greetingName: {
    ...typography.title,
    color: colors.textPrimary,
  },
  greetingDate: {
    ...typography.caption,
    marginTop: 1,
  },
  greetingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  avatarBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.successSoft,
    ...elevation.small,
  },
  statusBarOffline: {
    borderColor: colors.border,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
    minWidth: 0,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
  },
  statusSub: {
    ...typography.caption,
    marginTop: 1,
  },
  sectionBlock: {
    marginBottom: spacing.xs,
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    ...elevation.medium,
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  activeId: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  activeCustomer: {
    ...typography.caption,
    marginTop: 2,
  },
  routeMini: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  routeDots: {
    width: 14,
    alignItems: 'center',
    marginRight: spacing.sm,
    paddingTop: 4,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryDark,
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  dotDrop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  routeText: { flex: 1 },
  routeLabel: {
    ...typography.label,
  },
  routeValue: {
    ...typography.body,
    marginTop: 2,
  },
  progressBlock: {
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.disabled,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.full,
  },
  progressLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineTitle: {
    ...typography.bodyStrong,
  },
  offlineBody: {
    ...typography.caption,
    marginTop: 2,
  },
  limitHint: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  summaryBlock: {
    marginBottom: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.small,
    minHeight: 76,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.xxs,
  },
  metricValue: {
    ...typography.title,
    fontSize: 18,
    marginTop: 2,
  },
  onlineHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.small,
  },
  onlineHoursLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  onlineHoursValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  payUnavailable: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
