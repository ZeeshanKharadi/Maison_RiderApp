import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

type Props = {
  label: string;
  tone?: StatusTone;
  style?: ViewStyle;
};

const TONES: Record<StatusTone, { bg: string; text: string }> = {
  success: { bg: colors.successSoft, text: colors.success },
  warning: { bg: colors.warningSoft, text: colors.warning },
  error: { bg: colors.errorSoft, text: colors.error },
  info: { bg: colors.infoSoft, text: colors.info },
  neutral: { bg: colors.background, text: colors.textSecondary },
};

export default function StatusPill({ label, tone = 'neutral', style }: Props) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: t.bg }, style]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}>
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
