/** Format OSRM distance (meters) for HUD — last calculation, not live remaining. */
export function formatRouteDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Compact duration for card: "~12 min". */
export function formatRouteDurationCompact(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h} h ${m} min` : `~${h} h`;
}

/** @deprecated Prefer formatRouteDurationCompact for UI cards */
export function formatRouteDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Strip duplicated "Store " prefixes from restaurant labels. */
export function cleanDestinationName(
  kind: 'store' | 'customer',
  label: string | null | undefined,
): string {
  let name = (label ?? '').trim();
  if (!name) return kind === 'store' ? 'Store' : 'Customer';
  if (kind === 'store') {
    name = name.replace(/^store\s+/i, '').trim() || name;
  }
  return name;
}

export function formatDestinationCardTitle(
  kind: 'store' | 'customer',
  label: string | null | undefined,
): string {
  const name = cleanDestinationName(kind, label);
  return kind === 'store' ? `To store · ${name}` : `To customer · ${name}`;
}
