/** Persist unresolved Admin float mutations across refresh (account-scoped). */

export type PendingFloatMutation = {
  kind: 'issue' | 'return';
  requestId: string;
  riderUserId: string;
  storeId: string;
  amount: number;
  reason?: string;
};

function storageKey(accountId: string) {
  return `maison.admin.float.pending.${accountId}`;
}

export function mutationFingerprint(p: Omit<PendingFloatMutation, 'requestId'>): string {
  return [
    p.kind,
    p.riderUserId,
    p.storeId,
    Number(p.amount).toFixed(2),
    (p.reason || '').trim(),
  ].join('|');
}

export function loadPendingFloatMutation(accountId: string): PendingFloatMutation | null {
  if (!accountId) return null;
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFloatMutation;
    if (
      !parsed
      || (parsed.kind !== 'issue' && parsed.kind !== 'return')
      || !parsed.requestId
      || !parsed.riderUserId
      || !parsed.storeId
      || !(parsed.amount > 0)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Returns false if persistence failed — caller must not send the mutation. */
export function savePendingFloatMutation(
  accountId: string,
  pending: PendingFloatMutation,
): boolean {
  if (!accountId) return false;
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingFloatMutation(accountId: string): void {
  if (!accountId) return;
  try {
    localStorage.removeItem(storageKey(accountId));
  } catch {
    /* ignore */
  }
}
