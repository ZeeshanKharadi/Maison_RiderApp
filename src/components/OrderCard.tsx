import React, { memo, useCallback, useMemo } from 'react';
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
  riderOfferPaymentDisplay,
} from '../data/orders';
import { AppButton } from './ui';
import { formatMilesAsKm } from '../utils/geo';
import {
  colors,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  typography,
} from '../theme';

type Props = {
  order: AvailableOrder;
  onPress: (order: AvailableOrder) => void;
  onAccept: (order: AvailableOrder) => void | Promise<void>;
  onReject: (order: AvailableOrder) => void;
  actionsDisabled?: boolean;
  /** True only for the card whose Accept is in flight. */
  isAccepting?: boolean;
  selected?: boolean;
  onToggleSelect?: (order: AvailableOrder) => void;
  /** When true, checkbox cannot select (still allows deselect). */
  selectionDisabled?: boolean;
};

function OrderCardComponent({
  order,
  onPress,
  onAccept,
  onReject,
  actionsDisabled,
  isAccepting,
  selected,
  onToggleSelect,
  selectionDisabled,
}: Props) {
  const handleAccept = useCallback(() => {
    if (actionsDisabled || isAccepting) return;
    onAccept(order);
  }, [actionsDisabled, isAccepting, onAccept, order]);

  const handleReject = useCallback(() => {
    if (actionsDisabled) return;
    onReject(order);
  }, [actionsDisabled, onReject, order]);

  const handleToggleSelect = useCallback(() => {
    if (!onToggleSelect) return;
    if (selectionDisabled && !selected) return;
    if (actionsDisabled) return;
    onToggleSelect(order);
  }, [actionsDisabled, onToggleSelect, order, selected, selectionDisabled]);

  const shortNo = (order.orderNo ?? '').trim();
  const titleId = shortNo || order.id;
  const payment = riderOfferPaymentDisplay(order);

  const distanceLabel = useMemo(() => {
    if (
      order.distanceMiles == null ||
      !Number.isFinite(order.distanceMiles) ||
      order.distanceMiles <= 0
    ) {
      return null;
    }
    return formatMilesAsKm(order.distanceMiles);
  }, [order.distanceMiles]);

  const etaLabel =
    order.etaMinutes != null &&
    Number.isFinite(order.etaMinutes) &&
    order.etaMinutes > 0
      ? `${Math.round(order.etaMinutes)} min`
      : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${titleId} to ${order.dropoffAddress}. ${payment.label}. Double tap for details.`}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          {onToggleSelect ? (
            <Pressable
              onPress={handleToggleSelect}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: !!selected,
                disabled: !!selectionDisabled && !selected,
              }}
              accessibilityLabel={`Select order ${titleId}`}
              style={styles.checkboxHit}>
              <Icon
                name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={
                  selected
                    ? colors.primaryDark
                    : selectionDisabled
                      ? colors.textDisabled
                      : colors.textMuted
                }
              />
            </Pressable>
          ) : null}
          <Text
            style={styles.orderId}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
            #{titleId}
          </Text>
          <Text
            style={styles.posted}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            accessibilityLabel={`Available ${formatPostedAgo(order.availableSince || order.postedAt)}`}>
            {formatPostedAgo(order.availableSince || order.postedAt)}
          </Text>
        </View>

        <Text
          style={styles.destination}
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          {order.dropoffAddress}
        </Text>
        <Text
          style={styles.pickup}
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          From {order.pickupAddress}
          {order.customerName ? ` · ${order.customerName}` : ''}
        </Text>

        <View style={styles.metaRow}>
          <View
            style={[
              styles.chip,
              payment.kind === 'collect'
                ? styles.chipCash
                : payment.kind === 'paid'
                  ? styles.chipPaid
                  : styles.chipUnknown,
            ]}>
            <Icon
              name={
                payment.kind === 'collect'
                  ? 'cash'
                  : payment.kind === 'paid'
                    ? 'credit-card-check-outline'
                    : 'help-circle-outline'
              }
              size={14}
              color={
                payment.kind === 'collect'
                  ? colors.warning
                  : payment.kind === 'paid'
                    ? colors.success
                    : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.chipText,
                payment.kind === 'collect'
                  ? styles.chipTextCash
                  : payment.kind === 'paid'
                    ? styles.chipTextPaid
                    : styles.chipTextUnknown,
              ]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              {payment.label}
            </Text>
          </View>
          {distanceLabel ? (
            <Meta icon="map-marker-distance" text={distanceLabel} />
          ) : null}
          {etaLabel ? <Meta icon="clock-outline" text={etaLabel} /> : null}
        </View>

        {order.specialInstructions ? (
          <View style={styles.noteBox}>
            <Icon name="note-text-outline" size={14} color={colors.primaryDark} />
            <Text style={styles.instructions} numberOfLines={2}>
              {order.specialInstructions}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            label={isAccepting ? 'Accepting…' : 'Accept'}
            icon="check"
            variant="secondary"
            onPress={handleAccept}
            disabled={actionsDisabled}
            loading={!!isAccepting}
            style={styles.acceptBtn}
            accessibilityLabel={`Accept order ${titleId}`}
          />
          <AppButton
            label="Reject"
            variant="outline"
            onPress={handleReject}
            disabled={actionsDisabled}
            style={styles.rejectBtn}
            accessibilityLabel={`Reject order ${titleId}`}
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
      <Text
        style={styles.metaText}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {text}
      </Text>
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
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  checkboxHit: {
    paddingRight: 2,
  },
  orderId: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryDark,
    flex: 1,
    flexShrink: 1,
  },
  posted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  destination: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  pickup: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
  },
  chipCash: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  chipPaid: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  chipUnknown: {
    backgroundColor: colors.background,
    borderColor: colors.borderStrong,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '700',
  },
  chipTextCash: {
    color: colors.warning,
  },
  chipTextPaid: {
    color: colors.success,
  },
  chipTextUnknown: {
    color: colors.textSecondary,
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
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderInput,
  },
  instructions: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptBtn: {
    flex: 2,
  },
  rejectBtn: {
    flex: 1,
    minWidth: 88,
  },
});
