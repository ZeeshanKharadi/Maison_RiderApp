import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import { useAvailableOrders } from '../context/AvailableOrdersContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { navigate } from '../navigation/RootNavigation';
import {
  formatPostedAgo,
  paymentLabel,
  RejectReason,
} from '../data/orders';
import { formatMoney, formatTime } from '../utils/format';
import { MainStackParamList } from '../navigation/MainNavigator';
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
  const { orderId } = route.params;
  const { getOrderById, acceptOrder, rejectOrder } = useAvailableOrders();
  const { activeJobs } = useRiderSession();
  const [rejectOpen, setRejectOpen] = useState(false);

  const order = getOrderById(orderId);

  const goDashboard = useCallback(() => {
    navigation.goBack();
    setTimeout(() => {
      navigate('MainDrawer', { screen: 'Tabs', params: { screen: 'Dashboard' } });
    }, 50);
  }, [navigation]);

  const handleAccept = useCallback(() => {
    if (!order) return;
    const alreadyActive = activeJobs.some(j => j.id === order.id);
    if (!alreadyActive && activeJobs.length >= 5) {
      confirmDialog({
        title: 'Order limit',
        message: 'You can carry up to 5 active orders at once.',
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
      return;
    }
    acceptOrder(order);
    goDashboard();
  }, [order, activeJobs, acceptOrder, goDashboard]);

  const handleRejectConfirm = useCallback(
    async (reason: RejectReason) => {
      if (!order) return;
      setRejectOpen(false);
      await rejectOrder(order, reason);
      navigation.goBack();
    },
    [order, rejectOrder, navigation],
  );

  const contactAction = useCallback((label: string) => {
    Alert.alert(
      label,
      'Calling, messaging, and navigation will connect when device integrations are enabled.',
    );
  }, []);

  const priorityTone = useMemo(() => {
    if (!order) return 'neutral' as const;
    if (order.priority === 'urgent') return 'error' as const;
    if (order.priority === 'high') return 'warning' as const;
    return 'neutral' as const;
  }, [order]);

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
          <SummaryCell label="Fee" value={formatMoney(order.deliveryFee)} highlight />
          <SummaryCell label="Order" value={formatMoney(order.orderAmount)} />
          <SummaryCell label="Distance" value={`${order.distanceMiles} mi`} />
          <SummaryCell label="ETA" value={`${order.etaMinutes} min`} />
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
            label="Message"
            icon="message-text-outline"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Message customer')}
          />
          <AppButton
            label="Navigate"
            icon="navigation-variant"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Navigate')}
          />
        </View>

        <View style={styles.primaryActions}>
          <AppButton
            label="Accept order"
            icon="check"
            variant="secondary"
            fullWidth
            onPress={handleAccept}
          />
          <AppButton
            label="Reject order"
            variant="outline"
            fullWidth
            onPress={() => setRejectOpen(true)}
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
    marginBottom: spacing.lg,
  },
  dummyBtn: {
    flex: 1,
  },
  primaryActions: {
    marginTop: spacing.xs,
  },
});
