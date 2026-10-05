/**
 * Normalize API date strings so "ago" math is correct.
 *
 * ASP.NET often serializes UTC DateTime without a trailing "Z". JS then treats
 * the value as local time, which inflates "X hrs ago" (e.g. +5h in PKT).
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
