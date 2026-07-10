import React from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import { useSideMenu } from '../context/SideMenuContext';
import {
  ACCEPT_GREEN,
  BRAND_RED_DARK,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.8;

const MENU_ITEMS = [
  { icon: 'history', label: 'Route History' },
  { icon: 'chart-line', label: 'Performance' },
  { icon: 'help-circle-outline', label: 'Help Center' },
  { icon: 'moped', label: 'Vehicles' },
];

export default function SideMenu() {
  const { isOpen, closeMenu } = useSideMenu();
  const { user, logout } = useAuth();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isOpen, slideAnim]);

  const handleLogout = () => {
    closeMenu();
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={closeMenu}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeMenu} />
        <Animated.View
          style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Icon name="account" size={36} color={BRAND_RED_DARK} />
            </View>
            <Text style={styles.userName}>{user?.name || 'Alex Rider'}</Text>
            <Text style={styles.userId}>#{user?.id || 'RD-9921'}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>ACTIVE NOW</Text>
            </View>
          </View>

          <View style={styles.menuSection}>
            {MENU_ITEMS.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuItem}
                onPress={() => {
                  closeMenu();
                  Alert.alert(item.label, 'Coming soon!');
                }}>
                <Icon name={item.icon} size={22} color={TEXT_SECONDARY} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Icon name="logout" size={22} color={BRAND_RED_DARK} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    paddingTop: 48,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  profileSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND_RED_DARK,
    marginBottom: 4,
  },
  userId: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCEPT_GREEN,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCEPT_GREEN,
    letterSpacing: 1,
  },
  menuSection: {
    paddingTop: 16,
    paddingHorizontal: 12,
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 16,
  },
  menuLabel: {
    fontSize: 15,
    color: TEXT_PRIMARY,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_RED_DARK,
  },
});
