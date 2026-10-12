import React from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, radius, spacing } from '../../theme';
import { TOUCH_TARGET } from '../../theme/spacing';

type Props = {
  enabled: boolean;
  onToggle: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Compact voice on/off control for DeliveryMap. */
export default function VoiceGuidanceToggle({
  enabled,
  onToggle,
  style,
}: Props) {
  const label = enabled ? 'Voice guidance on' : 'Voice guidance off';
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.btn, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={label}
      hitSlop={8}>
      <Icon
        name={enabled ? 'volume-high' : 'volume-off'}
        size={22}
        color={enabled ? colors.primaryDark : colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    margin: spacing.xs,
  },
});
