import {
  parseApiDate,
  toApiIso,
  toApiIsoPrefer,
} from '../src/utils/apiDate';
import { formatNotificationTime } from '../src/data/account';
import { formatPostedAgo } from '../src/data/orders';

describe('parseApiDate / toApiIso', () => {
  test('bare ISO from SQL is treated as UTC (not local)', () => {
    // Classic PKT bug: UTC "10:07" without Z parsed as local 10:07 → ~5h ago
    expect(parseApiDate('2026-10-14T10:07:00')?.toISOString()).toBe(
      '2026-10-14T10:07:00.000Z',
    );
    expect(toApiIso('2026-10-14T10:07:00.0000000')).toBe(
      '2026-10-14T10:07:00.000Z',
    );
  });

  test('explicit Z and offset still parse correctly', () => {
    expect(parseApiDate('2026-10-14T10:07:00.000Z')?.toISOString()).toBe(
      '2026-10-14T10:07:00.000Z',
    );
    expect(parseApiDate('2026-10-14T15:07:00+05:00')?.toISOString()).toBe(
      '2026-10-14T10:07:00.000Z',
    );
  });

  test('toApiIsoPrefer uses primary when present', () => {
    expect(
      toApiIsoPrefer('2026-10-14T12:00:00Z', '2026-10-12T08:00:00Z'),
    ).toBe('2026-10-14T12:00:00.000Z');
    expect(toApiIsoPrefer(null, '2026-10-12T08:00:00Z')).toBe(
      '2026-10-12T08:00:00.000Z',
    );
  });
});

describe('relative time helpers', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');

  test('formatPostedAgo with fresh available-since is minutes ago', () => {
    expect(formatPostedAgo('2026-10-14T11:55:00.000Z', now)).toBe('5 min ago');
  });

  test('formatPostedAgo does not invent now for invalid / empty', () => {
    expect(formatPostedAgo('', now)).toBe('Unknown time');
    expect(formatPostedAgo(null, now)).toBe('Unknown time');
    expect(formatPostedAgo('not-a-date', now)).toBe('Unknown time');
  });

  test('formatNotificationTime does not inflate bare UTC ISO by timezone', () => {
    // 2 minutes before `now` as bare ISO (legacy API shape)
    expect(formatNotificationTime('2026-10-14T11:58:00', now)).toBe(
      '2 min ago',
    );
  });

  test('formatNotificationTime does not invent now for invalid', () => {
    expect(formatNotificationTime('', now)).toBe('Unknown time');
    expect(formatNotificationTime(undefined, now)).toBe('Unknown time');
  });

  test('toApiIso display mode never falls back to now', () => {
    expect(toApiIso(null, false)).toBe('');
    expect(toApiIso('garbage', false)).toBe('');
  });
});
