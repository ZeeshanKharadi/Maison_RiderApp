import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  colors,
  MAX_FONT_SIZE_MULTIPLIER,
  spacing,
  typography,
} from '../../theme';
import AppButton from './AppButton';

export type EmptyStateVariant = 'empty' | 'search' | 'error' | 'offline' | 'loading';

type Props = {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: EmptyStateVariant;
  style?: ViewStyle;
};

const VARIANT_ICONS: Record<EmptyStateVariant, string> = {
  empty: 'inbox-outline',
  search: 'magnify-close',
  error: 'alert-circle-outline',
  offline: 'wifi-off',
  loading: 'timer-sand',
};

export default function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  variant = 'empty',
  style,
}: Props) {
  const resolvedIcon = icon || VARIANT_ICONS[variant];

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="summary"
      accessibilityLabel={`${title}${message ? `. ${message}` : ''}`}>
      <Icon name={resolvedIcon} size={48} color={colors.textMuted} />
      <Text
        style={styles.title}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
        {title}
      </Text>
      {message ? (
        <Text
          style={styles.message}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="outline"
          size="md"
          style={styles.btn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.section,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  btn: {
    marginTop: spacing.md,
    minWidth: 160,
  },
});
