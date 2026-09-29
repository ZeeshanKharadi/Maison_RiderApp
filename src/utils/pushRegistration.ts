/**
 * Push preference → device-token sync intent.
 * Inbox poll / cancel catch-up are independent of this (in-app only).
 */

export type PushSyncIntent = 'register' | 'unregister';

/** Map the Settings switch to the required server action for this device. */
export function resolvePushSyncIntent(pushEnabled: boolean): PushSyncIntent {
  return pushEnabled ? 'register' : 'unregister';
}

/** Login / CurrentUser / FCM token refresh may POST a token only when push is on. */
export function shouldRegisterPushToken(pushEnabled: boolean): boolean {
  return pushEnabled;
}

/**
 * Run register or remove for the preference. Does not persist the preference —
 * callers save local settings only after ok: true.
 */
export async function applyPushSyncIntent(opts: {
  intent: PushSyncIntent;
  register: () => Promise<boolean>;
  unregister: () => Promise<boolean>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (opts.intent === 'register') {
    const ok = await opts.register();
    if (!ok) {
      return {
        ok: false,
        message:
          'Could not register this device for push notifications. Try again.',
      };
    }
    return { ok: true };
  }

  const ok = await opts.unregister();
  if (!ok) {
    return {
      ok: false,
      message:
        'Could not remove this device’s push registration. Try again.',
    };
  }
  return { ok: true };
}
