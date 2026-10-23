import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './ui';
import {
  colors,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  spacing,
  typography,
} from '../theme';

type Props = {
  selectedCount: number;
  remainingSlots: number;
  onAcceptSelected: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/** Sticky multi-accept control — only mounts when at least one order is selected. */
export default function AcceptSelectedBar({
  selectedCount,
  remainingSlots,
  onAcceptSelected,
  disabled,
  loading,
}: Props) {
  const insets = useSafeAreaInsets();
  if (selectedCount <= 0) return null;

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
      accessibilityRole="summary">
      {remainingSlots <= 0 ? (
        <Text
          style={styles.limitText}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          Active order limit reached (5). Finish a delivery before accepting more.
        </Text>
      ) : selectedCount > remainingSlots ? (
        <Text
          style={styles.limitText}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          You can accept {remainingSlots} more order
          {remainingSlots === 1 ? '' : 's'} (5 active max).
        </Text>
      ) : null}
      <AppButton
        label={
          loading
            ? 'Accepting…'
            : `Accept selected (${Math.min(selectedCount, Math.max(remainingSlots, 0))})`
        }
        icon="check-all"
        variant="secondary"
        fullWidth
        onPress={onAcceptSelected}
        disabled={disabled || loading || remainingSlots <= 0}
        loading={!!loading}
        accessibilityLabel={`Accept ${selectedCount} selected orders`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    ...elevation.small,
  },
  limitText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
    marginBottom: spacing.xxs,
  },
});
