import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, radius, spacing, TOUCH_TARGET, typography } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'md' | 'sm';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export default function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  fullWidth,
  style,
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;
  const palette = getPalette(variant);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.borderWidth,
          opacity: isDisabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.text} size="small" />
      ) : (
        <>
          {icon ? (
            <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.text} />
          ) : null}
          <Text
            style={[
              size === 'sm' ? typography.buttonSmall : typography.button,
              { color: palette.text },
            ]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getPalette(variant: ButtonVariant) {
  switch (variant) {
    case 'secondary':
      return {
        bg: colors.success,
        text: colors.textOnPrimary,
        border: colors.success,
        borderWidth: 0,
      };
    case 'outline':
      return {
        bg: 'transparent',
        text: colors.primaryDark,
        border: colors.primaryDark,
        borderWidth: 1,
      };
    case 'danger':
      return {
        bg: colors.errorSoft,
        text: colors.error,
        border: colors.error,
        borderWidth: 1,
      };
    case 'ghost':
      return {
        bg: colors.background,
        text: colors.textPrimary,
        border: colors.border,
        borderWidth: 1,
      };
    case 'primary':
    default:
      return {
        bg: colors.primaryDark,
        text: colors.textOnPrimary,
        border: colors.primaryDark,
        borderWidth: 0,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    minHeight: TOUCH_TARGET,
  },
  md: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  fullWidth: {
    width: '100%',
  },
});
