import {
  formatDateRangeLabel,
  formatShortDateLabel,
  performanceSevenCalendarDayWindow,
  performanceTodayWindow,
} from '../src/utils/performanceRange';

describe('performanceRange', () => {
  test('today window is local midnight through now', () => {
    const now = new Date(2026, 8, 30, 11, 52, 0); // Sep 30 local
    const { from, to } = performanceTodayWindow(now);
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(8);
    expect(from.getDate()).toBe(30);
    expect(from.getHours()).toBe(0);
    expect(to.getTime()).toBe(now.getTime());
  });

  test('seven calendar days is today and the prior 6 days', () => {
    const now = new Date(2026, 8, 30, 11, 52, 0); // Sep 30
    const { from, to } = performanceSevenCalendarDayWindow(now);
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(8);
    expect(from.getDate()).toBe(24); // Sep 24
    expect(from.getHours()).toBe(0);
    expect(to.getTime()).toBe(now.getTime());
    // Span covers exactly 7 calendar date numbers: 24..30
    const days =
      Math.round(
        (performanceTodayWindow(now).from.getTime() - from.getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;
    expect(days).toBe(7);
  });

  test('range label shows both ends', () => {
    const now = new Date(2026, 8, 30, 12, 0, 0);
    const { from, to } = performanceSevenCalendarDayWindow(now);
    const label = formatDateRangeLabel(from, to);
    expect(label).toContain(formatShortDateLabel(from));
    expect(label).toContain(formatShortDateLabel(to));
    expect(label).toMatch(/–/);
  });
});
