import {
  DEVIATION_MIN_FIXES,
  DEVIATION_MIN_SPAN_MS,
  OFF_ROUTE_DISTANCE_M,
  REROUTE_COOLDOWN_MS,
} from '../config/routeProgress';

export type DeviationTracker = {
  /** Distinct, strictly increasing GPS fix timestamps (ms) while off-route. */
  offRouteAtMs: number[];
};

export function createDeviationTracker(): DeviationTracker {
  return { offRouteAtMs: [] };
}

export function resetDeviationTracker(tracker: DeviationTracker): void {
  tracker.offRouteAtMs = [];
}

function sustainedDeviationMet(
  tracker: DeviationTracker,
  minFixes: number,
  minSpanMs: number,
): boolean {
  if (tracker.offRouteAtMs.length < minFixes) return false;
  const first = tracker.offRouteAtMs[0];
  const last = tracker.offRouteAtMs[tracker.offRouteAtMs.length - 1];
  return last - first >= minSpanMs;
}

/**
 * Record a reliable off-route fix. Uses the GPS fix timestamp for the span.
 * Each distinct, strictly increasing timestamp counts once; duplicates and
 * non-increasing timestamps are ignored (tracker unchanged).
 * Cleared when the rider is back on route or when callers reset on
 * unreliable/stale/GPS-loss/lifecycle interruption.
 */
export function noteDeviationSample(
  tracker: DeviationTracker,
  crossTrackMeters: number | null,
  fixTimestampMs: number,
  options?: {
    offRouteDistanceM?: number;
    minFixes?: number;
    minSpanMs?: number;
  },
): boolean {
  const offRouteM = options?.offRouteDistanceM ?? OFF_ROUTE_DISTANCE_M;
  const minFixes = options?.minFixes ?? DEVIATION_MIN_FIXES;
  const minSpanMs = options?.minSpanMs ?? DEVIATION_MIN_SPAN_MS;

  if (!Number.isFinite(fixTimestampMs) || fixTimestampMs <= 0) {
    tracker.offRouteAtMs = [];
    return false;
  }

  if (crossTrackMeters == null || crossTrackMeters <= offRouteM) {
    tracker.offRouteAtMs = [];
    return false;
  }

  const last = tracker.offRouteAtMs[tracker.offRouteAtMs.length - 1];
  if (last != null && fixTimestampMs <= last) {
    // Duplicate or non-increasing — do not recount.
    return sustainedDeviationMet(tracker, minFixes, minSpanMs);
  }

  tracker.offRouteAtMs.push(fixTimestampMs);
  // Keep a short trailing window so a long on-road stretch does not linger.
  const keepAfter = fixTimestampMs - Math.max(minSpanMs * 2, 30_000);
  tracker.offRouteAtMs = tracker.offRouteAtMs.filter(t => t >= keepAfter);

  return sustainedDeviationMet(tracker, minFixes, minSpanMs);
}

export function canAttemptAutoReroute(
  lastAttemptAtMs: number | null,
  nowMs: number,
  rerouteInFlight: boolean,
  cooldownMs: number = REROUTE_COOLDOWN_MS,
): boolean {
  if (rerouteInFlight) return false;
  if (lastAttemptAtMs == null) return true;
  return nowMs - lastAttemptAtMs >= cooldownMs;
}
