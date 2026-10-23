import {
  __resetAuthSessionForTests,
  areRiderActionsAllowed,
  beginAuthLogout,
  captureAuthSession,
  endAuthLogout,
  establishAuthSession,
  getAuthSessionGeneration,
  isAuthSessionCurrent,
} from '../src/utils/authSession';

describe('authSession generation', () => {
  beforeEach(() => {
    __resetAuthSessionForTests();
  });

  test('logout during a batch/request invalidates the captured snapshot immediately', () => {
    establishAuthSession('rider-1');
    const batchSession = captureAuthSession();
    expect(batchSession).not.toBeNull();
    expect(isAuthSessionCurrent(batchSession)).toBe(true);
    expect(areRiderActionsAllowed()).toBe(true);

    const genBefore = getAuthSessionGeneration();
    // Simulate logout start before any cleanup await.
    beginAuthLogout();

    expect(getAuthSessionGeneration()).toBe(genBefore + 1);
    expect(areRiderActionsAllowed()).toBe(false);
    expect(captureAuthSession()).toBeNull();
    expect(isAuthSessionCurrent(batchSession)).toBe(false);

    // Credentials may still exist for cleanup; actions stay blocked until end.
    endAuthLogout();
    expect(captureAuthSession()).toBeNull();
    expect(isAuthSessionCurrent(batchSession)).toBe(false);
  });

  test('logout then login to the same account uses a new generation', () => {
    establishAuthSession('rider-1');
    const beforeLogout = captureAuthSession();
    expect(beforeLogout?.userId).toBe('rider-1');

    beginAuthLogout();
    endAuthLogout();

    establishAuthSession('rider-1');
    const afterRelogin = captureAuthSession();

    expect(afterRelogin?.userId).toBe('rider-1');
    expect(afterRelogin?.generation).not.toBe(beforeLogout?.generation);
    expect(isAuthSessionCurrent(beforeLogout)).toBe(false);
    expect(isAuthSessionCurrent(afterRelogin)).toBe(true);
  });

  test('account replacement bumps generation', () => {
    establishAuthSession('rider-a');
    const a = captureAuthSession();
    establishAuthSession('rider-b');
    const b = captureAuthSession();

    expect(a?.userId).toBe('rider-a');
    expect(b?.userId).toBe('rider-b');
    expect(isAuthSessionCurrent(a)).toBe(false);
    expect(isAuthSessionCurrent(b)).toBe(true);
  });
});
