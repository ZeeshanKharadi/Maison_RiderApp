import { ApiError } from '../src/repositories/types';
import {
  isUncertainMutationFailure,
  reconcileStatusMutation,
  resolveCodCashAfterServerCompleted,
} from '../src/utils/mutationReconciliation';
import { AvailableOrder } from '../src/data/orders';

function order(
  partial: Partial<AvailableOrder> & { id: string; backendId: number },
): AvailableOrder {
  return {
    id: partial.id,
    backendId: partial.backendId,
    externalOrderId: partial.id,
    restaurant: 'Store',
    customerName: 'Guest',
    customerPhone: '',
    pickupAddress: 'Store',
    dropoffAddress: 'Addr',
    distanceMiles: null,
    etaMinutes: null,
    orderAmount: 10,
    deliveryFee: 0,
    paymentMethod: 'cash',
    isCod: true,
    priority: 'normal',
    fragile: false,
    express: false,
    items: 1,
    packageInfo: '1 item',
    postedAt: new Date().toISOString(),
    imageColor: '#000',
    timeline: [],
    backendStatus: partial.backendStatus,
  };
}

describe('isUncertainMutationFailure', () => {
  test('includes timeouts and network after send', () => {
    expect(
      isUncertainMutationFailure({ code: 'TIMEOUT', message: 'timed out' }),
    ).toBe(true);
    expect(
      isUncertainMutationFailure({ code: 'NETWORK', message: 'failed' }),
    ).toBe(true);
    expect(
      isUncertainMutationFailure({
        code: 'HTTP_ERROR',
        message: 'Gateway',
        statusCode: 504,
      }),
    ).toBe(true);
  });

  test('excludes clear client/business errors', () => {
    const err: ApiError = {
      code: 'STATUS_FAILED',
      message: 'Invalid transition',
    };
    expect(isUncertainMutationFailure(err)).toBe(false);
  });
});

describe('reconcileStatusMutation', () => {
  test('applied when server reached expected status', () => {
    const result = reconcileStatusMutation({
      expectedBackendStatus: 'OnTheWay',
      previousBackendStatus: 'InProgress',
      serverOrder: order({
        id: '1',
        backendId: 1,
        backendStatus: 'OnTheWay',
      }),
    });
    expect(result.kind).toBe('applied');
  });

  test('unchanged when server still at previous — retry allowed', () => {
    const result = reconcileStatusMutation({
      expectedBackendStatus: 'Completed',
      previousBackendStatus: 'ArrivedAtCustomer',
      serverOrder: order({
        id: '1',
        backendId: 1,
        backendStatus: 'ArrivedAtCustomer',
      }),
    });
    expect(result.kind).toBe('unchanged');
    if (result.kind !== 'unchanged') return;
    expect(result.message).toMatch(/retry/i);
  });

  test('diverged reports actual server status', () => {
    const result = reconcileStatusMutation({
      expectedBackendStatus: 'Completed',
      previousBackendStatus: 'ArrivedAtCustomer',
      serverOrder: order({
        id: '1',
        backendId: 1,
        backendStatus: 'Cancelled',
      }),
    });
    expect(result.kind).toBe('diverged');
    if (result.kind !== 'diverged') return;
    expect(result.status).toBe('Cancelled');
    expect(result.message).toMatch(/do not assume cash/i);
  });

  test('unknown when fetch failed — no blind retry', () => {
    const result = reconcileStatusMutation({
      expectedBackendStatus: 'Completed',
      previousBackendStatus: 'ArrivedAtCustomer',
      serverOrder: null,
      fetchFailed: true,
    });
    expect(result.kind).toBe('unknown');
    expect(result.message).toMatch(/Do not retry/i);
  });
});

describe('resolveCodCashAfterServerCompleted', () => {
  test('uses server cash when it matches the submitted amount', () => {
    const cash = resolveCodCashAfterServerCompleted({
      isCod: true,
      submittedAmount: 450,
      submittedReason: undefined,
      serverCashCollected: 450,
      serverCashReason: null,
    });
    expect(cash.verified).toBe(true);
    expect(cash.amount).toBe(450);
    expect(cash.matchedSubmitted).toBe(true);
    expect(cash.message).toMatch(/confirmed on server/i);
  });

  test('uses server cash when it differs from the submitted amount', () => {
    const cash = resolveCodCashAfterServerCompleted({
      isCod: true,
      submittedAmount: 500,
      submittedReason: 'Customer short',
      serverCashCollected: 450,
      serverCashReason: 'Partial',
    });
    expect(cash.verified).toBe(true);
    expect(cash.amount).toBe(450);
    expect(cash.reason).toBe('Partial');
    expect(cash.matchedSubmitted).toBe(false);
    expect(cash.message).toMatch(/Server saved cash 450/);
    expect(cash.message).toMatch(/submitted amount was 500/);
  });

  test('marks cash unverified when Completed but server cash missing', () => {
    const cash = resolveCodCashAfterServerCompleted({
      isCod: true,
      submittedAmount: 450,
      submittedReason: 'ok',
      serverCashCollected: null,
      serverCashReason: null,
    });
    expect(cash.verified).toBe(false);
    expect(cash.amount).toBeNull();
    expect(cash.reason).toBeNull();
    expect(cash.matchedSubmitted).toBeNull();
    expect(cash.message).toMatch(/could not be verified/i);
    expect(cash.message).not.toMatch(/450/);
  });
});
