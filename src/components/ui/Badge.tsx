import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, radius, spacing } from '../../theme';

type BadgeTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'star';

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: string;
  style?: ViewStyle;
};

const TONES: Record<
  BadgeTone,
  { bg: string; text: string; icon: string }
> = {
  primary: { bg: colors.primarySoft, text: colors.primaryDark, icon: colors.primaryDark },
  success: { bg: colors.successSoft, text: colors.success, icon: colors.success },
  warning: { bg: colors.warningSoft, text: colors.warning, icon: colors.warning },
  error: { bg: colors.errorSoft, text: colors.error, icon: colors.error },
  info: { bg: colors.infoSoft, text: colors.info, icon: colors.info },
  neutral: { bg: colors.background, text: colors.textSecondary, icon: colors.textMuted },
  star: { bg: colors.starSoft, text: colors.star, icon: colors.star },
};

export default function Badge({ label, tone = 'neutral', icon, style }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.icon} /> : null}
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
