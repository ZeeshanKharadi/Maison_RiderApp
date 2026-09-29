import {
  isOrderCancellationNotification,
  shouldAlertNotification,
} from '../src/utils/notificationAlert';
import type { AppNotification } from '../src/data/account';

function note(
  partial: Partial<AppNotification> & Pick<AppNotification, 'id' | 'title'>,
): AppNotification {
  return {
    description: '',
    timestamp: new Date().toISOString(),
    read: false,
    category: 'orders',
    priority: 'high',
    icon: 'package-variant',
    ...partial,
  };
}

describe('shouldAlertNotification', () => {
  test('never alerts for already-read rows', () => {
    expect(
      shouldAlertNotification(
        note({ id: '1', title: 'New delivery', read: true }),
        true,
      ),
    ).toBe(false);
  });

  test('push OFF suppresses new order assignment alerts', () => {
    expect(
      shouldAlertNotification(
        note({
          id: '2',
          title: 'New delivery assigned to you',
          category: 'orders',
        }),
        false,
      ),
    ).toBe(false);
  });

  test('push ON allows order and system alerts', () => {
    expect(
      shouldAlertNotification(
        note({ id: '3', title: 'New delivery nearby', category: 'orders' }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldAlertNotification(
        note({
          id: '4',
          title: 'System',
          category: 'system',
          icon: 'bell-outline',
        }),
        true,
      ),
    ).toBe(true);
  });

  test('push OFF suppresses non-order alerts too', () => {
    expect(
      shouldAlertNotification(
        note({
          id: '5',
          title: 'Hello',
          category: 'system',
          icon: 'bell-outline',
        }),
        false,
      ),
    ).toBe(false);
  });
});

describe('isOrderCancellationNotification', () => {
  test('detects cancel by title or body', () => {
    expect(
      isOrderCancellationNotification({
        title: 'Order cancelled',
        description: 'Admin cancelled',
      }),
    ).toBe(true);
    expect(
      isOrderCancellationNotification({
        title: 'Update',
        description: 'Order was cancelled by store',
      }),
    ).toBe(true);
    expect(
      isOrderCancellationNotification({
        title: 'New delivery assigned to you',
        description: 'Order 123 · Store A',
      }),
    ).toBe(false);
  });
});
