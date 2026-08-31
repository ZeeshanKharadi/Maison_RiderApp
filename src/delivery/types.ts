import { AvailableOrder, PaymentMethod } from '../data/orders';
import {
  DeliveryState,
  DELIVERY_FLOW,
  getNextState,
  getStateConfig,
} from './stateMachine';

export type DeliveryTimelineStep = {
  state: DeliveryState;
  label: string;
  at: string | null;
  status: 'done' | 'current' | 'upcoming';
};

export type ActiveDeliveryJob = {
  id: string;
  restaurant: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceMiles: number;
  etaMinutes: number;
  orderAmount: number;
  deliveryFee: number;
  tip: number;
  paymentMethod: PaymentMethod;
  isCod: boolean;
  packageInfo: string;
  items: number;
  specialInstructions?: string;
  imageColor: string;
  fragile: boolean;
  express: boolean;
  state: DeliveryState;
  acceptedAt: string;
  stateTimestamps: Partial<Record<DeliveryState, string>>;
  cashCollected: boolean | null;
};

export function createJobFromOrder(order: AvailableOrder): ActiveDeliveryJob {
  const now = new Date().toISOString();
  return {
    id: order.id,
    restaurant: order.restaurant,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    distanceMiles: order.distanceMiles,
    etaMinutes: order.etaMinutes,
    orderAmount: order.orderAmount,
    deliveryFee: order.deliveryFee,
    tip: 0,
    paymentMethod: order.paymentMethod,
    isCod: order.isCod,
    packageInfo: order.packageInfo,
    items: order.items,
    specialInstructions: order.specialInstructions,
    imageColor: order.imageColor,
    fragile: order.fragile,
    express: order.express,
    state: 'ACCEPTED',
    acceptedAt: now,
    stateTimestamps: { ACCEPTED: now },
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
