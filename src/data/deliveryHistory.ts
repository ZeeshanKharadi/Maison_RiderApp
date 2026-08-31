import { DeliveryTimelineStep } from '../delivery/types';
import { PaymentMethod } from './orders';

export type DeliveryStatus = 'delivered' | 'cancelled' | 'failed';

/**
 * Archived delivery — mirrors what a future history API would return.
 */
export interface DeliveryHistoryItem {
  id: string;
  restaurant: string;
  customerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  deliveredAt: string; // ISO
  orderAmount: number;
  deliveryFee: number;
  tip: number;
  distanceMiles: number;
  durationMin: number;
  items: number;
  rating?: number;
  paymentMethod: PaymentMethod;
  status: DeliveryStatus;
  imageColor: string;
  isCod: boolean;
  express: boolean;
  priority: boolean;
  fragile: boolean;
  packageInfo: string;
  specialInstructions?: string;
  deliveryNotes?: string;
  cashCollected: boolean | null;
  /** Full lifecycle timestamps when available */
  timeline: DeliveryTimelineStep[];
}

function isoBefore(base: string, minutesBefore: number): string {
  return new Date(
    new Date(base).getTime() - minutesBefore * 60_000,
  ).toISOString();
}

/** Build a completed timeline ending at deliveredAt. */
export function buildArchiveTimeline(
  deliveredAt: string,
  durationMin: number,
): DeliveryTimelineStep[] {
  const steps: { state: DeliveryTimelineStep['state']; label: string; offset: number }[] =
    [
      { state: 'ACCEPTED', label: 'Accepted', offset: durationMin + 8 },
      { state: 'NAVIGATE_TO_PICKUP', label: 'Navigate to pickup', offset: durationMin + 5 },
      { state: 'ARRIVED_AT_PICKUP', label: 'Arrived at pickup', offset: durationMin + 2 },
      { state: 'PICKUP_CONFIRMED', label: 'Pickup confirmed', offset: durationMin },
      { state: 'ON_THE_WAY', label: 'On the way', offset: Math.max(2, Math.floor(durationMin * 0.5)) },
      { state: 'ARRIVED_AT_DESTINATION', label: 'Arrived at destination', offset: 1 },
      { state: 'DELIVERED', label: 'Delivered', offset: 0 },
      { state: 'COMPLETED', label: 'Completed', offset: 0 },
    ];

  return steps.map(s => ({
    state: s.state,
    label: s.label,
    at: isoBefore(deliveredAt, s.offset),
    status: 'done' as const,
  }));
}

function item(
  partial: Omit<
    DeliveryHistoryItem,
    | 'timeline'
    | 'isCod'
    | 'express'
    | 'priority'
    | 'fragile'
    | 'packageInfo'
    | 'cashCollected'
  > &
    Partial<
      Pick<
        DeliveryHistoryItem,
        | 'isCod'
        | 'express'
        | 'priority'
        | 'fragile'
        | 'packageInfo'
        | 'cashCollected'
        | 'specialInstructions'
        | 'deliveryNotes'
        | 'timeline'
      >
    >,
): DeliveryHistoryItem {
  const isCod = partial.isCod ?? partial.paymentMethod === 'cash';
  return {
    ...partial,
    isCod,
    express: partial.express ?? false,
    priority: partial.priority ?? false,
    fragile: partial.fragile ?? false,
    packageInfo: partial.packageInfo ?? `${partial.items} items`,
    cashCollected: partial.cashCollected ?? (isCod ? true : null),
    timeline:
      partial.timeline ??
      buildArchiveTimeline(partial.deliveredAt, partial.durationMin),
  };
}

export const MOCK_DELIVERY_HISTORY: DeliveryHistoryItem[] = [
  item({
    id: 'ORD-2841',
    restaurant: 'The Burger House',
    customerName: 'Sarah M.',
    pickupAddress: '142 Oak St, Downtown',
    dropoffAddress: '88 Maple Ave, Apt 4B',
    deliveredAt: '2026-07-10T13:42:00',
    orderAmount: 34.5,
    deliveryFee: 8.25,
    tip: 4.0,
    distanceMiles: 1.4,
    durationMin: 18,
    items: 3,
    rating: 5,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#FFB74D',
    express: true,
    packageInfo: '1 insulated bag · Hot food',
    specialInstructions: 'Leave at door. Ring once.',
    deliveryNotes: 'Customer thanked rider.',
  }),
  item({
    id: 'ORD-2838',
    restaurant: 'Sakura Sushi Bar',
    customerName: 'James K.',
    pickupAddress: '19 Cherry Lane',
    dropoffAddress: '210 River Rd',
    deliveredAt: '2026-07-10T12:15:00',
    orderAmount: 52.0,
    deliveryFee: 11.5,
    tip: 6.0,
    distanceMiles: 2.1,
    durationMin: 24,
    items: 5,
    rating: 5,
    paymentMethod: 'wallet',
    status: 'delivered',
    imageColor: '#E57373',
    fragile: true,
    express: true,
    priority: true,
    packageInfo: '2 cold packs · Fragile',
    specialInstructions: 'Handle carefully — sushi platter.',
  }),
  item({
    id: 'ORD-2832',
    restaurant: 'Pizza Palace',
    customerName: 'Priya R.',
    pickupAddress: '5 Market Square',
    dropoffAddress: '77 Hillcrest Blvd',
    deliveredAt: '2026-07-10T10:48:00',
    orderAmount: 28.75,
    deliveryFee: 7.0,
    tip: 2.5,
    distanceMiles: 0.9,
    durationMin: 14,
    items: 2,
    rating: 4,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#81C784',
    packageInfo: '1 large pizza box',
  }),
  item({
    id: 'ORD-2819',
    restaurant: 'Taco Fiesta',
    customerName: 'Mike T.',
    pickupAddress: '330 Sunset Blvd',
    dropoffAddress: '12 Cedar Court',
    deliveredAt: '2026-07-09T19:30:00',
    orderAmount: 41.2,
    deliveryFee: 9.75,
    tip: 5.0,
    distanceMiles: 1.8,
    durationMin: 22,
    items: 4,
    rating: 5,
    paymentMethod: 'cash',
    status: 'delivered',
    imageColor: '#FFD54F',
    isCod: true,
    cashCollected: true,
    packageInfo: '1 paper bag · 5 items',
    deliveryNotes: 'Exact change collected.',
  }),
  item({
    id: 'ORD-2811',
    restaurant: 'Green Bowl Cafe',
    customerName: 'Elena V.',
    pickupAddress: '90 Wellness Way',
    dropoffAddress: '455 Park Lane',
    deliveredAt: '2026-07-09T17:05:00',
    orderAmount: 22.0,
    deliveryFee: 6.5,
    tip: 3.0,
    distanceMiles: 1.1,
    durationMin: 16,
    items: 2,
    rating: 4,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#64B5F6',
    packageInfo: 'Salad bowls · Keep upright',
  }),
  item({
    id: 'ORD-2804',
    restaurant: 'Noodle House',
    customerName: 'Chris D.',
    pickupAddress: '18 Asia Town',
    dropoffAddress: '301 West End Ave',
    deliveredAt: '2026-07-09T14:22:00',
    orderAmount: 19.5,
    deliveryFee: 5.75,
    tip: 0,
    distanceMiles: 2.4,
    durationMin: 31,
    items: 1,
    rating: 3,
    paymentMethod: 'wallet',
    status: 'delivered',
    imageColor: '#BA68C8',
    packageInfo: '1 soup container',
    deliveryNotes: 'Slight delay in traffic.',
  }),
  item({
    id: 'ORD-2790',
    restaurant: 'The Burger House',
    customerName: 'Anna L.',
    pickupAddress: '142 Oak St, Downtown',
    dropoffAddress: '9 Harbor View',
    deliveredAt: '2026-07-08T20:10:00',
    orderAmount: 45.0,
    deliveryFee: 10.0,
    tip: 7.0,
    distanceMiles: 3.2,
    durationMin: 28,
    items: 6,
    rating: 5,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#FFB74D',
    express: true,
    priority: true,
    packageInfo: 'Large order · 2 bags',
  }),
  item({
    id: 'ORD-2785',
    restaurant: 'Coffee & Co',
    customerName: 'Omar H.',
    pickupAddress: '2 Central Plaza',
    dropoffAddress: '1600 Tech Park',
    deliveredAt: '2026-07-08T11:40:00',
    orderAmount: 14.25,
    deliveryFee: 4.5,
    tip: 1.5,
    distanceMiles: 0.6,
    durationMin: 11,
    items: 2,
    rating: 5,
    paymentMethod: 'wallet',
    status: 'delivered',
    imageColor: '#A1887F',
    packageInfo: '2 drinks · Cup holder',
  }),
  item({
    id: 'ORD-2772',
    restaurant: 'Sakura Sushi Bar',
    customerName: 'Lisa W.',
    pickupAddress: '19 Cherry Lane',
    dropoffAddress: '88 Maple Ave, Apt 2A',
    deliveredAt: '2026-07-07T18:55:00',
    orderAmount: 67.8,
    deliveryFee: 13.25,
    tip: 8.0,
    distanceMiles: 1.7,
    durationMin: 20,
    items: 8,
    rating: 5,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#E57373',
    fragile: true,
    packageInfo: 'Party platter · Fragile',
  }),
  item({
    id: 'ORD-2760',
    restaurant: 'Pizza Palace',
    customerName: 'Tom B.',
    pickupAddress: '5 Market Square',
    dropoffAddress: '44 Industrial Rd',
    deliveredAt: '2026-07-07T13:18:00',
    orderAmount: 31.0,
    deliveryFee: 0,
    tip: 0,
    distanceMiles: 2.8,
    durationMin: 0,
    items: 3,
    paymentMethod: 'card',
    status: 'cancelled',
    imageColor: '#81C784',
    packageInfo: 'Cancelled before pickup',
    deliveryNotes: 'Customer cancelled.',
    timeline: [
      {
        state: 'ACCEPTED',
        label: 'Accepted',
        at: '2026-07-07T13:00:00.000Z',
        status: 'done',
      },
      {
        state: 'COMPLETED',
        label: 'Cancelled',
        at: '2026-07-07T13:18:00.000Z',
        status: 'done',
      },
    ],
  }),
  item({
    id: 'ORD-2748',
    restaurant: 'Taco Fiesta',
    customerName: 'Nina S.',
    pickupAddress: '330 Sunset Blvd',
    dropoffAddress: '15 Lake Drive',
    deliveredAt: '2026-07-06T19:45:00',
    orderAmount: 26.4,
    deliveryFee: 8.0,
    tip: 3.5,
    distanceMiles: 1.5,
    durationMin: 19,
    items: 3,
    rating: 4,
    paymentMethod: 'cash',
    status: 'delivered',
    imageColor: '#FFD54F',
    isCod: true,
    cashCollected: true,
    packageInfo: '3 tacos · Paper bag',
  }),
  item({
    id: 'ORD-2731',
    restaurant: 'Green Bowl Cafe',
    customerName: 'David P.',
    pickupAddress: '90 Wellness Way',
    dropoffAddress: '220 University Ave',
    deliveredAt: '2026-07-05T12:30:00',
    orderAmount: 18.9,
    deliveryFee: 6.25,
    tip: 2.0,
    distanceMiles: 1.0,
    durationMin: 15,
    items: 2,
    rating: 5,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#64B5F6',
    packageInfo: '2 bowls',
  }),
  item({
    id: 'ORD-2715',
    restaurant: 'Noodle House',
    customerName: 'Rachel G.',
    pickupAddress: '18 Asia Town',
    dropoffAddress: '8 Station Rd',
    deliveredAt: '2026-07-04T16:20:00',
    orderAmount: 23.5,
    deliveryFee: 7.5,
    tip: 0,
    distanceMiles: 2.0,
    durationMin: 35,
    items: 2,
    rating: 2,
    paymentMethod: 'wallet',
    status: 'delivered',
    imageColor: '#BA68C8',
    packageInfo: 'Soup + sides',
    deliveryNotes: 'Customer reported cold food.',
  }),
  item({
    id: 'ORD-2702',
    restaurant: 'The Burger House',
    customerName: 'Kevin J.',
    pickupAddress: '142 Oak St, Downtown',
    dropoffAddress: '501 North Bridge',
    deliveredAt: '2026-07-03T20:05:00',
    orderAmount: 38.0,
    deliveryFee: 9.0,
    tip: 4.5,
    distanceMiles: 2.2,
    durationMin: 21,
    items: 4,
    rating: 5,
    paymentMethod: 'card',
    status: 'delivered',
    imageColor: '#FFB74D',
    express: true,
    packageInfo: 'Family combo',
  }),
  item({
    id: 'ORD-2688',
    restaurant: 'Coffee & Co',
    customerName: 'Maya C.',
    pickupAddress: '2 Central Plaza',
    dropoffAddress: '33 Garden St',
    deliveredAt: '2026-07-02T09:15:00',
    orderAmount: 11.5,
    deliveryFee: 4.0,
    tip: 1.0,
    distanceMiles: 0.5,
    durationMin: 9,
    items: 1,
    rating: 5,
    paymentMethod: 'wallet',
    status: 'delivered',
    imageColor: '#A1887F',
    packageInfo: '1 latte',
  }),
];
