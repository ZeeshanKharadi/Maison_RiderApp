import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Order } from '../data/orders';
import {
  ACCEPT_GREEN,
  BRAND_RED_DARK,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

interface OrderCardProps {
  order: Order;
  onAccept?: (order: Order) => void;
  onReject?: (order: Order) => void;
}

export default function OrderCard({ order, onAccept, onReject }: OrderCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.redAccent} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View
            style={[styles.thumbnail, { backgroundColor: order.imageColor }]}
          />
          <View style={styles.info}>
            <Text style={styles.restaurant}>{order.restaurant}</Text>
            <View style={styles.distanceRow}>
              <Icon name="map-marker" size={14} color={TEXT_MUTED} />
              <Text style={styles.distance}>{order.distance}</Text>
            </View>
          </View>
          <View style={styles.earningsCol}>
            <Text style={styles.earnings}>{order.earnings}</Text>
            <Text style={styles.earningsLabel}>Est. Earnings</Text>
          </View>
        </View>

        <View style={styles.tagsRow}>
          <View style={styles.tag}>
            <Icon name="shopping-outline" size={13} color={TEXT_SECONDARY} />
            <Text style={styles.tagText}>{order.items} items</Text>
          </View>
          <View style={styles.tag}>
            <Icon name="clock-outline" size={13} color={TEXT_SECONDARY} />
            <Text style={styles.tagText}>{order.estTime}</Text>
          </View>
          {order.hot && (
            <View style={styles.hotTag}>
              <Icon name="fire" size={13} color="#FFFFFF" />
              <Text style={styles.hotTagText}>Hot</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => onAccept?.(order)}>
            <Icon name="check" size={18} color="#FFFFFF" />
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={() => onReject?.(order)}>
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  redAccent: {
    width: 4,
    backgroundColor: BRAND_RED_DARK,
  },
  content: {
    flex: 1,
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  restaurant: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distance: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  earningsCol: {
    alignItems: 'flex-end',
  },
  earnings: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_RED_DARK,
  },
  earningsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCEPT_GREEN,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  tagText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  hotTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_RED_DARK,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  hotTagText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCEPT_GREEN,
    borderRadius: 8,
    paddingVertical: 11,
    gap: 6,
  },
  acceptText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  rejectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND_RED_DARK,
    justifyContent: 'center',
  },
  rejectText: {
    color: BRAND_RED_DARK,
    fontWeight: '600',
    fontSize: 14,
  },
});
