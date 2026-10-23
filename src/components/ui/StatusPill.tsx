import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  colors,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  typography,
} from '../../theme';

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
      <Text
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        style={[styles.text, { color: t.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.label,
    letterSpacing: 0.2,
    textTransform: 'none',
    fontWeight: '700',
  },
});
