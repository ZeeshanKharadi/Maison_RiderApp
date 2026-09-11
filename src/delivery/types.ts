import { AvailableOrder, PaymentMethod } from '../data/orders';
import {
  DeliveryState,
  DELIVERY_FLOW,
  getNextState,
  getStateConfig,
} from './stateMachine';
import { mapBackendStatusToDeliveryState } from '../api/mappers/orderMapper';

export type DeliveryTimelineStep = {
  state: DeliveryState;
  label: string;
  at: string | null;
  status: 'done' | 'current' | 'upcoming';
};

export type ActiveDeliveryJob = {
  id: string;
  /** Required backend PK for status / reject APIs */
  backendId: number;
  externalOrderId?: string;
  storeId?: string;
  storeLat?: number | null;
  storeLng?: number | null;
  restaurant: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  customerLat?: number | null;
  customerLng?: number | null;
  distanceMiles: number | null;
  etaMinutes: number | null;
  orderAmount: number;
  deliveryFee: number;
  tip: number;
  paymentMethod: PaymentMethod;
  isCod: boolean;
  expectedCash?: number | null;
  backendStatus?: string;
  cashCollectedAmount?: number | null;
  cashCollectedReason?: string | null;
  pendingAction?: 'accept' | 'pickup' | 'complete' | null;
  lastError?: string | null;
  packageInfo: string;
  items: number;
  specialInstructions?: string;
  imageColor: string;
  fragile: boolean;
  express: boolean;
  state: DeliveryState;
  acceptedAt: string;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  stateTimestamps: Partial<Record<DeliveryState, string>>;
  cashCollected: boolean | null;
};

function buildRestoreTimestamps(
  state: DeliveryState,
  acceptedAt: string,
  pickedUpAt?: string | null,
  completedAt?: string | null,
): Partial<Record<DeliveryState, string>> {
  const stamps: Partial<Record<DeliveryState, string>> = {
    ACCEPTED: acceptedAt,
  };
  if (pickedUpAt) {
    stamps.PICKUP_CONFIRMED = pickedUpAt;
    stamps.ON_THE_WAY = pickedUpAt;
  }
  if (completedAt) {
    stamps.DELIVERED = completedAt;
    stamps.COMPLETED = completedAt;
  }
  // Only stamp states we have evidence for — no fabricated arrivals.
  const currentIdx = DELIVERY_FLOW.indexOf(state);
  if (currentIdx >= 0 && !stamps[state]) {
    stamps[state] = acceptedAt;
  }
  return stamps;
}

export function createJobFromOrder(
  order: AvailableOrder,
  opts?: { restore?: boolean },
): ActiveDeliveryJob {
  if (order.backendId == null || !Number.isFinite(order.backendId)) {
    throw new Error('backendId is required to create an active delivery job');
  }

  const restore = opts?.restore === true;
  const state = restore
    ? mapBackendStatusToDeliveryState(order.backendStatus)
    : 'ACCEPTED';
  const acceptedAt =
    order.acceptedAt && !Number.isNaN(new Date(order.acceptedAt).getTime())
      ? order.acceptedAt
      : new Date().toISOString();

  return {
    id: order.id,
    backendId: order.backendId,
    externalOrderId: order.externalOrderId,
    storeId: order.storeId,
    storeLat: order.storeLat,
    storeLng: order.storeLng,
    restaurant: order.restaurant,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    customerLat: order.customerLat,
    customerLng: order.customerLng,
    distanceMiles: order.distanceMiles ?? null,
    etaMinutes: order.etaMinutes ?? null,
    orderAmount: order.orderAmount,
    deliveryFee: order.deliveryFee,
    tip: 0,
    paymentMethod: order.paymentMethod,
    isCod: order.isCod,
    expectedCash: order.expectedCash ?? null,
    backendStatus: order.backendStatus,
    cashCollectedAmount: null,
    cashCollectedReason: null,
    pendingAction: null,
    lastError: null,
    packageInfo: order.packageInfo,
    items: order.items,
    specialInstructions: order.specialInstructions,
    imageColor: order.imageColor,
    fragile: order.fragile,
    express: order.express,
    state,
    acceptedAt,
    pickedUpAt: order.pickedUpAt ?? null,
    completedAt: order.completedAt ?? null,
    stateTimestamps: restore
      ? buildRestoreTimestamps(
          state,
          acceptedAt,
          order.pickedUpAt,
          order.completedAt,
        )
      : { ACCEPTED: acceptedAt },
    cashCollected: null,
  };
}

export function buildDeliveryTimeline(
  job: ActiveDeliveryJob,
): DeliveryTimelineStep[] {
  const currentIdx = DELIVERY_FLOW.indexOf(job.state);
  return DELIVERY_FLOW.map((state, idx) => {
    const cfg = getStateConfig(state);
    let status: DeliveryTimelineStep['status'] = 'upcoming';
    if (idx < currentIdx) status = 'done';
    else if (idx === currentIdx) status = 'current';
    return {
      state,
      label: cfg.timelineLabel,
      at: job.stateTimestamps[state] ?? null,
      status,
    };
  });
}

export function transitionJob(
  job: ActiveDeliveryJob,
  next: DeliveryState,
): ActiveDeliveryJob {
  const now = new Date().toISOString();
  return {
    ...job,
    state: next,
    stateTimestamps: { ...job.stateTimestamps, [next]: now },
  };
}

export function advanceJob(job: ActiveDeliveryJob): ActiveDeliveryJob {
  const next = getNextState(job.state);
  if (!next) return job;
  return transitionJob(job, next);
}

export function jobProgress(job: ActiveDeliveryJob): number {
  return getStateConfig(job.state).progress;
}

export function estimateDurationMin(job: ActiveDeliveryJob): number {
  const start = new Date(job.acceptedAt).getTime();
  const end = Date.now();
  return Math.max(1, Math.round((end - start) / 60000));
}

/** First local step that requires backend InProgress. */
export function isInProgressTransition(from: DeliveryState, to: DeliveryState): boolean {
  return from === 'ARRIVED_AT_PICKUP' && to === 'PICKUP_CONFIRMED';
}
