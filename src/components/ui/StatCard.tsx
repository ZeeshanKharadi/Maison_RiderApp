import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  colors,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  typography,
} from '../../theme';

type Props = {
  label: string;
  value: string;
  icon?: string;
  hint?: string;
  iconColor?: string;
  style?: ViewStyle;
};

export default function StatCard({
  label,
  value,
  icon,
  hint,
  iconColor = colors.primaryDark,
  style,
}: Props) {
  return (
    <View
      style={[styles.card, style]}
      accessibilityRole="summary"
      accessibilityLabel={`${label}: ${value}`}>
      {icon ? <Icon name={icon} size={22} color={iconColor} /> : null}
      <Text style={styles.value} maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {value}
      </Text>
      <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.hint} maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.small,
  },
  value: {
    ...typography.title,
    marginTop: spacing.xs,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  hint: {
    ...typography.caption,
    marginTop: spacing.xxs,
  },
});
