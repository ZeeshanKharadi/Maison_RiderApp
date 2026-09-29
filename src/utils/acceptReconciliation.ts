import { AvailableOrder } from '../data/orders';
import { isLiveRiderActiveStatus } from '../api/mappers/orderMapper';
import { ApiError } from '../repositories/types';

export type AcceptReconcileOutcome =
  | { kind: 'accepted'; order: AvailableOrder }
  | { kind: 'available'; order: AvailableOrder }
  | {
      kind: 'other';
      order?: AvailableOrder;
      status: string;
      message: string;
    }
  | { kind: 'unknown'; message: string };

export function sameAvailableOrder(
  a: Pick<AvailableOrder, 'id' | 'backendId' | 'externalOrderId'>,
  b: Pick<AvailableOrder, 'id' | 'backendId' | 'externalOrderId'>,
): boolean {
  if (a.backendId != null && b.backendId != null && a.backendId === b.backendId) {
    return true;
  }
  if (a.id && b.id && a.id === b.id) return true;
  const ae = (a.externalOrderId || '').trim();
  const be = (b.externalOrderId || '').trim();
  return ae.length > 0 && ae === be;
}

/** Network / gateway failures where the accept may have committed on the server. */
export function isUncertainAcceptFailure(error: ApiError): boolean {
  if (
    error.code === 'NETWORK' ||
    error.code === 'ACCEPT_UNCERTAIN' ||
    error.code === 'TIMEOUT'
  ) {
    return true;
  }
  const status = error.statusCode;
  if (status == null) return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/**
 * After an uncertain accept response, decide from Active + Available snapshots.
 * Prefer Active (accepted by this rider) over Available.
 */
export function reconcileAcceptAfterUncertainty(
  target: AvailableOrder,
  activeOrders: AvailableOrder[],
  availableOrders: AvailableOrder[],
): AcceptReconcileOutcome {
  const onActive = activeOrders.find(o => sameAvailableOrder(o, target));
  if (onActive) {
    const status = (onActive.backendStatus || 'Accepted').trim() || 'Accepted';
    if (isLiveRiderActiveStatus(status) || status.toLowerCase() === 'accepted') {
      return { kind: 'accepted', order: onActive };
    }
    return {
      kind: 'other',
      order: onActive,
      status,
      message: `This order is ${status} on the server (not Available for retry).`,
    };
  }

  const onAvailable = availableOrders.find(o => sameAvailableOrder(o, target));
  if (onAvailable) {
    const status = (onAvailable.backendStatus || 'Available').trim() || 'Available';
    if (status.toLowerCase() === 'available' || !onAvailable.backendStatus) {
      return { kind: 'available', order: onAvailable };
    }
    return {
      kind: 'other',
      order: onAvailable,
      status,
      message: `This order is ${status} on the server.`,
    };
  }

  return {
    kind: 'unknown',
    message:
      'Could not confirm whether the accept succeeded. Pull to refresh Active and Available, then try again only if the order is still listed as Available.',
  };
}

/** Result of recovering after local acceptOrderAsJob failed (server Accept may have committed). */
export type LocalInsertRecoveryResult = {
  ok: boolean;
  message: string;
  retryable: boolean;
  alertTitle: string;
  /** When true, caller should treat the order as accepted (restore already applied). */
  showAsAccepted: boolean;
};

/**
 * Map Active/Available reconciliation after a local job-insert failure.
 * Active → accepted. Failed server check → unknown, no blind retry.
 */
export function localJobInsertRecoveryResult(
  outcome: AcceptReconcileOutcome,
  localErrorMessage: string,
  opts?: { serverCheckFailed?: boolean },
): LocalInsertRecoveryResult {
  if (opts?.serverCheckFailed) {
    const message = `${localErrorMessage} Accept may have succeeded on the server, but Active/Available status is unknown. Do not retry until you refresh and confirm the order state.`;
    return {
      ok: false,
      message,
      retryable: false,
      alertTitle: 'Accept status unknown',
      showAsAccepted: false,
    };
  }

  if (outcome.kind === 'accepted') {
    return {
      ok: true,
      message: 'Order is on Active.',
      retryable: false,
      alertTitle: '',
      showAsAccepted: true,
    };
  }

  if (outcome.kind === 'available') {
    const message = `${localErrorMessage} The order is still Available — you can try again.`;
    return {
      ok: false,
      message,
      retryable: true,
      alertTitle: 'Accept not confirmed',
      showAsAccepted: false,
    };
  }

  if (outcome.kind === 'other') {
    return {
      ok: false,
      message: `${localErrorMessage} ${outcome.message}`,
      retryable: false,
      alertTitle: 'Accept failed',
      showAsAccepted: false,
    };
  }

  return {
    ok: false,
    message: `${localErrorMessage} ${outcome.message}`,
    retryable: false,
    alertTitle: 'Accept status unknown',
    showAsAccepted: false,
  };
}
