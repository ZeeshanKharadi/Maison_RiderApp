import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme';

type Props = {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
};

export default function SectionHeader({
  title,
  actionLabel,
  onActionPress,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    fontSize: 16,
  },
  action: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
});
