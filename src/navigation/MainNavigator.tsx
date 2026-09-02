import React from 'react';
import { View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import TabNavigator from './TabNavigator';
import SideMenu from '../components/SideMenu';
import { NotificationHandler } from '../components/NotificationHandler';
import { SideMenuProvider } from '../context/SideMenuContext';
import { RiderSessionProvider } from '../context/RiderSessionContext';
import { AvailableOrdersProvider } from '../context/AvailableOrdersContext';
import { AccountProvider } from '../context/AccountContext';
import { useRiderNotificationPoll } from '../hooks/useRiderNotificationPoll';
import HistoryScreen from '../screens/HistoryScreen';
import PerformanceScreen from '../screens/PerformanceScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HelpScreen from '../screens/HelpScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import ActiveDeliveryScreen from '../screens/ActiveDeliveryScreen';

export type MainStackParamList = {
  Tabs: undefined;
  RouteHistory: undefined;
  Performance: undefined;
  Notifications: undefined;
  Settings: undefined;
  Help: { section?: 'faq' | 'support' | 'report' | 'feedback' | 'privacy' | 'terms' } | undefined;
  OrderDetails: { orderId: string };
  ActiveDelivery: undefined;
};

const Stack = createStackNavigator<MainStackParamList>();

function RiderNotificationPoller() {
  useRiderNotificationPoll(true);
  return null;
}

export default function MainNavigator() {
  return (
    <SideMenuProvider>
      <RiderSessionProvider>
        <AvailableOrdersProvider>
          <AccountProvider>
            <NotificationHandler />
            <RiderNotificationPoller />
            <View style={{ flex: 1 }}>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Tabs" component={TabNavigator} />
                <Stack.Screen name="RouteHistory" component={HistoryScreen} />
                <Stack.Screen name="Performance" component={PerformanceScreen} />
                <Stack.Screen
                  name="Notifications"
                  component={NotificationsScreen}
                />
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Help" component={HelpScreen} />
                <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
                <Stack.Screen
                  name="ActiveDelivery"
                  component={ActiveDeliveryScreen}
                />
              </Stack.Navigator>
              <SideMenu />
            </View>
          </AccountProvider>
        </AvailableOrdersProvider>
      </RiderSessionProvider>
    </SideMenuProvider>
  );
}
