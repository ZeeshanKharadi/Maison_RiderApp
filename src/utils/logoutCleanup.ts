/**
 * Logout cleanup: revoke this device's push registration while the session
 * is still authenticated, then invalidate the session. Local sign-out always
 * proceeds; callers must not claim the token was removed when cleanup fails.
 */

export type LogoutPushCleanupStatus =
  | { kind: 'not_applicable' }
  | { kind: 'removed' }
  | { kind: 'failed'; message: string };

export const LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE =
  'You were signed out on this device, but this device’s push token could not be removed from the server. It may still receive pushes until registration is cleaned up.';

/** Preferred step order for logout cleanup. */
export function logoutCleanupOrder(): Array<
  'removeDeviceToken' | 'serverLogout' | 'clearLocalSession'
> {
  return ['removeDeviceToken', 'serverLogout', 'clearLocalSession'];
}

/**
 * Summarize push cleanup after logout attempts.
 * `hadDeviceToken` — this device had an FCM token to revoke.
 * `removed` — confirmed removed (DELETE and/or logout body).
 */
export function resolveLogoutPushCleanupStatus(opts: {
  hadDeviceToken: boolean;
  removed: boolean;
}): LogoutPushCleanupStatus {
  if (!opts.hadDeviceToken) return { kind: 'not_applicable' };
  if (opts.removed) return { kind: 'removed' };
  return {
    kind: 'failed',
    message: LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE,
  };
}
