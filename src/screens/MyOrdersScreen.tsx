import React, { useCallback, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSideMenu } from '../context/SideMenuContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import { navigate } from '../navigation/RootNavigation';
import NoConnectionBanner from '../components/NoConnectionBanner';
import { AppHeader, EmptyState, StatusPill } from '../components/ui';
import { ActiveDeliveryJob, jobProgress } from '../delivery/types';
import { getStateConfig } from '../delivery/stateMachine';
import { formatPostedAgo } from '../data/orders';
import { formatMoney } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

/**
 * My Orders — all active deliveries currently assigned to this rider (server-backed session).
 */
export default function MyOrdersScreen() {
  const navigation = useNavigation();
  const { openMenu } = useSideMenu();
  const { activeJobs, selectActiveJob, restoreActiveDeliveries } =
    useRiderSession();
  const { isConnected } = useNetworkConnectivity();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      if (!isConnected) {
        setError('No connection. Connect to refresh your active orders.');
        return;
      }
      await restoreActiveDeliveries({ suppressCancelAlert: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not refresh active orders from the server.',
      );
    } finally {
      setRefreshing(false);
    }
  }, [isConnected, restoreActiveDeliveries]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const openJob = useCallback(
    (job: ActiveDeliveryJob) => {
      selectActiveJob(job.id);
      navigate('MainDrawer', { screen: 'ActiveDelivery' });
    },
    [selectActiveJob],
  );

  const renderItem: ListRenderItem<ActiveDeliveryJob> = useCallback(
    ({ item }) => {
      const config = getStateConfig(item.state);
      const progress = jobProgress(item);
      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => openJob(item)}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.id}, ${config.pillLabel}`}>
          <View style={styles.topRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.orderId}>{item.id}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.customerName} · {item.restaurant}
              </Text>
            </View>
            <StatusPill label={config.pillLabel} tone={config.pillTone} />
          </View>
          <Text style={styles.route} numberOfLines={1}>
            {item.pickupAddress} → {item.dropoffAddress}
          </Text>
          <View style={styles.footer}>
            <Text style={styles.posted}>
              {formatPostedAgo(item.acceptedAt || item.stateTimestamps.ACCEPTED || '')}
            </Text>
            <Text style={styles.progress}>{progress}%</Text>
            <Text style={styles.fee}>{formatMoney(item.deliveryFee || item.orderAmount)}</Text>
            <Icon name="chevron-right" size={22} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      );
    },
    [openJob],
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title="My Orders"
        showBack
        onBackPress={() => navigation.goBack()}
        showMenu
        onMenuPress={openMenu}
        rightIcon="bell-outline"
        onRightPress={() =>
          navigate('MainDrawer', { screen: 'Notifications' })
        }
      />
      <NoConnectionBanner />
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={activeJobs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          activeJobs.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primaryDark}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-list-outline"
            title="No active orders"
            message={
              isConnected
                ? 'Orders you accept will appear here until you complete them.'
                : 'Connect to the internet to load your active orders.'
            }
            actionLabel="Browse available"
            onAction={() => {
              navigation.goBack();
              navigate('MainDrawer', {
                screen: 'Tabs',
                params: { screen: 'Orders' },
              });
            }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  emptyList: { flexGrow: 1, padding: spacing.md },
  errorBanner: {
    backgroundColor: colors.errorSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.error },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
    minHeight: TOUCH_TARGET + 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  orderId: { ...typography.bodyStrong, color: colors.primaryDark },
  meta: { ...typography.caption, marginTop: 2 },
  route: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  posted: { ...typography.caption, flex: 1 },
  progress: { ...typography.caption, color: colors.textMuted },
  fee: { ...typography.bodyStrong },
});
