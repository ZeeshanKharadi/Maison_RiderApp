import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BACKGROUND, BRAND_RED_DARK, TEXT_SECONDARY } from '../theme/colors';

export default function WalletScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>$342.50</Text>
        <View style={styles.balanceActions}>
          <View style={styles.actionBtn}>
            <Icon name="bank-transfer-out" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>Withdraw</Text>
          </View>
          <View style={styles.actionBtnOutline}>
            <Icon name="history" size={20} color={BRAND_RED_DARK} />
            <Text style={styles.actionTextOutline}>History</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      {[
        { label: 'Delivery #1055', amount: '+$12.50', date: 'Today' },
        { label: 'Delivery #1052', amount: '+$18.75', date: 'Today' },
        { label: 'Withdrawal', amount: '-$100.00', date: 'Yesterday' },
      ].map((tx, i) => (
        <View key={i} style={styles.txRow}>
          <View>
            <Text style={styles.txLabel}>{tx.label}</Text>
            <Text style={styles.txDate}>{tx.date}</Text>
          </View>
          <Text
            style={[
              styles.txAmount,
              tx.amount.startsWith('-') ? styles.txNegative : styles.txPositive,
            ]}>
            {tx.amount}
          </Text>
        </View>
      ))}
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
  balanceCard: {
    backgroundColor: BRAND_RED_DARK,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 20,
  },
  balanceActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  actionTextOutline: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  txLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  txDate: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txPositive: { color: '#2E7D32' },
  txNegative: { color: BRAND_RED_DARK },
});
