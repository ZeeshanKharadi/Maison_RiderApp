import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeIssuePages } from '../operations/issuePages.ts';
import type { DeliveryIssueReportDto } from '../api/types.ts';

function issue(id: number, note = ''): DeliveryIssueReportDto {
  return {
    id,
    assignedOrderId: id,
    orderId: String(id),
    orderNo: String(id),
    storeId: 'S1',
    riderUserId: 'r1',
    riderWorkerId: 'W1',
    riderName: 'Rider',
    reasonCode: 'Other',
    reasonLabel: 'Other',
    note,
    status: 'New',
    statusLabel: 'New',
    createdAt: '2026-01-01T00:00:00Z',
    orderStatus: 'OutForDelivery',
  };
}

describe('mergeIssuePages', () => {
  it('concatenates pages in order', () => {
    const merged = mergeIssuePages([[issue(1)], [issue(2)], [issue(3)]]);
    assert.deepEqual(
      merged.map((x) => x.id),
      [1, 2, 3],
    );
  });

  it('dedupes by id keeping the first occurrence', () => {
    const merged = mergeIssuePages([
      [issue(1, 'a'), issue(2, 'b')],
      [issue(2, 'newer'), issue(3, 'c')],
    ]);
    assert.deepEqual(
      merged.map((x) => ({ id: x.id, note: x.note })),
      [
        { id: 1, note: 'a' },
        { id: 2, note: 'b' },
        { id: 3, note: 'c' },
      ],
    );
  });

  it('skips null/empty pages', () => {
    assert.deepEqual(mergeIssuePages([null, [], undefined, [issue(9)]]).map((x) => x.id), [
      9,
    ]);
  });
});
