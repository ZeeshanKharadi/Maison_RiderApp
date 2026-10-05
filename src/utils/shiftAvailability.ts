/**
 * Parse server UTC interval start for shift clock. Returns null if missing/invalid.
 * Does not invent a "now" fallback.
 *
 * SQL / EF often round-trip UTC as ISO without `Z`. JS treats that as local time
 * (e.g. PKT +5 → "working 5h" on a fresh reopen). Bare ISO datetimes are UTC.
 */
export function parseOnlineStartedAt(
  raw: string | Date | null | undefined,
): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasExplicitOffset =
    /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  const normalized =
    !hasExplicitOffset && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;

  const d = new Date(normalized);
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
