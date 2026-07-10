import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BRAND_RED } from '../theme/colors';

interface LoaderProps {
  visible: boolean;
  message?: string;
  color?: string;
}

export default function Loader({
  visible,
  message = 'Loading...',
  color = BRAND_RED,
}: LoaderProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={color} />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 160,
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    color: '#333',
  },
});
