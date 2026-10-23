import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  colors,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  typography,
} from '../../theme';

type SummaryItem = {
  label: string;
  value: string;
};

type Props = {
  items: SummaryItem[];
  variant?: 'brand' | 'surface';
  style?: ViewStyle;
};

export default function SummaryCard({
  items,
  variant = 'brand',
  style,
}: Props) {
  const brand = variant === 'brand';

  return (
    <View
      style={[styles.card, brand ? styles.brand : styles.surface, style]}
      accessibilityRole="summary">
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? (
            <View
              style={[
                styles.divider,
                { backgroundColor: brand ? 'rgba(255,255,255,0.2)' : colors.border },
              ]}
            />
          ) : null}
          <View style={styles.item}>
            <Text
              style={[styles.label, brand && styles.labelBrand]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              {item.label}
            </Text>
            <Text
              style={[styles.value, brand && styles.valueBrand]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
              {item.value}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  brand: {
    backgroundColor: colors.primaryDark,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.small,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xxs,
    color: colors.textSecondary,
  },
  labelBrand: {
    color: 'rgba(255,255,255,0.85)',
  },
  value: {
    ...typography.title,
  },
  valueBrand: {
    color: colors.textOnPrimary,
  },
});
