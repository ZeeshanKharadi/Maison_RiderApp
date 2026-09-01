import { AvailableOrder, PaymentMethod, TimelineEvent } from '../../data/orders';

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
  orderTime?: string | null;
  batchTime?: string | null;
  createdAt: string;
  items?: ApiOrderItem[];
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
): PaymentMethod {
  const raw = (paymentMethod ?? '').trim().toLowerCase();
  if (
    raw === '1' ||
    raw === 'cash' ||
    raw === 'cod' ||
    (cash != null && cash > 0)
  ) {
    return 'cash';
  }
  if (raw === 'wallet' || raw === '3') return 'wallet';
  return 'card';
}

function buildTimeline(createdAt: string): TimelineEvent[] {
  const created = new Date(createdAt);
  const safe = Number.isNaN(created.getTime()) ? new Date() : created;
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
  const displayId = (dto.orderNo || dto.orderId || String(dto.id)).trim();
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
  const paymentMethod = mapPaymentMethod(dto.paymentMethod, dto.cash);
  const storeLabel = dto.storeId ? `Store ${dto.storeId}` : 'Store';

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
    distanceMiles: 0,
    etaMinutes: 30,
    orderAmount: Number(dto.orderTotal) || 0,
    deliveryFee: 0,
    paymentMethod,
    isCod: paymentMethod === 'cash',
    priority: /fast|urgent|asap/i.test(comment) ? 'urgent' : 'normal',
    fragile: false,
    express: /fast|express|asap/i.test(comment),
    specialInstructions: comment || undefined,
    items: Math.max(itemCount, lineItems.length, 1),
    packageInfo,
    postedAt: dto.createdAt || new Date().toISOString(),
    imageColor: colorForId(displayId),
    timeline: buildTimeline(dto.createdAt || new Date().toISOString()),
    /** Internal PK for GET /api/Order/{id} */
    backendId: dto.id,
  };
}
