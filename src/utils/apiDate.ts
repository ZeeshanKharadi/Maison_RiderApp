/**
 * Normalize API date strings so "ago" / clock math is correct.
 *
 * Contract: API timestamps are UTC. Prefer values ending in "Z" (backend
 * UtcDateTimeJsonConverter). Older payloads may omit the zone — treat bare
 * ISO as UTC so JS does not parse them as local (e.g. +5h skew in PKT).
 *
 * Use these helpers for every API instant shown as relative or absolute time.
 * Do not call `new Date(apiString)` directly on API timestamps.
 */
export function parseApiDate(value?: string | null): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Already has timezone (Z or ±hh:mm)
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO-like without zone → treat as UTC
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.includes('T') ? `${raw}Z` : `${raw.replace(' ', 'T')}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO string for UI storage; falls back to now when unparseable. */
export function toApiIso(value?: string | null, fallbackNow = true): string {
  const d = parseApiDate(value);
  if (d) return d.toISOString();
  return fallbackNow ? new Date().toISOString() : '';
}

/** Prefer the freshest API instant (e.g. updatedAt over createdAt for "posted"). */
export function toApiIsoPrefer(
  primary?: string | null,
  fallback?: string | null,
  fallbackNow = true,
): string {
  const fromPrimary = parseApiDate(primary);
  if (fromPrimary) return fromPrimary.toISOString();
  return toApiIso(fallback, fallbackNow);
}
