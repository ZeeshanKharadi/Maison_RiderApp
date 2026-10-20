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
  expectedCash?: number | null;
  cashHandedOverAmount?: number | null;
  cashHandedOverAt?: string | null;
  cashSemanticsNote?: string | null;
  isDirectAssignment?: boolean;
  cancelReason?: string | null;
  acceptedByUserId?: string | null;
  acceptedByName?: string | null;
  acceptedByWorkerId?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type OrderRejectionDto = {
  id: number;
  assignedOrderId: number;
  orderId: string;
  orderNo: string;
  storeId: string;
  riderUserId: string;
  riderWorkerId?: string | null;
  riderName?: string | null;
  reason?: string | null;
  isDirectAssignment: boolean;
  createdAt: string;
};

export type DeliveryIssueReportDto = {
  id: number;
  assignedOrderId: number;
  orderId: string;
  orderNo: string;
  storeId: string;
  orderStatus?: string | null;
  riderUserId: string;
  riderWorkerId?: string | null;
  riderName?: string | null;
  reasonCode: string;
  reasonLabel: string;
  note?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  internalNote?: string | null;
  acknowledgedByUserId?: string | null;
  acknowledgedByName?: string | null;
  acknowledgedAt?: string | null;
  closedByUserId?: string | null;
  closedByName?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  rowVersion?: string | null;
  history?: DeliveryIssueTriageEventDto[];
};

export type DeliveryIssueReportPageDto = {
  items: DeliveryIssueReportDto[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  dateFilterApplied: boolean;
};

export type DeliveryIssueTriageEventDto = {
  id: number;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorType?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorWorkerId?: string | null;
  internalNote?: string | null;
  at: string;
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
  statusHistory?: OrderLifecycleEventDto[];
  issueReports?: DeliveryIssueReportDto[];
  failure?: OrderFailureDto | null;
  cashOutstandingToStore?: number;
  requeueBlockedByUnreconciledCash?: boolean;
  requeueBlockReason?: string | null;
};

export type OrderFailureDto = {
  requestStatus?: string | null;
  reasonCode?: string | null;
  reasonLabel?: string | null;
  note?: string | null;
  requestId?: string | null;
  issueReportId?: number | null;
  requestedAt?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  statusBeforeReturn?: string | null;
  riderReturnedAt?: string | null;
  storeReceivedAt?: string | null;
  cashCollectedWarning?: boolean;
  cashCollected?: number | null;
  expectedCash?: number | null;
};

export type OrderLifecycleEventDto = {
  status: string;
  previousStatus?: string | null;
  actorType?: string | null;
  reason?: string | null;
  at: string;
};

export type AdminNotificationDto = {
  id: number;
  storeId?: string | null;
  category?: string | null;
  title: string;
  body?: string | null;
  orderId?: string | null;
  assignedOrderId?: number | null;
  isRead: boolean;
  createdAt: string;
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

export type PaymentsDashboard = {
  from: string;
  to: string;
  storeId?: string | null;
  orderCount?: number;
  totalSales: number;
  cashTotal: number;
  cardTotal: number;
  otherTotal: number;
  cashToCollect: number;
  cashCollected: number;
  byDay: { date: string; orderCount: number; total: number; cash: number; card: number; other: number }[];
  byStore: { storeId: string; orderCount: number; total: number; cash: number; card: number; other: number }[];
  byRider: {
    riderId: string;
    workerId: string;
    name: string;
    storeId: string;
    deliveryCount: number;
    cancelledCount: number;
    cashHeld: number;
    salesTotal: number;
    payoutDue: number;
  }[];
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
  avgDeliveryTime: {
    sampleCount: number;
    avgMinutes?: number | null;
  };
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

/** Parse API UTC instants; bare ISO (no Z) is treated as UTC to avoid local skew. */
export function parseApiDate(value?: string | null): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.includes('T') ? `${raw}Z` : `${raw.replace(' ', 'T')}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dt(value?: string | null) {
  if (!value) return '—';
  const d = parseApiDate(value);
  if (!d) return value;
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
