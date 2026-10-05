import { API_PATHS } from '../src/api/config';

describe('notification delete API paths', () => {
  test('DELETE targets match UserController soft-delete routes', () => {
    expect(API_PATHS.notificationDelete(42)).toBe('/api/User/Notifications/42');
    expect(API_PATHS.notificationsDeleteAll).toBe('/api/User/Notifications');
    expect(API_PATHS.notifications).toBe('/api/User/Notifications');
    expect(API_PATHS.notificationRead(7)).toBe('/api/User/Notifications/7/read');
    expect(API_PATHS.notificationsReadAll).toBe('/api/User/Notifications/read-all');
  });
});
