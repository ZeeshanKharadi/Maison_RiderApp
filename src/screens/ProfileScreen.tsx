import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import {
  ACCEPT_GREEN,
  BACKGROUND,
  BRAND_RED_DARK,
  TEXT_SECONDARY,
} from '../theme/colors';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Icon name="account" size={48} color={BRAND_RED_DARK} />
        </View>
        <Text style={styles.name}>{user?.name || 'Alex Rider'}</Text>
        <Text style={styles.id}>#{user?.id || 'RD-9921'}</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>ACTIVE NOW</Text>
        </View>
      </View>

      {[
        { icon: 'email-outline', label: 'Email', value: user?.email || 'alex@rapiddelivery.com' },
        { icon: 'phone-outline', label: 'Phone', value: '+1 (555) 000-0000' },
        { icon: 'moped', label: 'Vehicle', value: 'Scooter - Honda Activa' },
      ].map((item, i) => (
        <View key={i} style={styles.infoRow}>
          <Icon name={item.icon} size={20} color={TEXT_SECONDARY} />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>{item.label}</Text>
            <Text style={styles.infoValue}>{item.value}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Icon name="logout" size={20} color="#FFFFFF" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
    padding: 20,
    paddingTop: 24,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: BRAND_RED_DARK,
    marginBottom: 4,
  },
  id: {
    fontSize: 13,
    color: TEXT_SECONDARY,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_RED_DARK,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 20,
    gap: 8,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
