import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND_RED } from '../theme/colors';

export { BRAND_RED };

interface AppSafeAreaViewProps {
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export default function AppSafeAreaView({
  children,
  contentStyle,
  edges = ['top', 'bottom', 'left', 'right'],
}: AppSafeAreaViewProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_RED,
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
