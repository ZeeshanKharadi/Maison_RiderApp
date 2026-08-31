export type StoreDto = { storeId: string; name: string; isActive: boolean };

export type RiderDto = {
  userId: string;
  workerId: string;
  name: string;
  email: string;
  phone: string;
  storeId: string;
  storeName: string;
  isActive: boolean;
  isVerified: boolean;
  isOnline: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  roles: string[];
};

export type OrderListDto = {
  id: number;
  orderId: string;
  orderNo: string;
  storeId: string;
  status: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  street: string;
  addressNo: string;
  orderTotal: number;
  paymentMethod: string;
  cash?: number | null;
  cashCollected?: number | null;
  acceptedByUserId?: string | null;
  acceptedByName?: string | null;
  acceptedByWorkerId?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type OrderItemDto = {
  itemId: number;
  description: string;
  position: string;
  quantity: number;
  comment: string;
  lineNum: string;
  size: string;
};

export type OrderDetailDto = OrderListDto & {
  orderTypeId?: string;
  orderState?: string;
  comment?: string;
  postCode?: string;
  secondaryAddress?: string;
  lat?: number | null;
  lng?: number | null;
  orderTime?: string;
  batchTime?: string;
  items: OrderItemDto[];
};

export type LiveSummary = {
  available: number;
  accepted: number;
  inProgress: number;
  completedToday: number;
  cancelledToday: number;
  onlineRiders: number;
  cashToCollectToday: number;
};

export type RiderSettlement = {
  riderId: string;
  workerId: string;
  name: string;
  storeId: string;
  deliveryCount: number;
  cancelledCount: number;
  cashHeld: number;
  payoutDue: number;
  salesTotal: number;
};

export type PaymentsDashboard = {
  from: string;
  to: string;
  storeId?: string;
  orderCount: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  otherTotal: number;
  cashToCollect: number;
  cashCollected: number;
  byDay: { date: string; orderCount: number; total: number; cash: number; card: number; other: number }[];
  byStore: { storeId: string; orderCount: number; total: number; cash: number; card: number; other: number }[];
  byRider: RiderSettlement[];
};

export type ReportsDto = {
  status: {
    available: number;
    accepted: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  avgDeliveryTime: { sampleCount: number; avgMinutes?: number | null };
  perRiderPerDay: {
    date: string;
    riderId: string;
    workerId: string;
    name: string;
    completed: number;
    cancelled: number;
    accepted: number;
    inProgress: number;
  }[];
};

export type PayoutSettings = {
  mode: 'fixed' | 'percent' | string;
  fixedFee: number;
  percent: number;
};

export function money(n?: number | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n ?? 0);
}

export function dt(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function customerName(o: { firstName?: string; lastName?: string }) {
  return [o.firstName, o.lastName].filter(Boolean).join(' ') || 'Guest';
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
