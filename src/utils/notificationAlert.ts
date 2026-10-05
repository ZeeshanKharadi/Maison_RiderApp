import { AppNotification } from '../data/account';
import notificationService from '../services/NotificationService';

export async function showOrderNotificationAlert(
  title: string,
  description: string,
  data?: Record<string, string>,
): Promise<void> {
  await notificationService.showLocalNotification(title, description, data);
}

/**
 * Whether to show a local/system alert for an inbox row.
 * Push OFF suppresses all toast alerts (including new order assigns).
 * Inbox sync and cancel catch-up are handled separately by the poller.
 */
export function shouldAlertNotification(
  notification: AppNotification,
  pushNotificationsEnabled: boolean,
): boolean {
  if (notification.read) return false;
  return pushNotificationsEnabled;
}

export function isOrderCancellationNotification(
  notification: Pick<AppNotification, 'title' | 'description'>,
): boolean {
  return (
    /cancel/i.test(notification.title) ||
    /cancel/i.test(notification.description)
  );
}
