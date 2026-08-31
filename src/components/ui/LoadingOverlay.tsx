import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  message?: string;
};

/** Full-screen loading overlay (replaces ad-hoc Loader usage over time). */
export default function LoadingOverlay({
  visible,
  message = 'Loading...',
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay} accessibilityViewIsModal>
        <View style={styles.box} accessibilityLabel={message}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    minWidth: 160,
  },
  message: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
});
