import { AppStateStatus } from 'react-native';
import { DeliveryState } from '../delivery/stateMachine';

/** Whether Active Delivery should poll for admin-driven status changes. */
export function shouldPollActiveDelivery(input: {
  screenFocused: boolean;
  appState: AppStateStatus;
  hasActiveJob: boolean;
}): boolean {
  return (
    input.screenFocused &&
    input.appState === 'active' &&
    input.hasActiveJob
  );
}

/** States that admin may change while the rider stays on Active Delivery. */
export function isAdminMutableActiveState(state: DeliveryState): boolean {
  return (
    state !== 'COMPLETED' &&
    state !== 'DELIVERED'
  );
}
