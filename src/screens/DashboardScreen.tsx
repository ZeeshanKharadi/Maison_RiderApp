import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  AppButton,
  EmptyState,
  SectionHeader,
  StatCard,
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
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

function goStack(screen: string) {
  navigate('MainDrawer', { screen });
}

/**
 * Rider command center — answers: online? active job? what's next?
 * Summary metrics come from GET /api/Order/Performance (not session-local estimates).
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
    restoreActiveDeliveries,
  } = useRiderSession();
  const { profile, unreadCount } = useAccount();
  const {
    orders,
    accepting,
    acceptingOrderKey,
    acceptOrder,
    rejectOrder,
    refreshOrders,
  } = useAvailableOrders();
  const { isConnected } = useNetworkConnectivity();

  const [now, setNow] = useState(() => new Date());
  const [todayPerf, setTodayPerf] = useState<RiderPerformance | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AvailableOrder | null>(null);

  // Tick working-hours clock while online (stops when offline).
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
    const end = new Date();
    const todayWin = performanceTodayWindow(end);
    const today = await ordersRepository.fetchPerformance({
      from: todayWin.from,
      to: todayWin.to,
    });
    // Clear on failure so we never show another rider's (or stale) values.
    setTodayPerf(today.ok ? today.data : null);
  }, []);

  useEffect(() => {
    setTodayPerf(null);
    void loadPerformance();
  }, [user?.id, loadPerformance]);

  useEffect(() => {
    const unsub = navigation.addListener?.('focus', () => {
      void loadPerformance();
      // Show cancel alerts when FCM was missed; session/durable markers dedupe.
      void restoreActiveDeliveries();
      void refreshOrders();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [navigation, loadPerformance, restoreActiveDeliveries, refreshOrders]);

  // Foreground-only sync. Never suppress cancel alerts on this path.
  useEffect(() => {
    const tick = () => {
      if (AppState.currentState !== 'active') return;
      void restoreActiveDeliveries();
      void refreshOrders();
    };
    const id = setInterval(tick, 15_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [restoreActiveDeliveries, refreshOrders]);

  const greeting = useMemo(() => getGreeting(now), [now]);
  const dateLabel = useMemo(() => formatDashboardDate(now), [now]);
  const workingHours = useMemo(
    () => formatWorkingHours(shiftStartedAt, now),
    [shiftStartedAt, now],
  );

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

  return (
    <View style={styles.container}>
      {/* 1. Greeting */}
      <View
        style={[styles.greetingHeader, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <NoConnectionBanner detail="Phone has no internet. Dashboard numbers may show — until you reconnect. Status and COD changes are not queued offline." />

        {/* 2. Online / Offline (shift status — not the same as Wi‑Fi) */}
        <View
          style={[styles.statusCard, !isOnline && styles.statusCardOffline]}
          accessibilityRole="summary"
          accessibilityLabel={
            isOnline
              ? `Online. Shift started ${shiftStartedAt ? formatShiftClock(shiftStartedAt) : ''}. Working ${workingHours}`
              : 'Offline'
          }>
          <View style={styles.statusTop}>
            <View style={styles.statusLeft}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? colors.success : colors.textMuted },
                ]}
              />
              <View>
                <Text style={styles.statusTitle}>
                  {isOnline ? 'You are online' : 'You are offline'}
                </Text>
                <Text style={styles.statusSub}>
                  {!isConnected
                    ? 'Shift status is separate from Wi‑Fi — reconnect to sync with the server'
                    : isOnline
                      ? `Shift started ${shiftStartedAt ? formatShiftClock(shiftStartedAt) : '—'}`
                      : 'Go online to receive orders'}
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
          {isOnline ? (
            <View style={styles.statusMeta}>
              <Icon name="clock-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.statusMetaText}>Working {workingHours}</Text>
            </View>
          ) : null}
        </View>

        {/* 3. Today's Summary — keep Your pay + cash still to hand in */}
        <SectionHeader title="Today" />
        <View style={styles.statsRow}>
          <StatCard
            icon="package-variant"
            label="Deliveries"
            value={todayPerf ? String(todayPerf.completedCount) : '—'}
          />
          <StatCard
            icon="cash"
            label="Cash collected"
            value={
              todayPerf ? formatMoney(todayPerf.codCollected) : '—'
            }
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="timer-outline"
            label="Online hours"
            value={
              todayPerf ? `${todayPerf.onlineHours.toFixed(1)}h` : '—'
            }
            iconColor={colors.info}
          />
          <StatCard
            icon="cash-multiple"
            label="Your pay"
            value={
              todayPerf?.deliveryPayAvailable &&
              todayPerf.estimatedDeliveryPay != null
                ? formatMoney(todayPerf.estimatedDeliveryPay)
                : '—'
            }
            iconColor={colors.success}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="wallet-outline"
            label="Cash to hand in"
            value={
              todayPerf ? formatMoney(todayPerf.codOutstanding) : '—'
            }
            iconColor={colors.warning}
          />
          <View style={{ flex: 1 }} />
        </View>
        {todayPerf && !todayPerf.deliveryPayAvailable ? (
          <Text style={styles.summaryHint}>
            {todayPerf.deliveryPayNote || 'Your pay shows when the rate is set'}
          </Text>
        ) : (
          <Text style={styles.summaryHint}>
            Your pay is what you earn · Cash to hand in is customer money
          </Text>
        )}

        {/* 4. Active Delivery */}
        <SectionHeader title="Active delivery" />
        {activeJob && activeConfig ? (
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
                    ? 'Awaiting store receipt'
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
        ) : (
          <EmptyState
            icon="motorbike"
            title="No active delivery"
            message={
              isOnline
                ? 'Accept an order below to start your next run.'
                : 'Go online, then accept an order.'
            }
            actionLabel={isOnline ? undefined : 'Go online'}
            onAction={
              isOnline ? undefined : () => handleOnlineChange(true)
            }
          />
        )}

        {/* 5. Full available orders (same cards as Orders tab) */}
        <SectionHeader title="Available orders" />
        <Text style={styles.availableCount} accessibilityLiveRegion="polite">
          {isOnline && isConnected ? `${orders.length} available` : ''}
        </Text>
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Icon name="bike-off" size={22} color={colors.textMuted} />
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
          orders.map(order => {
            const key = ordersRepository.orderListKey(order);
            return (
              <OrderCard
                key={key}
                order={order}
                onPress={goOrderDetails}
                onAccept={handleAccept}
                onReject={handleRejectPress}
                actionsDisabled={accepting || !isConnected}
                isAccepting={acceptingOrderKey === key}
              />
            );
          })
        )}
      </ScrollView>

      <RejectReasonSheet
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={reason => void handleRejectConfirm(reason)}
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
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.successSoft,
    ...elevation.small,
  },
  statusCardOffline: {
    borderColor: colors.border,
  },
  statusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
  },
  statusSub: {
    ...typography.caption,
    marginTop: 2,
  },
  statusMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  statusMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
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
    marginBottom: spacing.lg,
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
  availableCount: {
    ...typography.caption,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
});
