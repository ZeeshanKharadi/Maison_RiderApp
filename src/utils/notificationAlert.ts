import { Alert, Vibration } from 'react-native';
import { AppNotification } from '../data/account';

export function showOrderNotificationAlert(
  title: string,
  description: string,
): void {
  Vibration.vibrate(400);
  Alert.alert(title, description, [{ text: 'OK', style: 'default' }]);
}

export function shouldAlertNotification(
  notification: AppNotification,
  pushNotificationsEnabled: boolean,
): boolean {
  if (notification.read) return false;
  if (notification.category === 'orders') return true;
  return pushNotificationsEnabled;
}
