import { AvailableOrder } from '../data/orders';

/** Minimal active-job shape used to hide currently assigned deliveries from Available. */
export type ActiveJobRef = {
  id: string;
  backendId: number;
};

/**
 * After a successful Available refresh, the server list is authoritative.
 * Only hide rows that are still this rider's live active jobs (local UX).
 * Do not permanently exclude previously accepted/rejected IDs — requeue must
 * resurface orders the backend returns.
 */
export function applyAuthoritativeAvailableOrders(
  serverOrders: AvailableOrder[],
  activeJobs: ActiveJobRef[],
): AvailableOrder[] {
  if (!Array.isArray(serverOrders) || serverOrders.length === 0) {
    return [];
  }
  if (!activeJobs.length) {
    return [...serverOrders];
  }
  return serverOrders.filter(
    o =>
      !activeJobs.some(
        j =>
          j.id === o.id ||
          (o.backendId != null && j.backendId === o.backendId),
      ),
  );
}
