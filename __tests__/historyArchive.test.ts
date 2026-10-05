import {
  computeHistoryArchiveStats,
  filterAndSortHistory,
  mergeHistoryPages,
  DEFAULT_HISTORY_FILTERS,
} from '../src/data/historyQuery';
import type { DeliveryHistoryItem } from '../src/data/deliveryHistory';
import { mapOrderToHistoryItem } from '../src/api/mappers/historyMapper';
import type { AvailableOrder } from '../src/data/orders';

function baseItem(
  partial: Partial<DeliveryHistoryItem> & Pick<DeliveryHistoryItem, 'id'>,
): DeliveryHistoryItem {
  return {
    restaurant: 'Store',
    customerName: 'Customer',
    pickupAddress: 'A',
    dropoffAddress: 'B',
    deliveredAt: '2026-09-30T12:00:00.000Z',
    orderAmount: 100,
    deliveryFee: null,
    tip: null,
    distanceMiles: null,
    durationMin: 20,
    items: 1,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#000',
    isCod: false,
    express: false,
    priority: false,
    fragile: false,
    packageInfo: '1 item',
    cashCollected: null,
    timeline: [],
    ...partial,
  };
}

describe('history archive stats honesty', () => {
  test('hides earnings and distance when API fields are absent', () => {
    const stats = computeHistoryArchiveStats([
      baseItem({ id: '1', isCod: true, cashCollectedAmount: 50, cashCollected: true }),
      baseItem({ id: '2', orderAmount: 80, durationMin: 15 }),
    ]);
    expect(stats.hasEarnings).toBe(false);
    expect(stats.totalEarnings).toBeNull();
    expect(stats.hasDistance).toBe(false);
    expect(stats.longestDistance).toBeNull();
    expect(stats.deliveredCount).toBe(2);
    expect(stats.codDeliveries).toBe(1);
    expect(stats.hasCodAmounts).toBe(true);
    expect(stats.totalCodCollected).toBe(50);
  });

  test('shows earnings only when fee is present (COD kept separate)', () => {
    const stats = computeHistoryArchiveStats([
      baseItem({
        id: '1',
        deliveryFee: 10,
        tip: 2,
        isCod: true,
        cashCollectedAmount: 40,
        cashCollected: true,
      }),
    ]);
    expect(stats.hasEarnings).toBe(true);
    expect(stats.totalEarnings).toBe(12);
    expect(stats.totalCodCollected).toBe(40);
    expect(stats.totalEarnings).not.toBe(stats.totalCodCollected);
  });
});

describe('history pagination merge', () => {
  test('mergeHistoryPages appends without duplicating ids', () => {
    const a = [baseItem({ id: '1' }), baseItem({ id: '2' })];
    const b = [baseItem({ id: '2' }), baseItem({ id: '3' })];
    const merged = mergeHistoryPages(a, b);
    expect(merged.map(i => i.id)).toEqual(['1', '2', '3']);
  });
});

describe('historyMapper', () => {
  test('does not invent fee tip or distance from zero/null API values', () => {
    const order = {
      id: 'ORD-1',
      restaurant: 'Store S1',
      customerName: 'Pat',
      customerPhone: '1',
      pickupAddress: 'Store S1',
      dropoffAddress: 'Street 1',
      distanceMiles: null,
      etaMinutes: null,
      orderAmount: 55,
      deliveryFee: 0,
      paymentMethod: 'cash' as const,
      isCod: true,
      priority: 'normal' as const,
      fragile: false,
      express: false,
      items: 1,
      packageInfo: '1',
      postedAt: '2026-09-30T10:00:00.000Z',
      imageColor: '#111',
      timeline: [],
      backendId: 9,
      completedAt: '2026-09-30T11:00:00.000Z',
      acceptedAt: '2026-09-30T10:05:00.000Z',
      cashCollectedAmount: 55,
      backendStatus: 'Completed',
    } as AvailableOrder;

    const item = mapOrderToHistoryItem(order);
    expect(item.deliveryFee).toBeNull();
    expect(item.tip).toBeNull();
    expect(item.distanceMiles).toBeNull();
    expect(item.cashCollectedAmount).toBe(55);
    expect(item.orderAmount).toBe(55);
  });
});

describe('filterAndSortHistory order amount', () => {
  test('sorts by order amount not invented earnings', () => {
    const items = [
      baseItem({ id: 'low', orderAmount: 10 }),
      baseItem({ id: 'high', orderAmount: 90 }),
    ];
    const sorted = filterAndSortHistory(items, '', {
      ...DEFAULT_HISTORY_FILTERS,
      sort: 'highest_amount',
    });
    expect(sorted.map(i => i.id)).toEqual(['high', 'low']);
  });
});
