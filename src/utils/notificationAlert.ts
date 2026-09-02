import { AppNotification } from '../data/account';
import notificationService from '../services/NotificationService';

export async function showOrderNotificationAlert(
  title: string,
  description: string,
  data?: Record<string, string>,
): Promise<void> {
  await notificationService.showLocalNotification(title, description, data);
}

export function shouldAlertNotification(
  notification: AppNotification,
  pushNotificationsEnabled: boolean,
): boolean {
  if (notification.read) return false;
  if (notification.category === 'orders') return true;
  return pushNotificationsEnabled;
}
