import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
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
import {
  AppButton,
  EmptyState,
  SectionHeader,
  StatCard,
  StatusPill,
  confirmDialog,
} from '../components/ui';
import {
  formatDashboardDate,
  formatShiftClock,
  formatWorkingHours,
  getGreeting,
} from '../data/dashboard';
import { getStateConfig } from '../delivery/stateMachine';
import { jobProgress } from '../delivery/types';
import { formatNotificationTime } from '../data/account';
import { formatMoney } from '../utils/format';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

type QuickAction = {
  icon: string;
  label: string;
  onPress: () => void;
};

function goStack(screen: string) {
  navigate('MainDrawer', { screen });
}

/**
 * Rider command center — answers: online? active job? earned today? what's next?
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
    stats,
  } = useRiderSession();
  const { notifications, profile, unreadCount } = useAccount();
  const { orders } = useAvailableOrders();

  const [now] = useState(() => new Date());

  const greeting = useMemo(() => getGreeting(now), [now]);
  const dateLabel = useMemo(() => formatDashboardDate(now), [now]);
  const workingHours = useMemo(
    () => formatWorkingHours(shiftStartedAt, now),
    [shiftStartedAt, now],
  );

  const orderPreviews = useMemo(() => orders.slice(0, 3), [orders]);
  const recentNotifications = useMemo(
    () =>
      [...notifications]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 3),
    [notifications],
  );
  const activeConfig = activeJob ? getStateConfig(activeJob.state) : null;
  const activeProgress = activeJob ? jobProgress(activeJob) : 0;

  const goTab = useCallback(
    (tab: string) => {
      navigation.navigate(tab as never);
    },
    [navigation],
  );

  const handleOnlineChange = useCallback(
    (next: boolean) => {
      if (!next && activeJob) {
        confirmDialog({
          title: 'Go offline?',
          message:
            'You still have an active delivery. Finish it before going offline, or go offline anyway.',
          confirmLabel: 'Go offline',
          destructive: true,
          onConfirm: () => setOnline(false),
        });
        return;
      }
      setOnline(next);
    },
    [activeJob, setOnline],
  );

  const handleContinueDelivery = useCallback(() => {
    goStack('ActiveDelivery');
  }, []);

  const quickActions: QuickAction[] = useMemo(
    () => [
      { icon: 'truck-delivery', label: 'Orders', onPress: () => goTab('Orders') },
      { icon: 'history', label: 'History', onPress: () => goStack('RouteHistory') },
      { icon: 'wallet-outline', label: 'Wallet', onPress: () => goTab('Wallet') },
      {
        icon: 'chart-line',
        label: 'Performance',
        onPress: () => goStack('Performance'),
      },
      { icon: 'cog-outline', label: 'Settings', onPress: () => goStack('Settings') },
      {
        icon: 'bell-outline',
        label: 'Alerts',
        onPress: () => goStack('Notifications'),
      },
    ],
    [goTab],
  );

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
            {profile.fullName || user?.name || 'Rider'}
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
        {/* 2. Online / Offline */}
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
                  {isOnline
                    ? `Shift started ${shiftStartedAt ? formatShiftClock(shiftStartedAt) : '—'}`
                    : 'Go online to receive orders'}
                </Text>
              </View>
            </View>
            <Switch
              value={isOnline}
              onValueChange={handleOnlineChange}
              trackColor={{ false: colors.disabled, true: colors.successSoft }}
              thumbColor={isOnline ? colors.success : colors.textMuted}
              accessibilityLabel="Online status"
              accessibilityState={{ checked: isOnline }}
            />
          </View>
          {isOnline ? (
            <View style={styles.statusMeta}>
              <Icon name="clock-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.statusMetaText}>Working {workingHours}</Text>
            </View>
          ) : null}
        </View>

        {/* 3. Today's Summary */}
        <SectionHeader title="Today" />
        <View style={styles.statsRow}>
          <StatCard
            icon="package-variant"
            label="Deliveries"
            value={String(stats.todayDeliveries)}
          />
          <StatCard
            icon="cash"
            label="Earnings"
            value={formatMoney(stats.todayEarnings)}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="star"
            label="Avg rating"
            value={stats.todayRating.toFixed(1)}
            iconColor={colors.star}
          />
          <StatCard
            icon="timer-outline"
            label="Hours worked"
            value={`${stats.hoursWorked}h`}
            iconColor={colors.info}
          />
        </View>

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
              label="Continue delivery"
              icon="navigation-variant"
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
                ? 'Accept an order to start your next run.'
                : 'Go online, then accept an order.'
            }
            actionLabel={isOnline ? 'Browse orders' : 'Go online'}
            onAction={() => {
              if (isOnline) goTab('Orders');
              else setOnline(true);
            }}
          />
        )}

        {/* 5. Available Orders Preview */}
        <SectionHeader
          title="Available orders"
          actionLabel={isOnline ? 'View all' : undefined}
          onActionPress={isOnline ? () => goTab('Orders') : undefined}
        />
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Icon name="wifi-off" size={22} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineTitle}>You are currently offline</Text>
              <Text style={styles.offlineBody}>
                Turn on your status to see nearby delivery opportunities.
              </Text>
            </View>
          </View>
        ) : orderPreviews.length === 0 ? (
          <EmptyState
            icon="truck-delivery-outline"
            title="No nearby orders"
            message="New offers in your zone will show up here."
            actionLabel="Refresh orders"
            onAction={() => goTab('Orders')}
          />
        ) : (
          orderPreviews.map(order => (
            <Pressable
              key={order.id}
              style={({ pressed }) => [
                styles.orderPreview,
                pressed && styles.pressed,
              ]}
              onPress={() => goTab('Orders')}
              accessibilityRole="button"
              accessibilityLabel={`Order ${order.id}, ${order.restaurant}, fee ${formatMoney(order.deliveryFee)}`}>
              <View style={styles.orderPreviewTop}>
                <Text style={styles.orderRestaurant} numberOfLines={1}>
                  {order.restaurant}
                </Text>
                <Text style={styles.orderFee}>
                  {formatMoney(order.deliveryFee)}
                </Text>
              </View>
              <Text style={styles.orderMeta} numberOfLines={1}>
                {order.distanceMiles.toFixed(1)} mi · {order.etaMinutes} min · Order{' '}
                {formatMoney(order.orderAmount)}
              </Text>
            </Pressable>
          ))
        )}

        {/* 6. Performance Snapshot */}
        <SectionHeader
          title="Performance"
          actionLabel="View"
          onActionPress={() => goStack('Performance')}
        />
        <View style={styles.perfCard}>
          <View style={styles.perfItem}>
            <Text style={styles.perfValue}>{stats.weeklyDeliveries}</Text>
            <Text style={styles.perfLabel}>Weekly deliveries</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfItem}>
            <Text style={styles.perfValue}>
              {Math.round(stats.completionRate)}%
            </Text>
            <Text style={styles.perfLabel}>Completion</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfItem}>
            <Text style={styles.perfValue}>#{stats.ranking}</Text>
            <Text style={styles.perfLabel}>City rank</Text>
          </View>
        </View>

        {/* 7. Recent Notifications */}
        <SectionHeader
          title="Notifications"
          actionLabel="View all"
          onActionPress={() => goStack('Notifications')}
        />
        {recentNotifications.map(n => (
          <TouchableOpacity
            key={n.id}
            style={styles.notifCard}
            onPress={() => goStack('Notifications')}
            accessibilityRole="button"
            accessibilityLabel={`${n.title}. ${n.description}`}>
            <View style={styles.notifIcon}>
              <Icon
                name={n.icon}
                size={18}
                color={colors.primaryDark}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>{n.title}</Text>
              <Text style={styles.notifBody} numberOfLines={1}>
                {n.description}
              </Text>
            </View>
            <Text style={styles.notifTime}>
              {formatNotificationTime(n.timestamp)}
            </Text>
          </TouchableOpacity>
        ))}

        {/* 8. Quick Actions */}
        <SectionHeader title="Quick actions" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickCard}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}>
              <View style={styles.quickIcon}>
                <Icon name={action.icon} size={22} color={colors.primaryDark} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>
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
  orderPreview: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
  },
  pressed: {
    backgroundColor: colors.pressed,
  },
  orderPreviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderRestaurant: {
    ...typography.bodyStrong,
    flex: 1,
  },
  orderFee: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  orderMeta: {
    ...typography.caption,
    marginTop: spacing.xxs,
  },
  perfCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  perfItem: {
    flex: 1,
    alignItems: 'center',
  },
  perfDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  perfValue: {
    ...typography.title,
    fontSize: 18,
  },
  perfLabel: {
    ...typography.caption,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: spacing.xxs,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: TOUCH_TARGET + 8,
    ...elevation.small,
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    ...typography.bodyStrong,
  },
  notifBody: {
    ...typography.caption,
    marginTop: 1,
  },
  notifTime: {
    ...typography.caption,
    fontSize: 10,
  },
  quickRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  quickCard: {
    width: 88,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    ...elevation.small,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quickLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
