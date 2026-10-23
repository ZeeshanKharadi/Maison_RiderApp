import type { ActiveDeliveryJob } from './types';

/** Authoritative active-order refresh — never treat cached jobs as a successful refresh. */
export type RestoreActiveDeliveriesResult = {
  ok: boolean;
  jobs: ActiveDeliveryJob[];
  errorMessage?: string;
};

export function restoreFail(
  jobs: ActiveDeliveryJob[] = [],
  errorMessage?: string,
): RestoreActiveDeliveriesResult {
  return { ok: false, jobs, errorMessage };
}

export function restoreOk(
  jobs: ActiveDeliveryJob[],
): RestoreActiveDeliveriesResult {
  return { ok: true, jobs };
}
