import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSideMenu } from '../context/SideMenuContext';
import OrderCard from '../components/OrderCard';
import { MOCK_ORDERS, Order } from '../data/orders';
import {
  BACKGROUND,
  BRAND_RED_DARK,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

export default function OrdersScreen() {
  const { openMenu } = useSideMenu();
  const [orders, setOrders] = useState(MOCK_ORDERS);

  const handleAccept = (order: Order) => {
    Alert.alert('Order Accepted', `You accepted order from ${order.restaurant}`);
    setOrders(prev => prev.filter(o => o.id !== order.id));
  };

  const handleReject = (order: Order) => {
    setOrders(prev => prev.filter(o => o.id !== order.id));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={openMenu}>
          <Icon name="menu" size={26} color={BRAND_RED_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RapidDelivery</Text>
        <TouchableOpacity>
          <View>
            <Icon name="bell-outline" size={24} color={BRAND_RED_DARK} />
            <View style={styles.notifDot} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Available Orders</Text>
        <Text style={styles.pageSubtitle}>
          {orders.length} delivery opportunities nearby
        </Text>

        <View style={styles.filterRow}>
          <TouchableOpacity style={styles.filterBtn}>
            <Icon name="filter-variant" size={16} color={TEXT_PRIMARY} />
            <Text style={styles.filterText}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn}>
            <Icon name="swap-vertical" size={16} color={TEXT_PRIMARY} />
            <Text style={styles.filterText}>Sort</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapPreview}>
          <View style={styles.mapGrid}>
            {[...Array(12)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.mapDot,
                  {
                    top: `${10 + (i % 4) * 22}%` as any,
                    left: `${8 + (i % 3) * 30}%` as any,
                    backgroundColor: i === 5 ? '#2196F3' : BRAND_RED_DARK,
                    width: i === 5 ? 14 : 8,
                    height: i === 5 ? 14 : 8,
                    borderRadius: i === 5 ? 7 : 4,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.trafficPill}>
            <View style={styles.trafficDot} />
            <Text style={styles.trafficText}>Live Traffic: Moderate</Text>
          </View>
          <View style={styles.mapSidebar}>
            {orders.slice(0, 3).map(o => (
              <Text key={o.id} style={styles.sidebarItem} numberOfLines={1}>
                #{o.id} - {o.restaurant.split(' ')[0]}, {o.earnings}
              </Text>
            ))}
          </View>
        </View>

        {orders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        ))}

        {orders.length > 0 && (
          <TouchableOpacity style={styles.viewMore}>
            <Text style={styles.viewMoreText}>View more orders</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_RED_DARK,
  },
  notifDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND_RED_DARK,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBEBEB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  mapPreview: {
    height: 160,
    backgroundColor: '#E8E4DC',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  mapGrid: {
    flex: 1,
    position: 'relative',
  },
  mapDot: {
    position: 'absolute',
  },
  trafficPill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  trafficDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND_RED_DARK,
  },
  trafficText: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  mapSidebar: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '38%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 8,
    justifyContent: 'center',
    gap: 6,
  },
  sidebarItem: {
    fontSize: 10,
    color: TEXT_SECONDARY,
  },
  viewMore: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewMoreText: {
    color: BRAND_RED_DARK,
    fontWeight: '600',
    fontSize: 14,
  },
});
