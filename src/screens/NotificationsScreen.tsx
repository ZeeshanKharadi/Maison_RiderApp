import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useAccount } from '../context/AccountContext';
import {
  AppHeader,
  Badge,
  EmptyState,
  FilterChip,
  SearchBar,
  confirmDialog,
} from '../components/ui';
import {
  AppNotification,
  CATEGORY_LABELS,
  NotificationCategory,
  formatNotificationTime,
} from '../data/account';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';

const CATEGORIES: Array<NotificationCategory | 'all'> = [
  'all',
  'orders',
  'payments',
  'bonuses',
  'system',
  'announcements',
  'achievements',
  'support',
];

const NotificationRow = React.memo(function NotificationRow({
  item,
  onRead,
  onDelete,
}: {
  item: AppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const priorityTone =
    item.priority === 'high'
      ? 'error'
      : item.priority === 'low'
        ? 'neutral'
        : 'info';

  return (
    <TouchableOpacity
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={() => onRead(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.read ? 'Read' : 'Unread'}`}
      activeOpacity={0.85}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: item.read ? colors.background : colors.primarySoft },
        ]}>
        <Icon
          name={item.icon}
          size={22}
          color={item.read ? colors.textSecondary : colors.primaryDark}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.desc} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{formatNotificationTime(item.timestamp)}</Text>
          <Badge label={CATEGORY_LABELS[item.category]} tone="neutral" />
          <Badge
            label={item.priority}
            tone={priorityTone as 'error' | 'neutral' | 'info'}
          />
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.title}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="trash-can-outline" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const {
    unreadCount,
    filterNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
  } = useAccount();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');

  const data = useMemo(
    () => filterNotifications(query, category),
    [filterNotifications, query, category],
  );

  const onRead = useCallback(
    (id: string) => markNotificationRead(id),
    [markNotificationRead],
  );

  const onDelete = useCallback(
    (id: string) => {
      confirmDialog({
        title: 'Delete notification',
        message: 'Remove this notification?',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => deleteNotification(id),
      });
    },
    [deleteNotification],
  );

  const onClearAll = () => {
    confirmDialog({
      title: 'Clear all',
      message: 'Delete every notification?',
      confirmLabel: 'Clear all',
      destructive: true,
      onConfirm: clearAllNotifications,
    });
  };

  const renderItem: ListRenderItem<AppNotification> = useCallback(
    ({ item }) => (
      <NotificationRow item={item} onRead={onRead} onDelete={onDelete} />
    ),
    [onRead, onDelete],
  );

  const keyExtractor = useCallback((item: AppNotification) => item.id, []);

  return (
    <View style={styles.container}>
      <AppHeader
        title="Notifications"
        showBack
        onBackPress={() => navigation.goBack()}
        rightIcon="check-all"
        onRightPress={markAllNotificationsRead}
      />

      <View style={styles.toolbar}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search notifications"
        />
        <View style={styles.actions}>
          <Text style={styles.unread}>
            {unreadCount} unread
          </Text>
          <TouchableOpacity
            onPress={markAllNotificationsRead}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            style={styles.actionBtn}>
            <Text style={styles.actionText}>Mark all read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all notifications"
            style={styles.actionBtn}>
            <Text style={[styles.actionText, styles.danger]}>Clear all</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={c => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => (
            <FilterChip
              label={item === 'all' ? 'All' : CATEGORY_LABELS[item]}
              selected={category === item}
              onPress={() => setCategory(item)}
            />
          )}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="bell-outline"
            title="No notifications"
            message="Try another filter or check back later."
          />
        }
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    minHeight: 36,
  },
  unread: { ...typography.caption, flex: 1 },
  actionBtn: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 4 },
  actionText: { ...typography.label, color: colors.primaryDark },
  danger: { color: colors.error },
  chips: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  list: { padding: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryDark,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.bodyStrong, flex: 1 },
  titleUnread: { color: colors.primaryDark },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryDark,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  time: { ...typography.caption },
  deleteBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xxs,
  },
});
