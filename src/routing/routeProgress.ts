import {
  MAX_GPS_ACCURACY_PROGRESS_M,
  MAX_GPS_AGE_MS,
  MAX_IMPLAUSIBLE_JUMP_M,
  MAX_PLAUSIBLE_SPEED_MPS,
  OFF_ROUTE_DISTANCE_M,
  PROGRESS_JITTER_M,
  PROGRESS_MIN_BACKTRACK_ACCEPT_M,
  PROGRESS_SEARCH_BACK_M,
  PROGRESS_SEARCH_FORWARD_M,
} from '../config/routeProgress';
import { distanceKm, type LatLng } from '../utils/geo';

export type RouteGeometryIndex = {
  coordinates: LatLng[];
  /** Cumulative distance to each vertex (meters). */
  cumulativeMeters: number[];
  totalMeters: number;
};

export type RouteProjection = {
  alongMeters: number;
  remainingMeters: number;
  crossTrackMeters: number;
  segmentIndex: number;
};

export type LiveProgressStatus =
  | 'ok'
  | 'off_route'
  | 'unreliable'
  | 'unavailable'
  | 'waiting_gps';

export type LiveRouteProgress = {
  status: LiveProgressStatus;
  remainingMeters: number | null;
  alongMeters: number | null;
  crossTrackMeters: number | null;
  /** Approximate remaining seconds from last route speed estimate. */
  approximateRemainingSeconds: number | null;
};

export type GpsFix = LatLng & {
  accuracy: number | null;
  timestamp: number;
};

export function buildRouteGeometryIndex(
  coordinates: LatLng[],
): RouteGeometryIndex | null {
  if (!coordinates || coordinates.length < 2) return null;
  const cumulativeMeters: number[] = [0];
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    total += distanceKm(coordinates[i - 1], coordinates[i]) * 1000;
    cumulativeMeters.push(total);
  }
  if (!(total > 0)) return null;
  return { coordinates, cumulativeMeters, totalMeters: total };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Closest point on segment A→B; returns along-segment fraction t in [0,1]. */
function projectOnSegment(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): { t: number; closest: LatLng; distM: number } {
  const ax = a.longitude;
  const ay = a.latitude;
  const bx = b.longitude;
  const by = b.latitude;
  const px = point.longitude;
  const py = point.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  }
  const closest: LatLng = {
    latitude: ay + dy * t,
    longitude: ax + dx * t,
  };
  return {
    t,
    closest,
    distM: distanceKm(point, closest) * 1000,
  };
}

/**
 * Project a point onto the route near previous progress to avoid hopping
 * across loops / parallel roads.
 */
export function projectOntoRoute(
  point: LatLng,
  index: RouteGeometryIndex,
  previousAlongMeters: number | null,
  options?: {
    searchForwardM?: number;
    searchBackM?: number;
    /**
     * When false, do not fall back to an unrestricted full-route search if the
     * continuity window finds nothing (needed for maneuver alignment on loops).
     * Default true for live GPS progress.
     */
    allowUnrestrictedFallback?: boolean;
  },
): RouteProjection | null {
  const { coordinates, cumulativeMeters, totalMeters } = index;
  if (coordinates.length < 2) return null;

  const forward = options?.searchForwardM ?? PROGRESS_SEARCH_FORWARD_M;
  const back = options?.searchBackM ?? PROGRESS_SEARCH_BACK_M;
  const allowFallback = options?.allowUnrestrictedFallback !== false;
  const hasPrev = previousAlongMeters != null && Number.isFinite(previousAlongMeters);
  const windowMin = hasPrev
    ? Math.max(0, (previousAlongMeters as number) - back)
    : 0;
  const windowMax = hasPrev
    ? Math.min(totalMeters, (previousAlongMeters as number) + forward)
    : totalMeters;

  type Candidate = RouteProjection & { score: number };
  const holder: { best: Candidate | null } = { best: null };

  const considerSegment = (i: number, restrictWindow: boolean) => {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const segStart = cumulativeMeters[i];
    const segEnd = cumulativeMeters[i + 1];
    if (restrictWindow && (segEnd < windowMin || segStart > windowMax)) {
      return;
    }
    const proj = projectOnSegment(point, a, b);
    const along = segStart + (segEnd - segStart) * proj.t;
    if (restrictWindow && (along < windowMin || along > windowMax)) {
      return;
    }
    const remaining = Math.max(0, totalMeters - along);
    // Prefer closer cross-track; break ties toward previous progress.
    const continuity = hasPrev
      ? Math.abs(along - (previousAlongMeters as number)) * 0.15
      : 0;
    const score = proj.distM + continuity;
    if (!holder.best || score < holder.best.score) {
      holder.best = {
        alongMeters: along,
        remainingMeters: remaining,
        crossTrackMeters: proj.distM,
        segmentIndex: i,
        score,
      };
    }
  };

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    considerSegment(i, hasPrev);
  }

  // If the window found nothing (e.g. large GPS skip), fall back to full route.
  if (!holder.best && hasPrev && allowFallback) {
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      considerSegment(i, false);
    }
  }

  if (!holder.best) return null;
  return {
    alongMeters: holder.best.alongMeters,
    remainingMeters: holder.best.remainingMeters,
    crossTrackMeters: holder.best.crossTrackMeters,
    segmentIndex: holder.best.segmentIndex,
  };
}

export function isReliableGpsFix(
  fix: GpsFix,
  previous: GpsFix | null,
  nowMs: number = Date.now(),
  options?: {
    /** Defaults to progress accuracy cap. */
    maxAccuracyM?: number;
    /** Defaults to MAX_GPS_AGE_MS (GPS timestamp age, not receive time). */
    maxAgeMs?: number;
  },
): boolean {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
    return false;
  }
  const maxAccuracyM = options?.maxAccuracyM ?? MAX_GPS_ACCURACY_PROGRESS_M;
  const maxAgeMs = options?.maxAgeMs ?? MAX_GPS_AGE_MS;

  // Reject missing, non-finite, or negative accuracy.
  if (
    fix.accuracy == null ||
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy < 0 ||
    fix.accuracy > maxAccuracyM
  ) {
    return false;
  }
  // Reject missing / non-finite / non-positive GPS timestamps.
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0) {
    return false;
  }
  // Age is always from the GPS measurement timestamp — not callback receive time.
  const age = nowMs - fix.timestamp;
  if (age > maxAgeMs || age < -5_000) return false;

  if (previous) {
    const distM = distanceKm(previous, fix) * 1000;
    const dtSec = (fix.timestamp - previous.timestamp) / 1000;
    if (dtSec <= 0.05) {
      if (distM > MAX_IMPLAUSIBLE_JUMP_M) return false;
    } else if (distM / dtSec > MAX_PLAUSIBLE_SPEED_MPS) {
      return false;
    }
  }
  return true;
}

/**
 * Apply projection with jitter hold and genuine backtrack acceptance.
 * Does not request a new route.
 */
export function updateLiveRouteProgress(args: {
  projection: RouteProjection;
  previousAlongMeters: number | null;
  routeDistanceMeters: number;
  routeDurationSeconds: number;
  offRouteDistanceM?: number;
}): LiveRouteProgress {
  const offRouteM = args.offRouteDistanceM ?? OFF_ROUTE_DISTANCE_M;
  const { projection } = args;

  if (projection.crossTrackMeters > offRouteM) {
    return {
      status: 'off_route',
      remainingMeters: null,
      alongMeters: args.previousAlongMeters,
      crossTrackMeters: projection.crossTrackMeters,
      approximateRemainingSeconds: null,
    };
  }

  let along = projection.alongMeters;
  const prev = args.previousAlongMeters;
  if (prev != null && Number.isFinite(prev)) {
    const delta = along - prev;
    if (Math.abs(delta) < PROGRESS_JITTER_M) {
      along = prev;
    } else if (delta < 0 && Math.abs(delta) < PROGRESS_MIN_BACKTRACK_ACCEPT_M) {
      // Small reverse wiggle — hold to avoid jitter; larger reverse accepted below.
      along = prev;
    }
    // else: accept forward progress or genuine backtrack ≥ threshold
  }

  const remainingMeters = Math.max(0, args.routeDistanceMeters - along);
  // Prefer geometry remaining when route total differs slightly from polyline sum.
  const geomRemaining = projection.remainingMeters;
  const blendedRemaining =
    Math.abs(geomRemaining - remainingMeters) < 40
      ? remainingMeters
      : Math.max(0, geomRemaining);

  const speedMps =
    args.routeDurationSeconds > 0
      ? args.routeDistanceMeters / args.routeDurationSeconds
      : 0;
  const approximateRemainingSeconds =
    speedMps > 0 ? blendedRemaining / speedMps : null;

  return {
    status: 'ok',
    remainingMeters: blendedRemaining,
    alongMeters: along,
    crossTrackMeters: projection.crossTrackMeters,
    approximateRemainingSeconds,
  };
}

export function pausedProgress(
  status: Exclude<LiveProgressStatus, 'ok'>,
  previousAlongMeters: number | null = null,
): LiveRouteProgress {
  return {
    status,
    remainingMeters: null,
    alongMeters: previousAlongMeters,
    crossTrackMeters: null,
    approximateRemainingSeconds: null,
  };
}
