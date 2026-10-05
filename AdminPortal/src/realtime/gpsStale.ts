/** Pure GPS stale helper — used by Live Map timer (unit-testable without DOM). */
export function computeGpsIsStale(args: {
  hasLocation: boolean;
  locationUpdatedAt?: string | null;
  staleAfterSeconds?: number;
  nowMs?: number;
}): boolean {
  if (!args.hasLocation) return true;
  if (!args.locationUpdatedAt) return true;
  const updatedMs = new Date(args.locationUpdatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  const threshold =
    args.staleAfterSeconds && args.staleAfterSeconds > 0
      ? args.staleAfterSeconds
      : 90;
  const now = args.nowMs ?? Date.now();
  return (now - updatedMs) / 1000 > threshold;
}
