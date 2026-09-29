import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTION_NEEDED_STATUSES,
  actionNeededCountLabel,
  actionNeededCounts,
  actionNeededQueryParams,
  groupOrdersByBoardStatus,
  isActionNeededStatus,
  OPS_BOARD_STATUSES,
  statusLabel,
  toActionNeededSnapshot,
} from '../operations/boardStatuses.ts';

describe('Ops board failed-delivery visibility', () => {
  it('includes ReturningToStore, AwaitingStoreReceipt, and Failed', () => {
    for (const st of ['ReturningToStore', 'AwaitingStoreReceipt', 'Failed'] as const) {
      assert.ok(OPS_BOARD_STATUSES.includes(st), `missing ${st}`);
      assert.ok(statusLabel(st).length > 0);
    }
  });

  it('marks return/receipt columns as action-needed', () => {
    assert.deepEqual([...ACTION_NEEDED_STATUSES], [
      'ReturningToStore',
      'AwaitingStoreReceipt',
    ]);
    assert.equal(isActionNeededStatus('ReturningToStore'), true);
    assert.equal(isActionNeededStatus('AwaitingStoreReceipt'), true);
    assert.equal(isActionNeededStatus('Failed'), false);
    assert.equal(isActionNeededStatus('Available'), false);
  });

  it('groups failure statuses into their board columns', () => {
    const grouped = groupOrdersByBoardStatus([
      { id: 1, status: 'ReturningToStore' },
      { id: 2, status: 'AwaitingStoreReceipt' },
      { id: 3, status: 'Failed' },
      { id: 4, status: 'Available' },
    ]);
    assert.equal(grouped.ReturningToStore.length, 1);
    assert.equal(grouped.AwaitingStoreReceipt.length, 1);
    assert.equal(grouped.Failed.length, 1);
    assert.equal(grouped.Available.length, 1);
    assert.equal(grouped.Delivered.length, 0);
  });

  it('counts action-needed orders for manager attention', () => {
    const counts = actionNeededCounts([
      { status: 'ReturningToStore' },
      { status: 'ReturningToStore' },
      { status: 'AwaitingStoreReceipt' },
      { status: 'Failed' },
      { status: 'OnTheWay' },
    ]);
    assert.deepEqual(counts, {
      ReturningToStore: 2,
      AwaitingStoreReceipt: 1,
      total: 3,
    });
  });

  it('omits assigned orders when filter is Rejected', () => {
    const grouped = groupOrdersByBoardStatus(
      [{ id: 1, status: 'Failed' }],
      'Rejected',
    );
    assert.equal(grouped.Failed.length, 0);
  });

  it('labels filtered counts when a complete scoped total is unavailable', () => {
    const snap = toActionNeededSnapshot(
      actionNeededCounts([{ status: 'ReturningToStore' }]),
      false,
    );
    assert.equal(snap.isComplete, false);
    assert.equal(actionNeededCountLabel(snap.ReturningToStore, snap.isComplete), '1 (filtered)');
    assert.equal(actionNeededCountLabel(3, true), '3');
  });

  it('builds store-scoped action queries without date or rider filters', () => {
    const qs = actionNeededQueryParams('STORE-1', 'AwaitingStoreReceipt');
    assert.equal(qs.get('storeId'), 'STORE-1');
    assert.equal(qs.get('status'), 'AwaitingStoreReceipt');
    assert.equal(qs.get('from'), null);
    assert.equal(qs.get('to'), null);
    assert.equal(qs.get('riderId'), null);

    const allStores = actionNeededQueryParams('', 'ReturningToStore');
    assert.equal(allStores.get('storeId'), null);
    assert.equal(allStores.get('status'), 'ReturningToStore');
  });
});
