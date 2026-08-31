import React, { memo, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  AvailableOrder,
  formatPostedAgo,
  paymentLabel,
} from '../data/orders';
import { Badge, AppButton } from './ui';
import { formatMoney } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';

type Props = {
  order: AvailableOrder;
  onPress: (order: AvailableOrder) => void;
  onAccept: (order: AvailableOrder) => void;
  onReject: (order: AvailableOrder) => void;
};

function OrderCardComponent({ order, onPress, onAccept, onReject }: Props) {
  const handleAccept = useCallback(() => {
    onAccept(order);
  }, [onAccept, order]);

  const handleReject = useCallback(() => {
    onReject(order);
  }, [onReject, order]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id} for ${order.customerName}. Fee ${formatMoney(order.deliveryFee)}. Double tap for details.`}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.orderId}>{order.id}</Text>
            <Text style={styles.customer} numberOfLines={1}>
              {order.customerName} · {order.restaurant}
            </Text>
          </View>
          <View style={styles.feeCol}>
            <Text style={styles.fee}>{formatMoney(order.deliveryFee)}</Text>
            <Text style={styles.feeLabel}>Delivery fee</Text>
          </View>
        </View>

        <View style={styles.route}>
          <View style={styles.routeRail}>
            <View style={styles.dotPickup} />
            <View style={styles.rail} />
            <View style={styles.dotDrop} />
          </View>
          <View style={styles.routeText}>
            <Text style={styles.addr} numberOfLines={1}>
              {order.pickupAddress}
            </Text>
            <Text style={[styles.addr, styles.addrDrop]} numberOfLines={1}>
              {order.dropoffAddress}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Meta icon="map-marker-distance" text={`${order.distanceMiles} mi`} />
          <Meta icon="clock-outline" text={`${order.etaMinutes} min`} />
          <Meta icon="cash" text={formatMoney(order.orderAmount)} />
          <Meta
            icon="credit-card-outline"
            text={paymentLabel(order.paymentMethod)}
          />
        </View>

        <View style={styles.badges}>
          {order.isCod ? <Badge label="COD" tone="warning" icon="cash" /> : null}
          {order.priority !== 'normal' ? (
            <Badge
              label={order.priority === 'urgent' ? 'Urgent' : 'Priority'}
              tone="error"
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

        {order.specialInstructions ? (
          <Text style={styles.instructions} numberOfLines={1}>
            Note: {order.specialInstructions}
          </Text>
        ) : null}

        <Text style={styles.posted}>{formatPostedAgo(order.postedAt)}</Text>

        <View style={styles.actions}>
          <AppButton
            label="Accept"
            icon="check"
            variant="secondary"
            onPress={handleAccept}
            style={styles.acceptBtn}
            accessibilityLabel={`Accept order ${order.id}`}
          />
          <AppButton
            label="Reject"
            variant="outline"
            onPress={handleReject}
            style={styles.rejectBtn}
            accessibilityLabel={`Reject order ${order.id}`}
          />
        </View>
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const OrderCard = memo(OrderCardComponent);
export default OrderCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    overflow: 'hidden',
    ...elevation.medium,
  },
  pressed: {
    opacity: 0.96,
  },
  accent: {
    width: 4,
    backgroundColor: colors.primaryDark,
  },
  body: {
    flex: 1,
    padding: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  orderId: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  customer: {
    ...typography.bodyStrong,
    marginTop: 2,
  },
  feeCol: {
    alignItems: 'flex-end',
  },
  fee: {
    ...typography.title,
    color: colors.success,
    fontSize: 18,
  },
  feeLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success,
  },
  route: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  routeRail: {
    width: 12,
    alignItems: 'center',
    marginRight: spacing.xs,
    paddingTop: 4,
  },
  dotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryDark,
  },
  rail: {
    width: 2,
    flex: 1,
    minHeight: 16,
    backgroundColor: colors.border,
    marginVertical: 3,
  },
  dotDrop: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  routeText: {
    flex: 1,
    gap: spacing.xs,
  },
  addr: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  addrDrop: {
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  metaText: {
    ...typography.caption,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginBottom: spacing.xs,
  },
  instructions: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xxs,
  },
  posted: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptBtn: {
    flex: 1,
  },
  rejectBtn: {
    minWidth: 96,
  },
});
