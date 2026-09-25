/**
 * Pure helpers for cancel-ack (testable without AsyncStorage / RN).
 */
export function filterUnacknowledgedCancellationKeys(
  eventKeys: string[],
  acknowledged: ReadonlySet<string>,
): string[] {
  return eventKeys.filter(k => Boolean(k) && !acknowledged.has(k));
}

export function buildCancellationEventKey(input: {
  backendId?: number | null;
  externalOrderId?: string | null;
  id?: string | null;
}): string | null {
  if (input.backendId != null && Number.isFinite(Number(input.backendId))) {
    return `ao:${Number(input.backendId)}`;
  }
  const ext = (input.externalOrderId || input.id || '').trim().toLowerCase();
  return ext ? `ext:${ext}` : null;
}
