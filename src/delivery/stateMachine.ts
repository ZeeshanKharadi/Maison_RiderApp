/**
 * Delivery lifecycle state machine — UI renders from this config only.
 * Future APIs can return `state`; the app advances via `getNextState`.
 */

export type DeliveryState =
  | 'ACCEPTED'
  | 'NAVIGATE_TO_PICKUP'
  | 'ARRIVED_AT_PICKUP'
  | 'PICKUP_CONFIRMED'
  | 'ON_THE_WAY'
  | 'ARRIVED_AT_DESTINATION'
  | 'DELIVERED'
  | 'COMPLETED';

export type StatusTone = 'info' | 'success' | 'warning' | 'neutral';

export type DeliveryStateConfig = {
  state: DeliveryState;
  title: string;
  description: string;
  primaryAction: string | null;
  secondaryAction: string | null;
  progress: number;
  pillLabel: string;
  pillTone: StatusTone;
  timelineLabel: string;
};

/** Ordered progression (excludes AVAILABLE — that lives on the offers list). */
export const DELIVERY_FLOW: DeliveryState[] = [
  'ACCEPTED',
  'NAVIGATE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKUP_CONFIRMED',
  'ON_THE_WAY',
  'ARRIVED_AT_DESTINATION',
  'DELIVERED',
  'COMPLETED',
];

export const DELIVERY_STATE_CONFIG: Record<DeliveryState, DeliveryStateConfig> =
  {
    ACCEPTED: {
      state: 'ACCEPTED',
      title: 'Order accepted',
      description: 'Head to the restaurant to collect the order.',
      primaryAction: 'Navigate to Pickup',
      secondaryAction: null,
      progress: 10,
      pillLabel: 'Accepted',
      pillTone: 'info',
      timelineLabel: 'Accepted',
    },
    NAVIGATE_TO_PICKUP: {
      state: 'NAVIGATE_TO_PICKUP',
      title: 'Navigating to pickup',
      description: 'Follow the route to the restaurant. Tap when you arrive.',
      primaryAction: 'Arrived at Pickup',
      secondaryAction: null,
      progress: 25,
      pillLabel: 'To pickup',
      pillTone: 'info',
      timelineLabel: 'Navigate to pickup',
    },
    ARRIVED_AT_PICKUP: {
      state: 'ARRIVED_AT_PICKUP',
      title: 'Arrived at pickup',
      description: 'Confirm you have collected the package from the restaurant.',
      primaryAction: 'Confirm Pickup',
      secondaryAction: null,
      progress: 40,
      pillLabel: 'At pickup',
      pillTone: 'warning',
      timelineLabel: 'Arrived at pickup',
    },
    PICKUP_CONFIRMED: {
      state: 'PICKUP_CONFIRMED',
      title: 'Pickup confirmed',
      description: 'Package secured. Start the trip to the customer.',
      primaryAction: 'Start Delivery',
      secondaryAction: null,
      progress: 60,
      pillLabel: 'Picked up',
      pillTone: 'success',
      timelineLabel: 'Pickup confirmed',
    },
    ON_THE_WAY: {
      state: 'ON_THE_WAY',
      title: 'On the way',
      description: 'Delivering to the customer. Tap when you arrive.',
      primaryAction: 'Arrived at Destination',
      secondaryAction: null,
      progress: 80,
      pillLabel: 'On the way',
      pillTone: 'info',
      timelineLabel: 'On the way',
    },
    ARRIVED_AT_DESTINATION: {
      state: 'ARRIVED_AT_DESTINATION',
      title: 'Arrived at destination',
      description: 'Hand over the order, then complete the delivery.',
      primaryAction: 'Complete Delivery',
      secondaryAction: null,
      progress: 90,
      pillLabel: 'At drop-off',
      pillTone: 'warning',
      timelineLabel: 'Arrived at destination',
    },
    DELIVERED: {
      state: 'DELIVERED',
      title: 'Delivered',
      description: 'Order handed over. Finalizing your trip…',
      primaryAction: null,
      secondaryAction: null,
      progress: 95,
      pillLabel: 'Delivered',
      pillTone: 'success',
      timelineLabel: 'Delivered',
    },
    COMPLETED: {
      state: 'COMPLETED',
      title: 'Completed',
      description: 'Trip finished. Earnings have been added to your wallet.',
      primaryAction: null,
      secondaryAction: null,
      progress: 100,
      pillLabel: 'Completed',
      pillTone: 'success',
      timelineLabel: 'Completed',
    },
  };

export function getStateConfig(state: DeliveryState): DeliveryStateConfig {
  return DELIVERY_STATE_CONFIG[state];
}

export function getNextState(state: DeliveryState): DeliveryState | null {
  const idx = DELIVERY_FLOW.indexOf(state);
  if (idx < 0 || idx >= DELIVERY_FLOW.length - 1) return null;
  return DELIVERY_FLOW[idx + 1];
}

export function isTerminalState(state: DeliveryState): boolean {
  return state === 'COMPLETED';
}

/** States where Complete Delivery (with COD gate) applies. */
export function isCompletionStep(state: DeliveryState): boolean {
  return state === 'ARRIVED_AT_DESTINATION';
}
