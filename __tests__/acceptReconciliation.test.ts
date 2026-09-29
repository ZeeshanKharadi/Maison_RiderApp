import { AvailableOrder } from '../src/data/orders';
import {
  isUncertainAcceptFailure,
  localJobInsertRecoveryResult,
  reconcileAcceptAfterUncertainty,
  sameAvailableOrder,
} from '../src/utils/acceptReconciliation';

function order(
  partial: Partial<AvailableOrder> & { id: string; backendId: number },
): AvailableOrder {
  return {
    id: partial.id,
    backendId: partial.backendId,
    externalOrderId: partial.externalOrderId ?? partial.id,
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

describe('isUncertainAcceptFailure', () => {
  test('treats network and gateway failures as uncertain', () => {
    expect(isUncertainAcceptFailure({ code: 'NETWORK', message: 'timeout' })).toBe(
      true,
    );
    expect(
      isUncertainAcceptFailure({
        code: 'HTTP_ERROR',
        message: 'Bad Gateway',
        statusCode: 502,
      }),
    ).toBe(true);
    expect(
      isUncertainAcceptFailure({
        code: 'HTTP_ERROR',
        message: 'Too Many',
        statusCode: 429,
      }),
    ).toBe(true);
  });

  test('treats clear business failures as certain', () => {
    expect(
      isUncertainAcceptFailure({
        code: 'STATUS_FAILED',
        message: 'Only Available orders can be accepted',
      }),
    ).toBe(false);
    expect(
      isUncertainAcceptFailure({
        code: 'HTTP_ERROR',
        message: 'Forbidden',
        statusCode: 403,
      }),
    ).toBe(false);
  });
});

describe('reconcileAcceptAfterUncertainty', () => {
  const target = order({ id: 'AO-1', backendId: 42, backendStatus: 'Available' });

  test('Active contains order → treat as accepted', () => {
    const outcome = reconcileAcceptAfterUncertainty(
      target,
      [order({ id: 'AO-1', backendId: 42, backendStatus: 'Accepted' })],
      [],
    );
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') return;
    expect(outcome.order.backendStatus).toBe('Accepted');
  });

  test('still Available → safe retry', () => {
    const outcome = reconcileAcceptAfterUncertainty(
      target,
      [],
      [order({ id: 'AO-1', backendId: 42, backendStatus: 'Available' })],
    );
    expect(outcome.kind).toBe('available');
  });

  test('other server state is reported', () => {
    const outcome = reconcileAcceptAfterUncertainty(
      target,
      [],
      [order({ id: 'AO-1', backendId: 42, backendStatus: 'Cancelled' })],
    );
    expect(outcome.kind).toBe('other');
    if (outcome.kind !== 'other') return;
    expect(outcome.status).toBe('Cancelled');
    expect(outcome.message).toMatch(/Cancelled/i);
  });

  test('missing from both lists → unknown', () => {
    const outcome = reconcileAcceptAfterUncertainty(target, [], []);
    expect(outcome.kind).toBe('unknown');
  });

  test('matches by backendId across id strings', () => {
    expect(
      sameAvailableOrder(
        { id: 'x', backendId: 9, externalOrderId: 'EXT' },
        { id: 'y', backendId: 9, externalOrderId: 'OTHER' },
      ),
    ).toBe(true);
  });
});

describe('localJobInsertRecoveryResult', () => {
  const target = order({ id: 'AO-1', backendId: 42, backendStatus: 'Available' });

  test('Active contains order → show as accepted', () => {
    const outcome = reconcileAcceptAfterUncertainty(
      target,
      [order({ id: 'AO-1', backendId: 42, backendStatus: 'Accepted' })],
      [],
    );
    const recovery = localJobInsertRecoveryResult(
      outcome,
      'You can carry up to 5 active orders at once.',
    );
    expect(recovery.showAsAccepted).toBe(true);
    expect(recovery.ok).toBe(true);
    expect(recovery.retryable).toBe(false);
  });

  test('server check failure → unknown and no blind retry', () => {
    const recovery = localJobInsertRecoveryResult(
      { kind: 'unknown', message: 'Could not confirm' },
      'Could not add active job',
      { serverCheckFailed: true },
    );
    expect(recovery.ok).toBe(false);
    expect(recovery.retryable).toBe(false);
    expect(recovery.alertTitle).toBe('Accept status unknown');
    expect(recovery.message).toMatch(/Do not retry/i);
  });
});
