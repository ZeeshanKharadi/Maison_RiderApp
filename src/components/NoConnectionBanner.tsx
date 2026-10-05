import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import { colors, radius, spacing, typography } from '../theme';

/** Compact banner when the phone has no network path. */
export default function NoConnectionBanner({
  detail = 'Connect to the internet to submit changes. Delivery and cash updates are not queued offline.',
}: {
  detail?: string;
}) {
  const { isConnected } = useNetworkConnectivity();
  if (isConnected) return null;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="alert"
      accessibilityLabel={`No connection. ${detail}`}>
      <Icon name="wifi-off" size={20} color={colors.error} />
      <View style={styles.textCol}>
        <Text style={styles.title}>No connection</Text>
        <Text style={styles.body}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#fff5f5',
    borderColor: '#ffc9c9',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  textCol: { flex: 1 },
  title: {
    ...typography.bodyStrong,
    color: colors.error,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
