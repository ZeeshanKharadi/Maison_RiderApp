import {
  applyPushSyncIntent,
  resolvePushSyncIntent,
  shouldRegisterPushToken,
} from '../src/utils/pushRegistration';

describe('pushRegistration preference', () => {
  test('resolvePushSyncIntent maps switch to register/unregister', () => {
    expect(resolvePushSyncIntent(true)).toBe('register');
    expect(resolvePushSyncIntent(false)).toBe('unregister');
  });

  test('shouldRegisterPushToken is false when push is off (login / refresh)', () => {
    expect(shouldRegisterPushToken(true)).toBe(true);
    expect(shouldRegisterPushToken(false)).toBe(false);
  });

  test('applyPushSyncIntent registers only when intent is register', async () => {
    const register = jest.fn(async () => true);
    const unregister = jest.fn(async () => true);

    const on = await applyPushSyncIntent({
      intent: 'register',
      register,
      unregister,
    });
    expect(on).toEqual({ ok: true });
    expect(register).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();

    register.mockClear();
    unregister.mockClear();

    const off = await applyPushSyncIntent({
      intent: 'unregister',
      register,
      unregister,
    });
    expect(off).toEqual({ ok: true });
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  test('applyPushSyncIntent keeps preference caller in control on failure', async () => {
    const register = jest.fn(async () => false);
    const unregister = jest.fn(async () => false);

    const regFail = await applyPushSyncIntent({
      intent: 'register',
      register,
      unregister,
    });
    expect(regFail.ok).toBe(false);
    if (!regFail.ok) {
      expect(regFail.message).toMatch(/register/i);
    }

    const unregFail = await applyPushSyncIntent({
      intent: 'unregister',
      register,
      unregister,
    });
    expect(unregFail.ok).toBe(false);
    if (!unregFail.ok) {
      expect(unregFail.message).toMatch(/remove/i);
    }
  });

  test('token refresh should not register when push preference is off', () => {
    // Mirrors NotificationService onTokenRefresh gate.
    expect(shouldRegisterPushToken(false)).toBe(false);
  });
});
