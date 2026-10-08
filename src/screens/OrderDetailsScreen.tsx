import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import {
  AppHeader,
  AppButton,
  Badge,
  EmptyState,
  InfoRow,
  SectionHeader,
  StatusPill,
  confirmDialog,
} from '../components/ui';
import { RejectReasonSheet } from '../components/ui/OrderSheets';
import NoConnectionBanner from '../components/NoConnectionBanner';
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import { navigate } from '../navigation/RootNavigation';
import {
  formatPostedAgo,
  paymentLabel,
  RejectReason,
} from '../data/orders';
import { formatMoney, formatTime } from '../utils/format';
import { MainStackParamList } from '../navigation/MainNavigator';
import {
  navigationInputForKind,
  openNavigationPlan,
  resolveNavigationPlan,
} from '../delivery/navigationDestination';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';

type DetailsRoute = RouteProp<MainStackParamList, 'OrderDetails'>;

/** Order inspection — accept sets active job and returns to Dashboard. */
export default function OrderDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<DetailsRoute>();
  const { orderId, backendId } = route.params;
  const { getOrderById, resolveOrder, acceptOrder, rejectOrder, accepting } =
    useAvailableOrders();
  const { activeJobs, isOnline } = useRiderSession();
  const { isConnected } = useNetworkConnectivity();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [order, setOrder] = useState(() => getOrderById(orderId));
  const [resolving, setResolving] = useState(!getOrderById(orderId));
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getOrderById(orderId);
      if (local) {
        setOrder(local);
        setResolving(false);
        return;
      }
      setResolving(true);
      const fetched = await resolveOrder(orderId, backendId);
      if (!cancelled) {
        setOrder(fetched);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, backendId, getOrderById, resolveOrder]);

  const goDashboard = useCallback(() => {
    navigation.goBack();
    setTimeout(() => {
      navigate('MainDrawer', { screen: 'Tabs', params: { screen: 'Dashboard' } });
    }, 50);
  }, [navigation]);

  const handleAccept = useCallback(async () => {
    if (!order || busy || accepting) return;
    if (!isConnected) {
      Alert.alert(
        'No connection',
        'Connect to the internet to accept orders. Accepts are not queued offline.',
      );
      return;
    }
    if (!isOnline) {
      Alert.alert('Offline', 'Go online before accepting orders.');
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
    setBusy(true);
    const result = await acceptOrder(order);
    setBusy(false);
    if (result.ok) {
      goDashboard();
    }
  }, [order, busy, accepting, activeJobs, acceptOrder, goDashboard, isOnline, isConnected]);

  const handleRejectConfirm = useCallback(
    async (reason: RejectReason) => {
      if (!order) return;
      setRejectOpen(false);
      setBusy(true);
      const result = await rejectOrder(order, reason);
      setBusy(false);
      if (result.ok) {
        navigation.goBack();
      }
    },
    [order, rejectOrder, navigation],
  );

  const contactAction = useCallback(
    (label: string) => {
      const phone = (order?.customerPhone ?? '').trim();
      const looksValid =
        phone &&
        phone !== '—' &&
        phone !== '-' &&
        /[\d+]/.test(phone);

      if (label.toLowerCase().includes('call') && looksValid) {
        void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
        return;
      }

      Alert.alert(
        label,
        looksValid
          ? 'Messaging is not available in this build.'
          : 'Customer phone is not available for this order.',
      );
    },
    [order],
  );

  /** Prefer store when it has coords/address; otherwise customer dropoff. */
  const openGoogleMaps = useCallback(async () => {
    if (!order) return;

    const storePlan = resolveNavigationPlan(
      navigationInputForKind(order, 'store'),
    );
    const plan =
      storePlan.kind !== 'unavailable'
        ? storePlan
        : resolveNavigationPlan(navigationInputForKind(order, 'customer'));

    await openNavigationPlan(plan, {
      canOpenURL: url => Linking.canOpenURL(url),
      openURL: url => Linking.openURL(url),
      alert: (title, message, buttons) => Alert.alert(title, message, buttons),
      platformOS: Platform.OS,
    });
  }, [order]);

  const openDeliveryMap = useCallback(() => {
    if (!order) return;
    const assigned = activeJobs.find(j => j.id === order.id);
    (navigation as { navigate: (a: string, b?: object) => void }).navigate(
      'DeliveryMap',
      {
        orderId: order.id,
        preview: assigned
          ? undefined
          : {
              backendId: order.backendId,
              restaurant: order.restaurant,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              pickupAddress: order.pickupAddress,
              dropoffAddress: order.dropoffAddress,
              storeLat: order.storeLat,
              storeLng: order.storeLng,
              customerLat: order.customerLat,
              customerLng: order.customerLng,
              stateHint: 'store',
            },
      },
    );
  }, [order, activeJobs, navigation]);

  const priorityTone = useMemo(() => {
    if (!order) return 'neutral' as const;
    if (order.priority === 'urgent') return 'error' as const;
    if (order.priority === 'high') return 'warning' as const;
    return 'neutral' as const;
  }, [order]);

  if (resolving) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Order details"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="package-variant"
          title="Loading order…"
          message="Fetching order details from the server."
        />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Order details"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="package-variant-closed-remove"
          title="Order unavailable"
          message="This offer may have been accepted or rejected."
          actionLabel="Back to orders"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={order.id}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <NoConnectionBanner detail="Connect to the internet to accept or reject. Actions are not queued offline." />
        <View style={styles.statusRow}>
          <StatusPill label="Available" tone="info" />
          <Text style={styles.posted}>{formatPostedAgo(order.postedAt)}</Text>
        </View>

        <Text style={styles.restaurant}>{order.restaurant}</Text>
        <Text style={styles.customer}>{order.customerName}</Text>

        <View style={styles.badges}>
          {order.isCod ? <Badge label="COD" tone="warning" icon="cash" /> : null}
          {order.priority !== 'normal' ? (
            <Badge
              label={order.priority === 'urgent' ? 'Urgent' : 'Priority'}
              tone={priorityTone === 'error' ? 'error' : 'warning'}
              icon="flag"
            />
          ) : null}
          {order.express ? (
            <Badge label="Express" tone="info" icon="lightning-bolt" />
          ) : null}
          {order.fragile ? (
            <Badge label="Fragile" tone="star" icon="glass-fragile" />
          ) : null}
        </View>

        <View style={styles.summary}>
          {order.deliveryFee != null && order.deliveryFee > 0 ? (
            <SummaryCell
              label="Fee"
              value={formatMoney(order.deliveryFee)}
              highlight
            />
          ) : null}
          <SummaryCell label="Order" value={formatMoney(order.orderAmount)} />
          <SummaryCell
            label="Distance"
            value={
              order.distanceMiles != null
                ? `${order.distanceMiles} mi`
                : '—'
            }
          />
          <SummaryCell
            label="ETA"
            value={order.etaMinutes != null ? `${order.etaMinutes} min` : '—'}
          />
        </View>

        <SectionHeader title="Timeline" />
        <View style={styles.timelineCard}>
          {order.timeline.map((event, index) => (
            <View key={event.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View
                  style={[
                    styles.timelineDot,
                    event.done ? styles.dotDone : styles.dotPending,
                  ]}
                />
                {index < order.timeline.length - 1 ? (
                  <View style={styles.timelineLine} />
                ) : null}
              </View>
              <View style={styles.timelineBody}>
                <Text
                  style={[
                    styles.timelineLabel,
                    !event.done && styles.timelinePending,
                  ]}>
                  {event.label}
                </Text>
                <Text style={styles.timelineTime}>
                  {event.done && event.at ? formatTime(event.at) : 'Pending'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <SectionHeader title="Customer" />
        <View style={styles.card}>
          <InfoRow icon="account" label="Name" value={order.customerName} />
          <InfoRow icon="phone" label="Phone" value={order.customerPhone} />
        </View>

        <SectionHeader title="Route" />
        <View style={styles.card}>
          <InfoRow
            icon="storefront-outline"
            label="Pickup"
            value={order.pickupAddress}
          />
          <InfoRow
            icon="map-marker"
            label="Drop-off"
            value={order.dropoffAddress}
          />
        </View>

        <SectionHeader title="Payment & package" />
        <View style={styles.card}>
          <InfoRow
            icon="credit-card-outline"
            label="Payment"
            value={paymentLabel(order.paymentMethod)}
          />
          <InfoRow
            icon="cash"
            label="COD status"
            value={order.isCod ? 'Collect on delivery' : 'Prepaid'}
          />
          <InfoRow
            icon="package-variant"
            label="Package"
            value={`${order.items} items · ${order.packageInfo}`}
          />
          {order.specialInstructions ? (
            <InfoRow
              icon="note-text-outline"
              label="Special notes"
              value={order.specialInstructions}
            />
          ) : null}
        </View>

        <SectionHeader title="Quick actions" />
        <View style={styles.dummyRow}>
          <AppButton
            label="Call"
            icon="phone"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Call customer')}
          />
          <AppButton
            label="View map"
            icon="map"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={openDeliveryMap}
          />
          <AppButton
            label="Open Maps"
            icon="google-maps"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => void openGoogleMaps()}
          />
        </View>
        <Text style={styles.messageHint}>
          In-app messaging is not available in this build — use Call when a
          phone number is listed.
        </Text>

        <View style={styles.primaryActions}>
          <AppButton
            label={busy || accepting ? 'Accepting…' : 'Accept order'}
            icon="check"
            variant="secondary"
            fullWidth
            onPress={() => void handleAccept()}
            disabled={busy || accepting || !isConnected}
          />
          <AppButton
            label="Reject order"
            variant="outline"
            fullWidth
            onPress={() => setRejectOpen(true)}
            disabled={busy || accepting || !isConnected}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>

      <RejectReasonSheet
        visible={rejectOpen}
        restaurant={order.restaurant}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleRejectConfirm}
      />
    </View>
  );
}

function SummaryCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[styles.summaryValue, highlight && styles.summaryHighlight]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  posted: {
    ...typography.caption,
  },
  restaurant: {
    ...typography.heading,
    fontSize: 22,
  },
  customer: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginBottom: spacing.md,
  },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.label,
  },
  summaryValue: {
    ...typography.bodyStrong,
    marginTop: 4,
  },
  summaryHighlight: {
    color: colors.success,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineRail: {
    width: 20,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 2,
  },
  dotDone: {
    backgroundColor: colors.success,
  },
  dotPending: {
    backgroundColor: colors.borderStrong,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  timelineLabel: {
    ...typography.bodyStrong,
  },
  timelinePending: {
    color: colors.textMuted,
  },
  timelineTime: {
    ...typography.caption,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  dummyRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  dummyBtn: {
    flex: 1,
  },
  messageHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  primaryActions: {
    marginTop: spacing.xs,
  },
});
