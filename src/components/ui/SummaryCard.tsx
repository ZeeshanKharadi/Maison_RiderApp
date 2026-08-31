import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, elevation, radius, spacing, typography } from '../../theme';

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
            <Text style={[styles.label, brand && styles.labelBrand]}>
              {item.label}
            </Text>
            <Text style={[styles.value, brand && styles.valueBrand]}>
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
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  brand: {
    backgroundColor: colors.primaryDark,
  },
  surface: {
    backgroundColor: colors.surface,
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
    color: colors.textMuted,
  },
  labelBrand: {
    color: 'rgba(255,255,255,0.75)',
  },
  value: {
    ...typography.title,
    fontSize: 18,
  },
  valueBrand: {
    color: colors.textOnPrimary,
  },
});
