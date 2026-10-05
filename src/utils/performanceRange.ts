import { startOfDay } from './format';

/** Calendar day so far: local midnight → now. */
export function performanceTodayWindow(now = new Date()): {
  from: Date;
  to: Date;
} {
  return { from: startOfDay(now), to: now };
}

/**
 * Exactly seven calendar days ending today:
 * start of (today − 6 days) through now (inclusive of today).
 * Example: if today is Sep 30, range is Sep 24 00:00 → Sep 30 (now).
 */
export function performanceSevenCalendarDayWindow(now = new Date()): {
  from: Date;
  to: Date;
} {
  const todayStart = startOfDay(now);
  const from = new Date(todayStart);
  from.setDate(from.getDate() - 6);
  return { from, to: now };
}

/** Short local date for summary labels, e.g. "Sep 24". */
export function formatShortDateLabel(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
}

/** "Sep 24 – Sep 30" for a seven-day window. */
export function formatDateRangeLabel(from: Date, to: Date): string {
  return `${formatShortDateLabel(from)} – ${formatShortDateLabel(to)}`;
}
