import {
  LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE,
  logoutCleanupOrder,
  resolveLogoutPushCleanupStatus,
} from '../src/utils/logoutCleanup';

describe('logoutCleanup', () => {
  test('removes device token before server logout and local clear', () => {
    expect(logoutCleanupOrder()).toEqual([
      'removeDeviceToken',
      'serverLogout',
      'clearLocalSession',
    ]);
  });

  test('does not claim token removed when cleanup failed', () => {
    const status = resolveLogoutPushCleanupStatus({
      hadDeviceToken: true,
      removed: false,
    });
    expect(status.kind).toBe('failed');
    if (status.kind === 'failed') {
      expect(status.message).toBe(LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE);
      expect(status.message).not.toMatch(/removed successfully/i);
    }
  });

  test('reports removed when cleanup succeeded', () => {
    expect(
      resolveLogoutPushCleanupStatus({
        hadDeviceToken: true,
        removed: true,
      }),
    ).toEqual({ kind: 'removed' });
  });

  test('not applicable when device had no FCM token', () => {
    expect(
      resolveLogoutPushCleanupStatus({
        hadDeviceToken: false,
        removed: false,
      }),
    ).toEqual({ kind: 'not_applicable' });
  });
});
