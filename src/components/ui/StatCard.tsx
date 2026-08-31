import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, elevation, radius, spacing, typography } from '../../theme';

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
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...elevation.small,
  },
  value: {
    ...typography.title,
    fontSize: 20,
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
