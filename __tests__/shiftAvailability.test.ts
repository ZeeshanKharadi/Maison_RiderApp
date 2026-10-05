import {
  applyServerAvailability,
  parseOnlineStartedAt,
} from '../src/utils/shiftAvailability';
import { formatShiftClock, formatWorkingHours } from '../src/data/dashboard';

describe('shiftAvailability', () => {
  test('offline clears shift even if a start was provided', () => {
    expect(
      applyServerAvailability({
        isOnline: false,
        currentOnlineStartedAt: '2026-09-25T06:00:00.000Z',
      }),
    ).toEqual({ isOnline: false, shiftStartedAt: null });
  });

  test('online uses server start and does not invent now', () => {
    const applied = applyServerAvailability({
      isOnline: true,
      currentOnlineStartedAt: '2026-09-25T06:00:00.000Z',
    });
    expect(applied.isOnline).toBe(true);
    expect(applied.shiftStartedAt?.toISOString()).toBe(
      '2026-09-25T06:00:00.000Z',
    );
  });

  test('online with missing start yields null shiftStartedAt', () => {
    expect(
      applyServerAvailability({ isOnline: true, currentOnlineStartedAt: null }),
    ).toEqual({ isOnline: true, shiftStartedAt: null });
  });

  test('parseOnlineStartedAt rejects invalid', () => {
    expect(parseOnlineStartedAt('not-a-date')).toBeNull();
    expect(parseOnlineStartedAt('')).toBeNull();
  });

  test('bare ISO from SQL is treated as UTC (not local)', () => {
    // Classic bug: "07:56 UTC" without Z parsed as local 07:56 in PKT (+5)
    // → shows as shift start 7:56 AM and inflated working hours.
    const applied = applyServerAvailability({
      isOnline: true,
      currentOnlineStartedAt: '2026-09-29T07:56:00',
    });
    expect(applied.shiftStartedAt?.toISOString()).toBe(
      '2026-09-29T07:56:00.000Z',
    );
  });

  test('explicit Z and offset still parse correctly', () => {
    expect(
      parseOnlineStartedAt('2026-09-29T07:56:00.000Z')?.toISOString(),
    ).toBe('2026-09-29T07:56:00.000Z');
    expect(
      parseOnlineStartedAt('2026-09-29T12:56:00+05:00')?.toISOString(),
    ).toBe('2026-09-29T07:56:00.000Z');
  });
});

describe('formatShiftClock / working hours', () => {
  test('same-day shows time only', () => {
    const start = new Date(2026, 8, 25, 9, 15, 0);
    const now = new Date(2026, 8, 25, 14, 0, 0);
    expect(formatShiftClock(start, now)).toMatch(/9:15/);
  });

  test('cross-midnight includes date', () => {
    const start = new Date(2026, 8, 24, 22, 30, 0);
    const now = new Date(2026, 8, 25, 1, 0, 0);
    const label = formatShiftClock(start, now);
    expect(label.toLowerCase()).toMatch(/sep/);
    expect(label).toMatch(/24/);
  });

  test('working hours null start is zero', () => {
    expect(formatWorkingHours(null)).toBe('0h 0m');
  });

  test('working hours accumulates from server start', () => {
    const start = new Date(Date.now() - 90 * 60 * 1000);
    expect(formatWorkingHours(start, new Date())).toBe('1h 30m');
  });
});
