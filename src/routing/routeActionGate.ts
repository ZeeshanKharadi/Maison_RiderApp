import {
  isCancelledBackendStatus,
  isLiveRiderActiveStatus,
} from '../api/mappers/orderMapper';
import type { ActiveDeliveryJob } from '../delivery/types';

/** Disable Refresh Route / external Maps for finished or unassigned jobs. */
export function areRouteActionsAllowed(
  job: ActiveDeliveryJob | null,
  confirmedUnassigned: boolean,
): boolean {
  if (confirmedUnassigned || !job) return false;
  if (
    job.state === 'COMPLETED' ||
    job.state === 'DELIVERED' ||
    job.state === 'AWAITING_STORE_RECEIPT'
  ) {
    return false;
  }
  if (isCancelledBackendStatus(job.backendStatus)) return false;
  if (
    job.backendStatus != null &&
    !isLiveRiderActiveStatus(job.backendStatus)
  ) {
    return false;
  }
  return true;
}
