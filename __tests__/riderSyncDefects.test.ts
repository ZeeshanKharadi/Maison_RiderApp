import { AvailableOrder } from '../src/data/orders';
import {
  applyAuthoritativeAvailableOrders,
  ActiveJobRef,
} from '../src/utils/availableOrdersSync';
import { planCancellationAlerts } from '../src/utils/cancellationAlertPlan';
import {
  isAdminMutableActiveState,
  shouldPollActiveDelivery,
} from '../src/utils/activeDeliverySync';
import { isLiveRiderActiveStatus } from '../src/api/mappers/orderMapper';

function order(partial: Partial<AvailableOrder> & { id: string }): AvailableOrder {
  return {
    id: partial.id,
    backendId: partial.backendId,
    externalOrderId: partial.externalOrderId ?? partial.id,
    restaurant: partial.restaurant ?? 'Store',
    customerName: partial.customerName ?? 'Guest',
    customerPhone: partial.customerPhone ?? '',
    pickupAddress: partial.pickupAddress ?? 'Store',
    dropoffAddress: partial.dropoffAddress ?? 'Addr',
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

describe('requeue visibility (Available authoritative)', () => {
  test('accepted-then-requeued order reappears from server Available', () => {
    const acceptedId = 'ao-100';
    // Local permanent-exclude bug would keep filtering this after accept.
    const previouslyAcceptedLocally: ActiveJobRef[] = [];
    const serverAfterRequeue = [
      order({ id: acceptedId, backendId: 100, backendStatus: 'Available' }),
    ];

    const visible = applyAuthoritativeAvailableOrders(
      serverAfterRequeue,
      previouslyAcceptedLocally,
    );
    expect(visible.map(o => o.backendId)).toEqual([100]);
  });

  test('still hides order while it remains this rider active job', () => {
    const server = [
      order({ id: 'ao-100', backendId: 100 }),
      order({ id: 'ao-200', backendId: 200 }),
    ];
    const active: ActiveJobRef[] = [{ id: 'ao-100', backendId: 100 }];
    const visible = applyAuthoritativeAvailableOrders(server, active);
    expect(visible.map(o => o.backendId)).toEqual([200]);
  });

  test('rejected-then-requeued: if server returns it, client must show it', () => {
    // Backend clears rejections on requeue; client must not keep a reject denylist.
    const server = [order({ id: 'ao-7', backendId: 7 })];
    expect(applyAuthoritativeAvailableOrders(server, []).map(o => o.id)).toEqual([
      'ao-7',
    ]);
  });
});

describe('missed-FCM cancellation (background refresh)', () => {
  test('poll without suppress shows one cancel alert then needs ack', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:55'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: false, // Dashboard / Active poll must not suppress
    });
    expect(plan.keysToShowAlert).toEqual(['ao:55']);
    expect(plan.keysNeedingAck).toEqual(['ao:55']);
  });

  test('after alert shown (session marker), later poll does not re-alert but still acks', () => {
    const afterAlert = planCancellationAlerts({
      eventKeys: ['ao:55'],
      durableAcked: new Set(),
      sessionAlerted: new Set(['ao:55']),
      suppressUiAlert: false,
    });
    expect(afterAlert.keysToShowAlert).toEqual([]);
    expect(afterAlert.keysNeedingAck).toEqual(['ao:55']);
  });

  test('FCM path may suppress duplicate Alert but still durable-acks', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:55'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: true,
    });
    expect(plan.keysToShowAlert).toEqual([]);
    expect(plan.keysNeedingAck).toEqual(['ao:55']);
  });

  test('suppress must never be used as the only path for unseen cancels', () => {
    // Documents the defect: suppress + ack with empty keysToShowAlert loses the rider message.
    const suppressed = planCancellationAlerts({
      eventKeys: ['ao:99'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: true,
    });
    expect(suppressed.keysToShowAlert).toEqual([]);
    const correctPoll = planCancellationAlerts({
      eventKeys: ['ao:99'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: false,
    });
    expect(correctPoll.keysToShowAlert).toEqual(['ao:99']);
  });
});

describe('admin status changes while Active Delivery open', () => {
  test('polls only when focused, foreground, and has active job', () => {
    expect(
      shouldPollActiveDelivery({
        screenFocused: true,
        appState: 'active',
        hasActiveJob: true,
      }),
    ).toBe(true);
    expect(
      shouldPollActiveDelivery({
        screenFocused: true,
        appState: 'background',
        hasActiveJob: true,
      }),
    ).toBe(false);
    expect(
      shouldPollActiveDelivery({
        screenFocused: false,
        appState: 'active',
        hasActiveJob: true,
      }),
    ).toBe(false);
    expect(
      shouldPollActiveDelivery({
        screenFocused: true,
        appState: 'active',
        hasActiveJob: false,
      }),
    ).toBe(false);
  });

  test('return / receipt / cancel / requeue leave live active status set', () => {
    expect(isLiveRiderActiveStatus('ReturningToStore')).toBe(true);
    expect(isLiveRiderActiveStatus('AwaitingStoreReceipt')).toBe(true);
    expect(isLiveRiderActiveStatus('Failed')).toBe(false);
    expect(isLiveRiderActiveStatus('Available')).toBe(false);
    expect(isLiveRiderActiveStatus('Cancelled')).toBe(false);
  });

  test('active delivery states remain admin-mutable until completed', () => {
    expect(isAdminMutableActiveState('RETURNING_TO_STORE')).toBe(true);
    expect(isAdminMutableActiveState('AWAITING_STORE_RECEIPT')).toBe(true);
    expect(isAdminMutableActiveState('ON_THE_WAY')).toBe(true);
    expect(isAdminMutableActiveState('COMPLETED')).toBe(false);
  });
});
