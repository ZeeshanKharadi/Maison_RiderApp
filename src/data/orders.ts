/**
 * Available order offers — shapes ready for a future REST API.
 */

export type PaymentMethod = 'card' | 'cash' | 'wallet';
export type OrderPriority = 'normal' | 'high' | 'urgent';

export type TimelineEvent = {
  id: string;
  label: string;
  at: string; // ISO
  done: boolean;
};

export type AvailableOrder = {
  id: string;
  /** Backend AssignedOrders.Id — used for GET /api/Order/{id} */
  backendId?: number;
  restaurant: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  /** Miles as number for sorting/filtering */
  distanceMiles: number;
  /** Minutes for sorting */
  etaMinutes: number;
  orderAmount: number;
  deliveryFee: number;
  paymentMethod: PaymentMethod;
  isCod: boolean;
  priority: OrderPriority;
  fragile: boolean;
  express: boolean;
  specialInstructions?: string;
  items: number;
  packageInfo: string;
  /** When the offer was posted */
  postedAt: string; // ISO
  imageColor: string;
  timeline: TimelineEvent[];
};

/** @deprecated Use AvailableOrder — kept for gradual migration */
export type Order = AvailableOrder;

export const REJECT_REASONS = [
  'Too far',
  'Vehicle issue',
  'Break',
  'Traffic',
  'Other',
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function buildTimeline(postedMinsAgo: number): TimelineEvent[] {
  return [
    {
      id: 'created',
      label: 'Order created',
      at: minutesAgo(postedMinsAgo + 12),
      done: true,
    },
    {
      id: 'assigned',
      label: 'Assigned to zone',
      at: minutesAgo(postedMinsAgo + 5),
      done: true,
    },
    {
      id: 'offered',
      label: 'Offered to you',
      at: minutesAgo(postedMinsAgo),
      done: true,
    },
    {
      id: 'accepted',
      label: 'Accepted',
      at: '',
      done: false,
    },
    {
      id: 'pickup',
      label: 'Pickup pending',
      at: '',
      done: false,
    },
  ];
}

export const MOCK_ORDERS: AvailableOrder[] = [
  {
    id: 'ORD-1055',
    restaurant: 'The Burger House',
    customerName: 'Sarah M.',
    customerPhone: '+1 (555) 201-8841',
    pickupAddress: '142 Oak St, Downtown',
    dropoffAddress: '88 Maple Ave, Apt 4B',
    distanceMiles: 0.8,
    etaMinutes: 22,
    orderAmount: 34.5,
    deliveryFee: 12.5,
    paymentMethod: 'card',
    isCod: false,
    priority: 'high',
    fragile: false,
    express: true,
    specialInstructions: 'Leave at door. Ring once.',
    items: 4,
    packageInfo: '1 insulated bag · Hot food',
    postedAt: minutesAgo(3),
    imageColor: '#FFB74D',
    timeline: buildTimeline(3),
  },
  {
    id: 'ORD-1056',
    restaurant: 'Sakura Sushi Bar',
    customerName: 'James K.',
    customerPhone: '+1 (555) 334-1209',
    pickupAddress: '19 Cherry Lane',
    dropoffAddress: '210 River Rd',
    distanceMiles: 1.2,
    etaMinutes: 28,
    orderAmount: 52.0,
    deliveryFee: 18.75,
    paymentMethod: 'wallet',
    isCod: false,
    priority: 'urgent',
    fragile: true,
    express: true,
    specialInstructions: 'Handle carefully — sushi platter.',
    items: 6,
    packageInfo: '2 cold packs · Fragile',
    postedAt: minutesAgo(7),
    imageColor: '#E57373',
    timeline: buildTimeline(7),
  },
  {
    id: 'ORD-1057',
    restaurant: 'Pizza Palace',
    customerName: 'Priya R.',
    customerPhone: '+1 (555) 882-4410',
    pickupAddress: '5 Market Square',
    dropoffAddress: '77 Hillcrest Blvd',
    distanceMiles: 0.5,
    etaMinutes: 15,
    orderAmount: 28.75,
    deliveryFee: 9.25,
    paymentMethod: 'cash',
    isCod: true,
    priority: 'normal',
    fragile: false,
    express: false,
    specialInstructions: 'Call on arrival. COD — collect exact change.',
    items: 2,
    packageInfo: '1 large pizza box',
    postedAt: minutesAgo(1),
    imageColor: '#81C784',
    timeline: buildTimeline(1),
  },
  {
    id: 'ORD-1058',
    restaurant: 'Taco Fiesta',
    customerName: 'Mike T.',
    customerPhone: '+1 (555) 667-9033',
    pickupAddress: '330 Sunset Blvd',
    dropoffAddress: '12 Cedar Court',
    distanceMiles: 1.5,
    etaMinutes: 25,
    orderAmount: 41.2,
    deliveryFee: 14.2,
    paymentMethod: 'card',
    isCod: false,
    priority: 'normal',
    fragile: false,
    express: false,
    items: 5,
    packageInfo: '1 paper bag · 5 items',
    postedAt: minutesAgo(12),
    imageColor: '#FFD54F',
    timeline: buildTimeline(12),
  },
  {
    id: 'ORD-1059',
    restaurant: 'Green Bowl Cafe',
    customerName: 'Elena V.',
    customerPhone: '+1 (555) 110-2288',
    pickupAddress: '90 Wellness Way',
    dropoffAddress: '455 Park Lane',
    distanceMiles: 2.1,
    etaMinutes: 32,
    orderAmount: 22.0,
    deliveryFee: 11.0,
    paymentMethod: 'cash',
    isCod: true,
    priority: 'high',
    fragile: true,
    express: false,
    specialInstructions: 'Apartment lobby drop-off.',
    items: 2,
    packageInfo: 'Salad bowls · Keep upright',
    postedAt: minutesAgo(5),
    imageColor: '#64B5F6',
    timeline: buildTimeline(5),
  },
  {
    id: 'ORD-1060',
    restaurant: 'Noodle House',
    customerName: 'Chris D.',
    customerPhone: '+1 (555) 449-7712',
    pickupAddress: '18 Asia Town',
    dropoffAddress: '301 West End Ave',
    distanceMiles: 2.4,
    etaMinutes: 35,
    orderAmount: 19.5,
    deliveryFee: 8.5,
    paymentMethod: 'wallet',
    isCod: false,
    priority: 'normal',
    fragile: false,
    express: false,
    items: 1,
    packageInfo: '1 soup container',
    postedAt: minutesAgo(18),
    imageColor: '#BA68C8',
    timeline: buildTimeline(18),
  },
];

export type OrderSortKey = 'nearest' | 'highest_fee' | 'latest' | 'shortest_eta';

export type OrderFilters = {
  maxDistance: number | null; // miles
  paymentMethod: PaymentMethod | 'all';
  codOnly: boolean;
  priorityOnly: boolean;
  expressOnly: boolean;
  fragileOnly: boolean;
  sort: OrderSortKey;
};

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  maxDistance: null,
  paymentMethod: 'all',
  codOnly: false,
  priorityOnly: false,
  expressOnly: false,
  fragileOnly: false,
  sort: 'latest',
};

export function filterAndSortOrders(
  orders: AvailableOrder[],
  query: string,
  filters: OrderFilters,
): AvailableOrder[] {
  const q = query.trim().toLowerCase();

  let list = orders.filter(o => {
    if (q) {
      const hay = [
        o.id,
        o.customerName,
        o.restaurant,
        o.pickupAddress,
        o.dropoffAddress,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.maxDistance != null && o.distanceMiles > filters.maxDistance) {
      return false;
    }
    if (
      filters.paymentMethod !== 'all' &&
      o.paymentMethod !== filters.paymentMethod
    ) {
      return false;
    }
    if (filters.codOnly && !o.isCod) return false;
    if (filters.priorityOnly && o.priority === 'normal') return false;
    if (filters.expressOnly && !o.express) return false;
    if (filters.fragileOnly && !o.fragile) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    switch (filters.sort) {
      case 'nearest':
        return a.distanceMiles - b.distanceMiles;
      case 'highest_fee':
        return b.deliveryFee - a.deliveryFee;
      case 'shortest_eta':
        return a.etaMinutes - b.etaMinutes;
      case 'latest':
      default:
        return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    }
  });

  return list;
}

export function formatPostedAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

export function paymentLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'wallet':
      return 'Wallet';
    default:
      return 'Card';
  }
}
