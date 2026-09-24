import { AvailableOrder, PaymentMethod, TimelineEvent } from '../../data/orders';
import { DeliveryState } from '../../delivery/stateMachine';

/** Matches backend AvailableOrderDto / AssignOrderItemDto */
export type ApiOrderItem = {
  itemId: number;
  description?: string | null;
  position?: string | null;
  quantity: number;
  comment?: string | null;
  lineNum?: string | null;
  size?: string | null;
};

export type ApiAvailableOrder = {
  id: number;
  orderId: string;
  orderNo?: string | null;
  displayOrderNo?: string | null;
  storeId?: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
  orderTypeId?: string | null;
  orderState?: string | null;
  status?: string | null;
  comment?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  street?: string | null;
  addressNo?: string | null;
  postCode?: string | null;
  secondaryAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  orderTotal: number;
  paymentMethod?: string | null;
  cash?: number | null;
  expectedCash?: number | null;
  cashCollected?: number | null;
  cashCollectedReason?: string | null;
  orderTime?: string | null;
  batchTime?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  isDirectAssignment?: boolean;
  items?: ApiOrderItem[];
};

export type ApiRiderPerformance = {
  completedCount: number;
  avgDurationMinutes?: number | null;
  onlineHours: number;
  codCollected: number;
  codOutstanding: number;
  from?: string | null;
  to?: string | null;
};

const IMAGE_COLORS = [
  '#FFB74D',
  '#81C784',
  '#E57373',
  '#64B5F6',
  '#BA68C8',
  '#4DB6AC',
  '#FF8A65',
];

function joinParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map(p => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

function mapPaymentMethod(
  paymentMethod?: string | null,
  cash?: number | null,
  expectedCash?: number | null,
): PaymentMethod {
  const raw = (paymentMethod ?? '').trim().toLowerCase();
  if (
    raw === '1' ||
    raw === 'c' ||
    raw === 'cash' ||
    raw === 'cod' ||
    (cash != null && cash > 0) ||
    (expectedCash != null && expectedCash > 0)
  ) {
    return 'cash';
  }
  if (raw === 'wallet' || raw === '3') return 'wallet';
  return 'card';
}

function isCodOrder(
  paymentMethod?: string | null,
  cash?: number | null,
  expectedCash?: number | null,
): boolean {
  return mapPaymentMethod(paymentMethod, cash, expectedCash) === 'cash';
}

function buildTimeline(
  createdAt: string,
  acceptedAt?: string | null,
  pickedUpAt?: string | null,
): TimelineEvent[] {
  const created = new Date(createdAt);
  const safe = Number.isNaN(created.getTime()) ? new Date() : created;
  const acceptedDone = !!(acceptedAt && !Number.isNaN(new Date(acceptedAt).getTime()));
  const pickupDone = !!(pickedUpAt && !Number.isNaN(new Date(pickedUpAt).getTime()));

  return [
    {
      id: 'created',
      label: 'Order created',
      at: safe.toISOString(),
      done: true,
    },
    {
      id: 'assigned',
      label: 'Assigned via AssignOrder',
      at: safe.toISOString(),
      done: true,
    },
    {
      id: 'offered',
      label: 'Offered to you',
      at: safe.toISOString(),
      done: true,
    },
    {
      id: 'accepted',
      label: 'Accepted',
      at: acceptedDone ? acceptedAt! : '',
      done: acceptedDone,
    },
    {
      id: 'pickup',
      label: pickupDone ? 'Picked up' : 'Pickup pending',
      at: pickupDone ? pickedUpAt! : '',
      done: pickupDone,
    },
  ];
}

function colorForId(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return IMAGE_COLORS[Math.abs(hash) % IMAGE_COLORS.length];
}

/**
 * Maps AssignOrder-backed API rows into the UI AvailableOrder shape.
 */
export function mapApiOrderToAvailable(dto: ApiAvailableOrder): AvailableOrder {
  const displayId = (
    dto.orderId ||
    dto.displayOrderNo ||
    dto.orderNo ||
    String(dto.id)
  ).trim();
  const customerName = joinParts(dto.firstName, dto.lastName) || 'Customer';
  const dropoffAddress =
    joinParts(
      dto.addressNo,
      dto.street,
      dto.secondaryAddress,
      dto.city,
      dto.postCode,
    ) || 'Address unavailable';

  const lineItems = dto.items ?? [];
  const itemCount = lineItems.reduce(
    (sum, item) => sum + Math.max(1, item.quantity || 1),
    0,
  );
  const packageInfo =
    lineItems
      .map(item => {
        const bits = [item.description, item.size, item.comment]
          .map(v => (v ?? '').trim())
          .filter(Boolean);
        return bits.join(' · ');
      })
      .filter(Boolean)
      .join(' | ') || `${Math.max(itemCount, 1)} item(s)`;

  const comment = (dto.comment ?? '').trim();
  const paymentMethod = mapPaymentMethod(
    dto.paymentMethod,
    dto.cash,
    dto.expectedCash,
  );
  const storeLabel = dto.storeId ? `Store ${dto.storeId}` : 'Store';
  const expectedCash =
    dto.expectedCash != null
      ? Number(dto.expectedCash)
      : dto.cash != null
        ? Number(dto.cash)
        : null;

  return {
    id: displayId,
    storeId: dto.storeId ?? undefined,
    storeLat: dto.storeLat ?? null,
    storeLng: dto.storeLng ?? null,
    restaurant: storeLabel,
    customerName,
    customerPhone: (dto.phone ?? '').trim() || '—',
    pickupAddress: storeLabel,
    dropoffAddress,
    customerLat: dto.lat ?? null,
    customerLng: dto.lng ?? null,
    distanceMiles: null,
    etaMinutes: null,
    orderAmount: Number(dto.orderTotal) || 0,
    deliveryFee: 0,
    paymentMethod,
    isCod: isCodOrder(dto.paymentMethod, dto.cash, dto.expectedCash),
    priority: /fast|urgent|asap/i.test(comment) ? 'urgent' : 'normal',
    fragile: false,
    express: /fast|express|asap/i.test(comment),
    specialInstructions: comment || undefined,
    items: Math.max(itemCount, lineItems.length, 1),
    packageInfo,
    postedAt: dto.createdAt || new Date().toISOString(),
    imageColor: colorForId(displayId),
    timeline: buildTimeline(
      dto.createdAt || new Date().toISOString(),
      dto.acceptedAt,
      dto.pickedUpAt,
    ),
    /** Internal PK for GET /api/Order/{id} */
    backendId: dto.id,
    externalOrderId: dto.orderId,
    expectedCash,
    backendStatus: dto.status ?? undefined,
    acceptedAt: dto.acceptedAt ?? undefined,
    pickedUpAt: dto.pickedUpAt ?? undefined,
    completedAt: dto.completedAt ?? undefined,
    isDirectAssignment: dto.isDirectAssignment ?? false,
  };
}

/** Map backend lifecycle status → local delivery UI state (no fabricated arrivals). */
export function mapBackendStatusToDeliveryState(
  status?: string | null,
): DeliveryState {
  const raw = (status ?? '').trim().toLowerCase();
  switch (raw) {
    case 'completed':
      return 'COMPLETED';
    case 'delivered':
      return 'DELIVERED';
    case 'arrivedatcustomer':
    case 'arrived_at_customer':
      return 'ARRIVED_AT_DESTINATION';
    case 'ontheway':
    case 'on_the_way':
      return 'ON_THE_WAY';
    case 'inprogress':
    case 'in_progress':
      return 'PICKUP_CONFIRMED';
    case 'arrivedatpickup':
    case 'arrived_at_pickup':
      return 'ARRIVED_AT_PICKUP';
    case 'navigatingtopickup':
    case 'navigating_to_pickup':
      return 'NAVIGATE_TO_PICKUP';
    case 'accepted':
      return 'ACCEPTED';
    default:
      return 'ACCEPTED';
  }
}

/** Local delivery UI state → server AssignedOrders.Status. */
export function mapDeliveryStateToBackendStatus(
  state: DeliveryState,
): string {
  switch (state) {
    case 'ACCEPTED':
      return 'Accepted';
    case 'NAVIGATE_TO_PICKUP':
      return 'NavigatingToPickup';
    case 'ARRIVED_AT_PICKUP':
      return 'ArrivedAtPickup';
    case 'PICKUP_CONFIRMED':
      return 'InProgress';
    case 'ON_THE_WAY':
      return 'OnTheWay';
    case 'ARRIVED_AT_DESTINATION':
      return 'ArrivedAtCustomer';
    case 'DELIVERED':
      return 'Delivered';
    case 'COMPLETED':
      return 'Completed';
    default:
      return 'Accepted';
  }
}

export function isCancelledBackendStatus(status?: string | null): boolean {
  const raw = (status ?? '').trim().toLowerCase();
  return raw === 'cancelled' || raw === 'canceled';
}
