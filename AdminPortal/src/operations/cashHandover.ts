import type { OrderListDto } from '../api/types';

/** Same COD detection as Payments — cash / COD / expected or collected cash fields. */
export function isCodLike(o: OrderListDto): boolean {
  const pay = (o.paymentMethod || '').toLowerCase();
  return (
    pay.includes('cash') ||
    pay.includes('cod') ||
    o.expectedCash != null ||
    o.cashCollected != null ||
    o.cash != null
  );
}

/** Collected cash not yet confirmed handed to the store. */
export function cashOutstanding(o: OrderListDto): number {
  const collected = Number(o.cashCollected ?? 0);
  const handed = Number(o.cashHandedOverAmount ?? 0);
  return Math.max(0, collected - handed);
}

/** Completed/Failed COD with collected cash still outstanding. */
export function isHandoverPending(o: OrderListDto): boolean {
  return isCodLike(o) && Number(o.cashCollected ?? 0) > 0 && cashOutstanding(o) > 0.0001;
}

export function isHandoverComplete(o: OrderListDto): boolean {
  const collected = Number(o.cashCollected ?? 0);
  return (
    isCodLike(o) &&
    collected > 0 &&
    cashOutstanding(o) <= 0.0001 &&
    (!!o.cashHandedOverAt || Number(o.cashHandedOverAmount ?? 0) >= collected)
  );
}
