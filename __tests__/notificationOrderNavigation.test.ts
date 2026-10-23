import type { ActiveDeliveryJob } from '../src/delivery/types';
import {
  __test__,
  bindNotificationOrderNavigation,
  clearNotificationOrderNavigation,
  flushPendingNotificationNavigation,
  handleNotificationNavigation,
  openNotificationFromInbox,
} from '../src/navigation/notificationOrderNavigation';
import * as ordersRepository from '../src/repositories/ordersRepository';
import {
  __resetAuthSessionForTests,
  establishAuthSession,
} from '../src/utils/authSession';

jest.mock('../src/repositories/ordersRepository', () => ({
  fetchOrderById: jest.fn(),
  fetchAvailableOrders: jest.fn(),
}));

jest.mock('../src/navigation/RootNavigation', () => {
  const navigate = jest.fn();
  return {
    navigate,
    navigationRef: {
      isReady: jest.fn(() => true),
    },
  };
});

const { navigate, navigationRef } = jest.requireMock(
  '../src/navigation/RootNavigation',
) as {
  navigate: jest.Mock;
  navigationRef: { isReady: jest.Mock };
};

function job(partial: Partial<ActiveDeliveryJob> & { id: string; backendId: number }): ActiveDeliveryJob {
  return {
    restaurant: 'Store',
    customerName: 'Customer',
    customerPhone: '0300',
    pickupAddress: 'Store',
    dropoffAddress: 'Drop',
    distanceMiles: null,
    etaMinutes: null,
    orderAmount: 10,
    deliveryFee: 0,
    tip: 0,
    paymentMethod: 'cash',
    isCod: true,
    packageInfo: '1 item',
    items: 1,
    imageColor: '#000',
    fragile: false,
    express: false,
    state: 'ACCEPTED',
    acceptedAt: new Date().toISOString(),
    stateTimestamps: {},
    cashCollected: null,
    ...partial,
  } as ActiveDeliveryJob;
}

describe('notificationOrderNavigation', () => {
  const markNotificationRead = jest.fn();
  const selectActiveJob = jest.fn();
  const restoreActiveDeliveries = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAuthSessionForTests();
    __test__.resetForTests();
    establishAuthSession('rider-1');
    navigationRef.isReady.mockReturnValue(true);
    bindNotificationOrderNavigation({
      getSessionUserId: () => 'rider-1',
      markNotificationRead,
      selectActiveJob,
      getActiveJobs: () => [],
      restoreActiveDeliveries,
    });
  });

  afterEach(() => {
    clearNotificationOrderNavigation();
    __resetAuthSessionForTests();
  });

  test('marks notification read during order navigation', async () => {
    const active = job({
      id: 'ORD-1',
      backendId: 42,
      externalOrderId: 'ORD-1',
      backendStatus: 'Accepted',
    });
    (ordersRepository.fetchOrderById as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'ORD-1',
        backendId: 42,
        externalOrderId: 'ORD-1',
        backendStatus: 'Accepted',
        restaurant: 'Store',
        customerName: 'C',
        customerPhone: '1',
        pickupAddress: 'A',
        dropoffAddress: 'B',
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
        packageInfo: 'x',
        postedAt: new Date().toISOString(),
        imageColor: '#000',
        timeline: [],
      },
    });
    restoreActiveDeliveries.mockResolvedValue({ ok: true, jobs: [active] });

    openNotificationFromInbox({
      id: '99',
      category: 'orders',
      orderId: 'ORD-1',
      assignedOrderId: 42,
    });

    await flushPendingNotificationNavigation();
    // Allow execute microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(markNotificationRead).toHaveBeenCalledWith('99');
  });

  test('queues until navigation ready then flushes non-order to inbox', async () => {
    navigationRef.isReady.mockReturnValue(false);
    handleNotificationNavigation({
      category: 'payments',
      notificationId: '7',
      title: 'Payout',
    });
    expect(__test__.getPending()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    navigationRef.isReady.mockReturnValue(true);
    await flushPendingNotificationNavigation();

    expect(markNotificationRead).toHaveBeenCalledWith('7');
    expect(navigate).toHaveBeenCalledWith('MainDrawer', {
      screen: 'Notifications',
    });
    expect(__test__.getPending()).toBeNull();
  });

  test('selects exact backend order id after delayed restore', async () => {
    const target = job({
      id: 'ORD-9',
      backendId: 90,
      externalOrderId: 'ORD-9',
      backendStatus: 'OnTheWay',
    });
    const other = job({
      id: 'ORD-8',
      backendId: 80,
      externalOrderId: 'ORD-8',
      backendStatus: 'Accepted',
    });

    (ordersRepository.fetchOrderById as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'ORD-9',
        backendId: 90,
        externalOrderId: 'ORD-9',
        backendStatus: 'OnTheWay',
        restaurant: 'Store',
        customerName: 'C',
        customerPhone: '1',
        pickupAddress: 'A',
        dropoffAddress: 'B',
        distanceMiles: null,
        etaMinutes: null,
        orderAmount: 10,
        deliveryFee: 0,
        paymentMethod: 'card',
        isCod: false,
        priority: 'normal',
        fragile: false,
        express: false,
        items: 1,
        packageInfo: 'x',
        postedAt: new Date().toISOString(),
        imageColor: '#000',
        timeline: [],
      },
    });

    let resolveRestore: (result: {
      ok: boolean;
      jobs: ActiveDeliveryJob[];
    }) => void = () => {};
    restoreActiveDeliveries.mockReturnValue(
      new Promise<{ ok: boolean; jobs: ActiveDeliveryJob[] }>(resolve => {
        resolveRestore = resolve;
      }),
    );

    handleNotificationNavigation({
      category: 'orders',
      notificationId: '1',
      orderId: 'ORD-9',
      assignedOrderId: '90',
    });

    await Promise.resolve();
    expect(selectActiveJob).not.toHaveBeenCalled();

    resolveRestore({ ok: true, jobs: [other, target] });
    await Promise.resolve();
    await Promise.resolve();

    expect(selectActiveJob).toHaveBeenCalledWith('ORD-9');
    expect(navigate).toHaveBeenCalledWith('MainDrawer', {
      screen: 'ActiveDelivery',
    });
  });

  test('shows Retry when restore refresh fails and does not open another order', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    (ordersRepository.fetchOrderById as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'ORD-7',
        backendId: 70,
        externalOrderId: 'ORD-7',
        backendStatus: 'Accepted',
        restaurant: 'Store',
        customerName: 'C',
        customerPhone: '1',
        pickupAddress: 'A',
        dropoffAddress: 'B',
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
        packageInfo: 'x',
        postedAt: new Date().toISOString(),
        imageColor: '#000',
        timeline: [],
      },
    });
    restoreActiveDeliveries.mockResolvedValue({
      ok: false,
      jobs: [job({ id: 'ORD-OTHER', backendId: 1 })],
      errorMessage: 'Network error',
    });

    handleNotificationNavigation({
      category: 'orders',
      assignedOrderId: 70,
      orderId: 'ORD-7',
      notificationId: 'fail-restore',
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(selectActiveJob).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith('MainDrawer', {
      screen: 'ActiveDelivery',
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Order unavailable',
      expect.stringMatching(/refresh|connection|Network/i),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  test('does not open ActiveDelivery when exact job missing after restore', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');

    (ordersRepository.fetchOrderById as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'ORD-5',
        backendId: 55,
        externalOrderId: 'ORD-5',
        backendStatus: 'Accepted',
        restaurant: 'Store',
        customerName: 'C',
        customerPhone: '1',
        pickupAddress: 'A',
        dropoffAddress: 'B',
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
        packageInfo: 'x',
        postedAt: new Date().toISOString(),
        imageColor: '#000',
        timeline: [],
      },
    });
    restoreActiveDeliveries.mockResolvedValue({
      ok: true,
      jobs: [job({ id: 'ORD-1', backendId: 1, externalOrderId: 'ORD-1' })],
    });

    handleNotificationNavigation({
      category: 'orders',
      assignedOrderId: 55,
      orderId: 'ORD-5',
      notificationId: '3',
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(selectActiveJob).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith('MainDrawer', {
      screen: 'ActiveDelivery',
    });
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('findJobByBackendId prefers assigned order PK', () => {
    const jobs = [
      job({ id: 'a', backendId: 1 }),
      job({ id: 'b', backendId: 2 }),
    ];
    expect(__test__.findJobByBackendId(jobs, 2)?.id).toBe('b');
  });
});
