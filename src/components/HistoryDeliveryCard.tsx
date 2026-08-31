import React, { memo } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DeliveryHistoryItem } from '../data/deliveryHistory';
import { Badge, InfoRow, StatusPill } from './ui';
import { paymentLabel } from '../data/orders';
import { formatMoney, formatTime } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  item: DeliveryHistoryItem;
  expanded: boolean;
  onToggle: () => void;
};

function statusTone(
  status: DeliveryHistoryItem['status'],
): 'success' | 'error' | 'warning' {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled') return 'error';
  return 'warning';
}

function statusLabel(status: DeliveryHistoryItem['status']) {
  if (status === 'delivered') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Failed';
}

function HistoryDeliveryCardComponent({ item, expanded, onToggle }: Props) {
  const earnings = item.deliveryFee + item.tip;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onToggle();
      }}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`Delivery ${item.id}, ${statusLabel(item.status)}. ${expanded ? 'Collapse' : 'Expand'} details.`}>
      <View style={styles.top}>
        <View style={[styles.thumb, { backgroundColor: item.imageColor }]}>
          <Icon name="storefront-outline" size={20} color={colors.textOnPrimary} />
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.orderId}>{item.id}</Text>
            <StatusPill
              label={statusLabel(item.status)}
              tone={statusTone(item.status)}
            />
          </View>
          <Text style={styles.customer} numberOfLines={1}>
            {item.customerName} · {item.restaurant}
          </Text>
          <Text style={styles.time}>
            {formatTime(item.deliveredAt)}
            {item.rating != null ? ` · ★ ${item.rating.toFixed(1)}` : ''}
          </Text>
        </View>
        <View style={styles.feeCol}>
          <Text
            style={[
              styles.fee,
              item.status !== 'delivered' && styles.feeMuted,
            ]}>
            {item.status === 'delivered' ? `+${formatMoney(earnings)}` : '—'}
          </Text>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.route}>
        <Text style={styles.addr} numberOfLines={1}>
          ↑ {item.pickupAddress}
        </Text>
        <Text style={styles.addrDrop} numberOfLines={1}>
          ↓ {item.dropoffAddress}
        </Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Fee {formatMoney(item.deliveryFee)} · Order{' '}
          {formatMoney(item.orderAmount)}
        </Text>
        <Text style={styles.metaText}>{item.distanceMiles} mi</Text>
      </View>

      <View style={styles.badges}>
        <Badge
          label={paymentLabel(item.paymentMethod)}
          tone="neutral"
          icon="credit-card-outline"
        />
        {item.isCod ? <Badge label="COD" tone="warning" icon="cash" /> : null}
        {item.express ? (
          <Badge label="Express" tone="info" icon="lightning-bolt" />
        ) : null}
        {item.priority ? (
          <Badge label="Priority" tone="error" icon="flag" />
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.expanded}>
          <Text style={styles.section}>Timeline</Text>
          {item.timeline.map((step, index) => (
            <View key={`${step.state}-${index}`} style={styles.timelineRow}>
              <View style={styles.rail}>
                <View style={styles.dot} />
                {index < item.timeline.length - 1 ? (
                  <View style={styles.line} />
                ) : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.stepTime}>
                  {step.at ? formatTime(step.at) : '—'}
                </Text>
              </View>
            </View>
          ))}

          <Text style={[styles.section, { marginTop: spacing.md }]}>
            Details
          </Text>
          <InfoRow
            icon="package-variant"
            label="Package"
            value={item.packageInfo}
          />
          <InfoRow
            icon="credit-card-outline"
            label="Payment method"
            value={paymentLabel(item.paymentMethod)}
          />
          <InfoRow
            icon="cash"
            label="COD status"
            value={
              item.isCod
                ? item.cashCollected
                  ? 'Cash collected'
                  : 'COD — not collected'
                : 'Prepaid'
            }
          />
          {item.rating != null ? (
            <InfoRow
              icon="star"
              label="Customer rating"
              value={`${item.rating.toFixed(1)} / 5`}
            />
          ) : null}
          <InfoRow
            icon="timer-outline"
            label="Duration"
            value={
              item.durationMin > 0 ? `${item.durationMin} min` : '—'
            }
          />
          {item.specialInstructions ? (
            <InfoRow
              icon="note-text-outline"
              label="Special instructions"
              value={item.specialInstructions}
            />
          ) : null}
          {item.deliveryNotes ? (
            <InfoRow
              icon="message-text-outline"
              label="Delivery notes"
              value={item.deliveryNotes}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const HistoryDeliveryCard = memo(HistoryDeliveryCardComponent);
export default HistoryDeliveryCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.medium,
  },
  pressed: { opacity: 0.97 },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
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
  time: {
    ...typography.caption,
    marginTop: 2,
  },
  feeCol: { alignItems: 'flex-end', marginLeft: spacing.xs },
  fee: {
    ...typography.bodyStrong,
    color: colors.success,
    marginBottom: 4,
  },
  feeMuted: { color: colors.textMuted },
  route: { marginTop: spacing.sm },
  addr: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  addrDrop: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  metaText: { ...typography.caption, fontWeight: '600' },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  expanded: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  section: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  timelineRow: { flexDirection: 'row', minHeight: 40 },
  rail: { width: 16, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: colors.successSoft,
    marginVertical: 2,
  },
  stepBody: { flex: 1, paddingBottom: spacing.xs },
  stepLabel: { ...typography.bodyStrong, fontSize: 13 },
  stepTime: { ...typography.caption, marginTop: 1 },
});
