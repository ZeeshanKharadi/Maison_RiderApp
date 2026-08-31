/**
 * Dashboard helpers — greeting / clock formatting.
 * Live stats and orders come from RiderSession + AvailableOrders contexts.
 */

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatShiftClock(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDashboardDate(date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Elapsed hours since shift start. */
export function formatWorkingHours(
  shiftStartedAt: Date | null,
  now = new Date(),
): string {
  if (!shiftStartedAt) return '0h 0m';
  const mins = Math.max(
    0,
    Math.floor((now.getTime() - shiftStartedAt.getTime()) / 60000),
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
