import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildCancellationEventKey,
  filterUnacknowledgedCancellationKeys,
} from '../utils/cancellationAck';

const keyForUser = (userId: string) =>
  `@maison_rider/cancel_ack:${userId.trim().toLowerCase()}`;

/** In-process alert dedupe so FCM + restore + poll cannot stack Alerts. */
const sessionAlertedByUser = new Map<string, Set<string>>();

export { buildCancellationEventKey as cancellationEventKey };
export { filterUnacknowledgedCancellationKeys as filterUnacknowledgedKeys };

function sessionSet(userId: string): Set<string> {
  const id = userId.trim().toLowerCase();
  let set = sessionAlertedByUser.get(id);
  if (!set) {
    set = new Set();
    sessionAlertedByUser.set(id, set);
  }
  return set;
}

/** Test helper — clears in-memory session alerts. */
export function clearSessionCancellationAlerts(userId?: string): void {
  if (!userId) {
    sessionAlertedByUser.clear();
    return;
  }
  sessionAlertedByUser.delete(userId.trim().toLowerCase());
}

export function getSessionCancellationAlerts(userId: string): ReadonlySet<string> {
  if (!userId.trim()) return new Set();
  return sessionSet(userId);
}

export function markSessionCancellationAlerts(
  userId: string,
  keys: string[],
): void {
  if (!userId.trim() || keys.length === 0) return;
  const set = sessionSet(userId);
  for (const k of keys) {
    if (k) set.add(k);
  }
}

export async function loadAcknowledgedCancellationKeys(
  userId: string,
): Promise<Set<string>> {
  if (!userId.trim()) return new Set();
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    // Fail open: treat as no durable acks so unacked cancels still surface.
    return new Set();
  }
}

/**
 * Persist ack keys. Returns false if storage write failed (caller must not
 * assume durable ack; session alert markers may still prevent duplicate Alerts).
 */
export async function acknowledgeCancellationKeys(
  userId: string,
  keys: string[],
): Promise<boolean> {
  if (!userId.trim() || keys.length === 0) return true;
  try {
    const existing = await loadAcknowledgedCancellationKeys(userId);
    let changed = false;
    for (const k of keys) {
      if (!k || existing.has(k)) continue;
      existing.add(k);
      changed = true;
    }
    if (!changed) return true;
    const list = [...existing];
    const trimmed = list.length > 200 ? list.slice(list.length - 200) : list;
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}
