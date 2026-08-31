import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, typography } from '../../theme';

type Props = {
  icon?: string;
  label: string;
  value: string;
  style?: ViewStyle;
};

export default function InfoRow({ icon, label, value, style }: Props) {
  return (
    <View style={[styles.row, style]} accessibilityLabel={`${label}: ${value}`}>
      {icon ? (
        <Icon name={icon} size={18} color={colors.primaryDark} style={styles.icon} />
      ) : null}
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  icon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  textCol: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    marginBottom: 2,
  },
  value: {
    ...typography.bodyStrong,
  },
});
