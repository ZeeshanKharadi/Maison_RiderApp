import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import { BACKGROUND, BRAND_RED_DARK, TEXT_SECONDARY } from '../theme/colors';

export default function DashboardScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hello, {user?.name || 'Rider'}!</Text>
      <Text style={styles.subtitle}>Your delivery dashboard</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Icon name="package-variant" size={28} color={BRAND_RED_DARK} />
          <Text style={styles.statValue}>24</Text>
          <Text style={styles.statLabel}>Today's Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="cash" size={28} color={BRAND_RED_DARK} />
          <Text style={styles.statValue}>$186</Text>
          <Text style={styles.statLabel}>Today's Earnings</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Icon name="star" size={28} color={BRAND_RED_DARK} />
          <Text style={styles.statValue}>4.9</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statCard}>
          <Icon name="map-marker-distance" size={28} color={BRAND_RED_DARK} />
          <Text style={styles.statValue}>42 mi</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
      </View>
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
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_RED_DARK,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 4,
    textAlign: 'center',
  },
});
