import {
  mapBackendStatusToDeliveryState,
  mapDeliveryStateToBackendStatus,
} from '../api/mappers/orderMapper';
import { AvailableOrder } from '../data/orders';
import { DELIVERY_FLOW, DeliveryState } from '../delivery/stateMachine';
import { ApiError } from '../repositories/types';
import { isUncertainAcceptFailure } from './acceptReconciliation';

const FLOW_INDEX = new Map<DeliveryState, number>(
  DELIVERY_FLOW.map((s, i) => [s, i]),
);

/** Uncertain after the request may have reached the server (timeout / network / 5xx). */
export function isUncertainMutationFailure(error: ApiError): boolean {
  if (error.code === 'TIMEOUT' || error.code === 'MUTATION_UNCERTAIN') {
    return true;
  }
  return isUncertainAcceptFailure(error);
}

export type StatusMutationReconcile =
  | { kind: 'applied'; order: AvailableOrder; message: string }
  | { kind: 'unchanged'; order: AvailableOrder; message: string }
  | { kind: 'diverged'; order: AvailableOrder; status: string; message: string }
  | { kind: 'unknown'; message: string };

function normalizeBackendStatus(status?: string | null): string {
  return (status ?? '').trim();
}

function flowIndexForBackendStatus(status?: string | null): number {
  const state = mapBackendStatusToDeliveryState(status);
  return FLOW_INDEX.get(state) ?? -1;
}

/**
 * After a timed-out / uncertain status or COD mutation, compare expected vs server.
 * Never treats the local optimistic change as authoritative.
 */
export function reconcileStatusMutation(input: {
  expectedBackendStatus: string;
  previousBackendStatus?: string | null;
  serverOrder: AvailableOrder | null;
  fetchFailed?: boolean;
}): StatusMutationReconcile {
  if (input.fetchFailed || !input.serverOrder) {
    return {
      kind: 'unknown',
      message:
        'Could not confirm the server order state after a connection problem. Do not retry until you refresh Active and see the current status.',
    };
  }

  const serverStatus = normalizeBackendStatus(input.serverOrder.backendStatus);
  const expected = normalizeBackendStatus(input.expectedBackendStatus);
  const previous = normalizeBackendStatus(input.previousBackendStatus);

  if (!serverStatus) {
    return {
      kind: 'unknown',
      message:
        'Server order status is missing. Refresh Active before trying again.',
    };
  }

  const serverIdx = flowIndexForBackendStatus(serverStatus);
  const expectedIdx = flowIndexForBackendStatus(expected);

  if (
    serverStatus.toLowerCase() === expected.toLowerCase() ||
    (expectedIdx >= 0 && serverIdx >= expectedIdx)
  ) {
    return {
      kind: 'applied',
      order: input.serverOrder,
      message: `Server shows ${serverStatus}.`,
    };
  }

  if (
    previous &&
    serverStatus.toLowerCase() === previous.toLowerCase()
  ) {
    return {
      kind: 'unchanged',
      order: input.serverOrder,
      message: `Server still shows ${serverStatus}. You can retry when connected.`,
    };
  }

  return {
    kind: 'diverged',
    order: input.serverOrder,
    status: serverStatus,
    message: `Server shows ${serverStatus} (expected ${expected}). Refresh Active — do not assume cash or status was saved.`,
  };
}

export function backendStatusLabel(state: DeliveryState): string {
  return mapDeliveryStateToBackendStatus(state);
}

export type CodCashResolution = {
  /** True when server CashCollected is present and used. */
  verified: boolean;
  amount: number | null;
  reason: string | null;
  /** null when non-COD or unverified; else whether submitted matched server. */
  matchedSubmitted: boolean | null;
  message: string;
};

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.0001;
}

/**
 * After uncertain COD complete with server Status=Completed, prefer server cash.
 * Never present the rider-submitted amount as saved unless the server returns it.
 */
export function resolveCodCashAfterServerCompleted(input: {
  isCod: boolean;
  submittedAmount?: number | null;
  submittedReason?: string | null;
  serverCashCollected?: number | null;
  serverCashReason?: string | null;
}): CodCashResolution {
  if (!input.isCod) {
    return {
      verified: true,
      amount: null,
      reason: null,
      matchedSubmitted: null,
      message: 'Delivery completed.',
    };
  }

  const serverAmount = input.serverCashCollected;
  const hasServerAmount =
    serverAmount != null && Number.isFinite(Number(serverAmount));

  if (!hasServerAmount) {
    return {
      verified: false,
      amount: null,
      reason: null,
      matchedSubmitted: null,
      message:
        'Delivery completed on the server, but cash could not be verified. Do not assume your submitted amount was saved.',
    };
  }

  const amount = Number(serverAmount);
  const reason = (input.serverCashReason ?? '').trim() || null;
  const submitted = input.submittedAmount;
  const hasSubmitted = submitted != null && Number.isFinite(Number(submitted));
  const matchedSubmitted = hasSubmitted
    ? amountsEqual(Number(submitted), amount)
    : null;

  if (matchedSubmitted === false) {
    return {
      verified: true,
      amount,
      reason,
      matchedSubmitted: false,
      message: `Delivery completed. Server saved cash ${amount}${
        reason ? ` (${reason})` : ''
      }; your submitted amount was ${submitted}.`,
    };
  }

  return {
    verified: true,
    amount,
    reason,
    matchedSubmitted: matchedSubmitted === true ? true : null,
    message: reason
      ? `Delivery completed. Cash ${amount} confirmed on server (${reason}).`
      : `Delivery completed. Cash ${amount} confirmed on server.`,
  };
}
