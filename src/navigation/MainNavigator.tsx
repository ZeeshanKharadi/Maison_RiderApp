import React from 'react';
import { View } from 'react-native';
import TabNavigator from './TabNavigator';
import SideMenu from '../components/SideMenu';
import { SideMenuProvider } from '../context/SideMenuContext';

export default function MainNavigator() {
  return (
    <SideMenuProvider>
      <View style={{ flex: 1 }}>
        <TabNavigator />
        <SideMenu />
      </View>
    </SideMenuProvider>
  );
}
