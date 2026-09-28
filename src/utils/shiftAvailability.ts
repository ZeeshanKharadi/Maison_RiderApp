/**
 * Parse server UTC interval start for shift clock. Returns null if missing/invalid.
 * Does not invent a "now" fallback.
 */
export function parseOnlineStartedAt(
  raw: string | Date | null | undefined,
): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Apply server availability to local online + shift start.
 * Offline always clears shift; online uses server start only (no Date.now() invent).
 */
export function applyServerAvailability(input: {
  isOnline: boolean;
  currentOnlineStartedAt?: string | Date | null;
}): { isOnline: boolean; shiftStartedAt: Date | null } {
  if (!input.isOnline) {
    return { isOnline: false, shiftStartedAt: null };
  }
  return {
    isOnline: true,
    shiftStartedAt: parseOnlineStartedAt(input.currentOnlineStartedAt),
  };
}
