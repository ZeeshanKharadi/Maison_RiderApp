import React, { useMemo } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import { useSideMenu } from '../context/SideMenuContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useAccount } from '../context/AccountContext';
import { navigate } from '../navigation/RootNavigation';
import { confirmDialog, StatusPill } from './ui';
import { APP_VERSION } from '../constants/app';
import { formatMoney } from '../utils/format';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.82, 340);

type MenuTarget =
  | { kind: 'stack'; screen: string; params?: object }
  | { kind: 'tab'; screen: string };

type MenuItem = {
  icon: string;
  label: string;
  target: MenuTarget;
  badge?: number;
};

export default function SideMenu() {
  const { isOpen, closeMenu } = useSideMenu();
  const { user, logout } = useAuth();
  const { isOnline, activeJob, wallet } = useRiderSession();
  const { profile, unreadCount } = useAccount();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isOpen, slideAnim]);

  const shiftLabel = activeJob
    ? 'On delivery'
    : isOnline
      ? 'On shift'
      : 'Off shift';

  const menuItems: MenuItem[] = useMemo(
    () => [
      { icon: 'view-dashboard-outline', label: 'Dashboard', target: { kind: 'tab', screen: 'Dashboard' } },
      { icon: 'truck-delivery-outline', label: 'Orders', target: { kind: 'tab', screen: 'Orders' } },
      { icon: 'history', label: 'History', target: { kind: 'stack', screen: 'RouteHistory' } },
      { icon: 'chart-line', label: 'Performance', target: { kind: 'stack', screen: 'Performance' } },
      { icon: 'wallet-outline', label: 'Wallet', target: { kind: 'tab', screen: 'Wallet' } },
      {
        icon: 'bell-outline',
        label: 'Notifications',
        target: { kind: 'stack', screen: 'Notifications' },
        badge: unreadCount > 0 ? unreadCount : undefined,
      },
      { icon: 'account-outline', label: 'Profile', target: { kind: 'tab', screen: 'Profile' } },
      { icon: 'cog-outline', label: 'Settings', target: { kind: 'stack', screen: 'Settings' } },
      { icon: 'help-circle-outline', label: 'Help', target: { kind: 'stack', screen: 'Help' } },
    ],
    [unreadCount],
  );

  const handleLogout = () => {
    closeMenu();
    confirmDialog({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmLabel: 'Logout',
      destructive: true,
      onConfirm: logout,
    });
  };

  const handleMenuPress = (item: MenuItem) => {
    closeMenu();
    setTimeout(() => {
      if (item.target.kind === 'tab') {
        navigate('MainDrawer', {
          screen: 'Tabs',
          params: { screen: item.target.screen },
        });
        return;
      }
      navigate('MainDrawer', {
        screen: item.target.screen,
        params: item.target.params,
      });
    }, 260);
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={closeMenu}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={closeMenu}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <Animated.View
          style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
          accessibilityViewIsModal>
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Icon name="account" size={36} color={colors.primaryDark} />
            </View>
            <Text style={styles.userName}>
              {user?.name || profile.fullName || 'Rider'}
            </Text>
            <Text style={styles.userId}>#{user?.id || 'RD-9921'}</Text>
            <View style={styles.statusRow}>
              <StatusPill
                label={isOnline ? 'Online' : 'Offline'}
                tone={isOnline ? 'success' : 'neutral'}
              />
              <StatusPill
                label={shiftLabel}
                tone={activeJob ? 'info' : isOnline ? 'success' : 'neutral'}
              />
            </View>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available balance</Text>
              <Text style={styles.balanceValue}>{formatMoney(wallet.balance)}</Text>
            </View>
          </View>

          <ScrollView
            style={styles.menuSection}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}>
            {menuItems.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuItem}
                onPress={() => handleMenuPress(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.badge
                    ? `${item.label}, ${item.badge} unread`
                    : item.label
                }>
                <Icon name={item.icon} size={22} color={colors.textSecondary} />
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.badge != null ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {item.badge > 9 ? '9+' : item.badge}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Logout">
              <Icon name="logout" size={22} color={colors.primaryDark} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
            <Text style={styles.version}>Version {APP_VERSION}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    paddingTop: 48,
    ...elevation.large,
  },
  profileSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  userName: {
    ...typography.title,
    color: colors.primaryDark,
    marginBottom: 2,
  },
  userId: { ...typography.caption, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  balanceCard: {
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  balanceLabel: { ...typography.caption, color: colors.primaryDark },
  balanceValue: {
    ...typography.heading,
    fontSize: 22,
    color: colors.primaryDark,
    marginTop: 2,
  },
  menuSection: { flex: 1 },
  menuContent: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.sm,
  },
  menuLabel: { ...typography.bodyStrong, fontWeight: '500', flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingBottom: spacing.md,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    minHeight: TOUCH_TARGET + 8,
  },
  logoutText: { ...typography.subtitle, color: colors.primaryDark },
  version: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
});
