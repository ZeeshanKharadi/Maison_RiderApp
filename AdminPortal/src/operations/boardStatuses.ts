/** Live Ops board columns — includes failed-delivery lifecycle statuses. */
export const OPS_BOARD_STATUSES = [
  'Available',
  'Accepted',
  'NavigatingToPickup',
  'ArrivedAtPickup',
  'InProgress',
  'OnTheWay',
  'ArrivedAtCustomer',
  'ReturningToStore',
  'AwaitingStoreReceipt',
  'Delivered',
  'Completed',
  'Cancelled',
  'Failed',
  'Rejected',
] as const;

export type OpsBoardStatus = (typeof OPS_BOARD_STATUSES)[number];

/** Columns managers must notice — return / store receipt pending. */
export const ACTION_NEEDED_STATUSES = [
  'ReturningToStore',
  'AwaitingStoreReceipt',
] as const;

export type ActionNeededStatus = (typeof ACTION_NEEDED_STATUSES)[number];

export const OPS_STATUS_LABELS: Record<string, string> = {
  Available: 'Available',
  Accepted: 'Accepted',
  NavigatingToPickup: 'To pickup',
  ArrivedAtPickup: 'At pickup',
  InProgress: 'Picked up',
  OnTheWay: 'On the way',
  ArrivedAtCustomer: 'At customer',
  ReturningToStore: 'Returning to store',
  AwaitingStoreReceipt: 'Awaiting store receipt',
  Delivered: 'Delivered',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Failed: 'Failed',
  Rejected: 'Rejected',
};

export function isOpsBoardStatus(status: string): status is OpsBoardStatus {
  return (OPS_BOARD_STATUSES as readonly string[]).includes(status);
}

export function isActionNeededStatus(status: string): status is ActionNeededStatus {
  return (ACTION_NEEDED_STATUSES as readonly string[]).includes(status);
}

export function statusLabel(status: string): string {
  return OPS_STATUS_LABELS[status] || status;
}

/** Empty buckets for every board column (including Rejected event column). */
export function emptyBoardBuckets<T>(): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const st of OPS_BOARD_STATUSES) map[st] = [];
  return map;
}

/**
 * Group assigned orders into board columns.
 * When filterStatus is Rejected, assigned-order rows are omitted (event column owns that view).
 */
export function groupOrdersByBoardStatus<T extends { status: string }>(
  orders: T[],
  filterStatus?: string,
): Record<string, T[]> {
  const map = emptyBoardBuckets<T>();
  for (const o of orders) {
    if (filterStatus === 'Rejected') continue;
    (map[o.status] ||= []).push(o);
  }
  return map;
}

export type ActionNeededCounts = {
  ReturningToStore: number;
  AwaitingStoreReceipt: number;
  total: number;
};

export function actionNeededCounts(
  orders: Array<{ status: string }>,
): ActionNeededCounts {
  let ReturningToStore = 0;
  let AwaitingStoreReceipt = 0;
  for (const o of orders) {
    if (o.status === 'ReturningToStore') ReturningToStore += 1;
    else if (o.status === 'AwaitingStoreReceipt') AwaitingStoreReceipt += 1;
  }
  return {
    ReturningToStore,
    AwaitingStoreReceipt,
    total: ReturningToStore + AwaitingStoreReceipt,
  };
}

export type ActionNeededSnapshot = ActionNeededCounts & {
  /**
   * True when counts are store-scoped only (no status / date / rider narrowing).
   * False when derived from the board's filtered order list.
   */
  isComplete: boolean;
};

/** Build banner/shortcut snapshot; mark filtered when a full scoped count is unavailable. */
export function toActionNeededSnapshot(
  counts: ActionNeededCounts,
  isComplete: boolean,
): ActionNeededSnapshot {
  return { ...counts, isComplete };
}

export function actionNeededCountLabel(
  value: number,
  isComplete: boolean,
): string {
  return isComplete ? String(value) : `${value} (filtered)`;
}

/**
 * Query params for a complete store-scoped action-status fetch.
 * Omits status/date/rider board filters so both shortcuts stay accurate.
 */
export function actionNeededQueryParams(
  storeId: string,
  status: ActionNeededStatus,
): URLSearchParams {
  const qs = new URLSearchParams();
  if (storeId) qs.set('storeId', storeId);
  qs.set('status', status);
  return qs;
}
