/**
 * Single auth-session generation for rider actions (accept, refresh, restore, notification nav).
 *
 * Logout bumps generation immediately (before location/push/server cleanup awaits) so in-flight
 * rider work cannot apply state/alerts/navigation, while JWT remains available for cleanup APIs.
 */

export type AuthSessionSnapshot = {
  userId: string;
  generation: number;
};

let generation = 0;
let activeUserId: string | null = null;
/** True from beginAuthLogout until endAuthLogout — blocks capture / current checks. */
let actionsSuspended = false;

export function getAuthSessionGeneration(): number {
  return generation;
}

export function getAuthSessionUserId(): string | null {
  return activeUserId;
}

/** Rider UI actions (accept, refresh, nav) — false during logout cleanup. */
export function areRiderActionsAllowed(): boolean {
  return !!activeUserId && !actionsSuspended;
}

/**
 * Snapshot for an in-flight operation. Null when logged out or logout has started.
 */
export function captureAuthSession(): AuthSessionSnapshot | null {
  if (!activeUserId || actionsSuspended) return null;
  return { userId: activeUserId, generation };
}

/**
 * Whether a captured snapshot still matches the live auth session.
 * Fails after logout start, account switch, or re-login (even to the same user id).
 */
export function isAuthSessionCurrent(
  snapshot: AuthSessionSnapshot | null | undefined,
): boolean {
  if (!snapshot?.userId) return false;
  if (actionsSuspended) return false;
  if (!activeUserId) return false;
  return (
    snapshot.userId === activeUserId && snapshot.generation === generation
  );
}

/**
 * Call at the very start of logout — before any await.
 * Invalidates in-flight work; does not clear tokens (cleanup still needs them).
 */
export function beginAuthLogout(): void {
  actionsSuspended = true;
  generation += 1;
}

/**
 * After local user/token clear. Safe to call even if beginAuthLogout was skipped.
 */
export function endAuthLogout(): void {
  activeUserId = null;
  actionsSuspended = false;
}

/**
 * Establish or replace the authenticated rider session (login / hydrate / account switch).
 * Always bumps generation when the user id changes or when leaving a suspended logout.
 * Re-login to the same account also bumps (via endAuthLogout → establish).
 */
export function establishAuthSession(userId: string | null | undefined): void {
  const next = (userId ?? '').trim() || null;
  if (!next) {
    if (activeUserId != null || actionsSuspended) {
      generation += 1;
    }
    activeUserId = null;
    actionsSuspended = false;
    return;
  }

  if (activeUserId !== next || actionsSuspended) {
    generation += 1;
  }
  activeUserId = next;
  actionsSuspended = false;
}

/** @internal test-only */
export function __resetAuthSessionForTests(): void {
  generation = 0;
  activeUserId = null;
  actionsSuspended = false;
}
