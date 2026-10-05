/**
 * Pure cancel-alert planning (Jest-friendly; no AsyncStorage).
 * DB/order status remains authoritative; this only gates rider-facing UI alerts.
 */
import { filterUnacknowledgedCancellationKeys } from './cancellationAck';

export function planCancellationAlerts(input: {
  eventKeys: string[];
  durableAcked: ReadonlySet<string>;
  sessionAlerted: ReadonlySet<string>;
  suppressUiAlert: boolean;
}): {
  /** Keys still needing durable ack (storage write). */
  keysNeedingAck: string[];
  /** Keys that should trigger a rider-facing Alert this pass. */
  keysToShowAlert: string[];
} {
  const keysNeedingAck = filterUnacknowledgedCancellationKeys(
    input.eventKeys,
    input.durableAcked,
  );
  const keysToShowAlert = input.suppressUiAlert
    ? []
    : keysNeedingAck.filter(k => !input.sessionAlerted.has(k));
  return { keysNeedingAck, keysToShowAlert };
}
