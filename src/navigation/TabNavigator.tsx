import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DashboardScreen from '../screens/DashboardScreen';
import OrdersScreen from '../screens/OrdersScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme';
import { BRAND_RED_DARK, TEXT_MUTED } from '../theme/colors';

const Tab = createBottomTabNavigator();

function TabIcon({
  name,
  focused,
  label,
}: {
  name: string;
  focused: boolean;
  label: string;
}) {
  if (focused) {
    return (
      <View style={styles.activePill}>
        <Icon name={name} size={20} color={colors.textOnPrimary} />
        <Text style={styles.activeLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.inactiveTab}>
      <Icon name={name} size={22} color={TEXT_MUTED} />
      <Text style={styles.inactiveLabel}>{label}</Text>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="view-grid" focused={focused} label="Dashboard" />
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="truck-delivery" focused={focused} label="Orders" />
          ),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="wallet-outline" focused={focused} label="Wallet" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="account-outline" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_RED_DARK,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  activeLabel: {
    color: colors.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  inactiveTab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  inactiveLabel: {
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: '500',
  },
});
