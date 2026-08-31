import React from 'react';
import { Alert } from 'react-native';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

/**
 * Cross-platform confirmation — uses native Alert for reliability.
 * Swap for a custom modal later without changing call sites.
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmOptions) {
  Alert.alert(title, message, [
    {
      text: cancelLabel,
      style: 'cancel',
      onPress: onCancel,
    },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
