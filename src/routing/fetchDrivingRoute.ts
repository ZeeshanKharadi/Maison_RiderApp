import { LatLng, isValidCoord } from '../utils/geo';
import {
  isOsrmDemoRoutingHost,
  ROUTING_USER_AGENT,
  validateRoutingBaseUrl,
} from '../config/routing';
import {
  parseRouteManeuvers,
  type RouteManeuver,
} from './routeManeuvers';

export type DrivingRouteResult = {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  /**
   * Ordered OSRM step maneuvers, or null when steps are missing/unusable.
   * Route geometry/progress remain valid either way.
   */
  maneuvers: RouteManeuver[] | null;
};

export type DrivingRouteErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_CONFIG'
  | 'INVALID_COORDS'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HTTP'
  | 'INVALID_RESPONSE'
  | 'NO_ROUTE'
  | 'RATE_LIMIT';

export class DrivingRouteError extends Error {
  code: DrivingRouteErrorCode;

  constructor(code: DrivingRouteErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type OsrmRouteResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: number[][];
    };
    legs?: Array<{
      steps?: Array<{
        distance?: number;
        name?: string;
        maneuver?: {
          type?: string;
          modifier?: string;
          location?: number[];
          exit?: number;
        };
        geometry?: {
          type?: string;
          coordinates?: number[][];
        };
      }>;
    }>;
  }>;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEMO_MIN_INTERVAL_MS = 1000;

type InflightEntry = {
  /** Monotonic id so cleanup of an old request cannot delete a newer entry. */
  generation: number;
  promise: Promise<DrivingRouteResult>;
  /** Shared abort for the underlying fetch + rate-limit wait skip. */
  controller: AbortController;
  callers: number;
};

const inflight = new Map<string, InflightEntry>();
let entryGeneration = 0;
let lastDemoRequestStartedAt = 0;
let demoGate: Promise<void> = Promise.resolve();

function routeKey(origin: LatLng, destination: LatLng, baseUrl: string): string {
  return [
    baseUrl,
    origin.longitude.toFixed(5),
    origin.latitude.toFixed(5),
    destination.longitude.toFixed(5),
    destination.latitude.toFixed(5),
  ].join('|');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', onAbort);
  });
}

/** Serialize demo requests to ≤1/s; abortable so abandoned waits can be skipped. */
function enqueueDemoRateLimit(signal: AbortSignal): Promise<void> {
  const run = demoGate.then(async () => {
    if (signal.aborted) throw abortError(signal);
    const now = Date.now();
    const wait = DEMO_MIN_INTERVAL_MS - (now - lastDemoRequestStartedAt);
    if (wait > 0) await sleep(wait, signal);
    if (signal.aborted) throw abortError(signal);
    lastDemoRequestStartedAt = Date.now();
  });
  demoGate = run.catch(() => undefined);
  return run;
}

function abortError(signal?: AbortSignal): DrivingRouteError {
  return new DrivingRouteError('ABORTED', 'Route request cancelled.');
}

function detachCaller(entry: InflightEntry, key: string): void {
  entry.callers = Math.max(0, entry.callers - 1);
  if (entry.callers > 0) return;
  // No remaining waiters — cancel underlying work (including queued rate-limit).
  if (!entry.controller.signal.aborted) {
    entry.controller.abort();
  }
  const current = inflight.get(key);
  if (current && current.generation === entry.generation) {
    inflight.delete(key);
  }
}

/**
 * Fetch a driving route from an OSRM-compatible `/route/v1/driving` endpoint.
 * Sends only coordinates — never PII, addresses, or auth tokens.
 * Shared requests track callers; one abort does not cancel work still needed by others.
 */
export async function fetchDrivingRoute(
  origin: LatLng,
  destination: LatLng,
  options?: {
    signal?: AbortSignal;
    baseUrl?: string;
    timeoutMs?: number;
  },
): Promise<DrivingRouteResult> {
  if (options?.signal?.aborted) {
    throw abortError(options.signal);
  }

  const config = validateRoutingBaseUrl(
    options?.baseUrl !== undefined ? options.baseUrl : undefined,
  );
  if (!config.ok) {
    throw new DrivingRouteError(
      config.message.includes('not configured')
        ? 'NOT_CONFIGURED'
        : 'INVALID_CONFIG',
      config.message,
    );
  }
  const baseUrl = config.baseUrl;

  if (
    !isValidCoord(origin.latitude, origin.longitude) ||
    !isValidCoord(destination.latitude, destination.longitude)
  ) {
    throw new DrivingRouteError(
      'INVALID_COORDS',
      'Valid rider and destination coordinates are required.',
    );
  }

  const key = routeKey(origin, destination, baseUrl);
  let entry = inflight.get(key);

  if (!entry) {
    const generation = ++entryGeneration;
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const promise = (async (): Promise<DrivingRouteResult> => {
      const self = inflight.get(key);
      try {
        if (isOsrmDemoRoutingHost(baseUrl)) {
          await enqueueDemoRateLimit(controller.signal);
        }

        const path =
          `/route/v1/driving/` +
          `${origin.longitude},${origin.latitude};` +
          `${destination.longitude},${destination.latitude}` +
          `?overview=full&geometries=geojson&steps=true&generate_hints=false`;

        const response = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': ROUTING_USER_AGENT,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new DrivingRouteError(
            'HTTP',
            `Routing service returned HTTP ${response.status}.`,
          );
        }

        const body = (await response.json()) as OsrmRouteResponse;
        if (typeof body.code === 'string' && body.code !== 'Ok') {
          throw new DrivingRouteError(
            'NO_ROUTE',
            body.message || `Routing failed (${body.code}).`,
          );
        }

        const route = body.routes?.[0];
        const geom = route?.geometry;
        const coords = geom?.coordinates;
        if (
          !route ||
          geom?.type !== 'LineString' ||
          !Array.isArray(coords) ||
          coords.length < 2
        ) {
          throw new DrivingRouteError(
            'INVALID_RESPONSE',
            'Routing response did not include a usable geometry.',
          );
        }

        const distanceMeters = Number(route.distance);
        const durationSeconds = Number(route.duration);
        if (
          !Number.isFinite(distanceMeters) ||
          distanceMeters < 0 ||
          !Number.isFinite(durationSeconds) ||
          durationSeconds < 0
        ) {
          throw new DrivingRouteError(
            'INVALID_RESPONSE',
            'Routing response distance/duration was invalid.',
          );
        }

        const coordinates: LatLng[] = [];
        for (const pair of coords) {
          if (!Array.isArray(pair) || pair.length < 2) continue;
          const lng = Number(pair[0]);
          const lat = Number(pair[1]);
          if (!isValidCoord(lat, lng)) continue;
          coordinates.push({ latitude: lat, longitude: lng });
        }
        if (coordinates.length < 2) {
          throw new DrivingRouteError(
            'INVALID_RESPONSE',
            'Routing geometry had no valid coordinates.',
          );
        }

        // Maneuvers are best-effort on the overview geometry scale; never fail the route.
        const maneuvers = parseRouteManeuvers(route, coordinates);

        return { coordinates, distanceMeters, durationSeconds, maneuvers };
      } catch (err) {
        if (err instanceof DrivingRouteError) throw err;
        if (
          (err instanceof Error && err.name === 'AbortError') ||
          controller.signal.aborted
        ) {
          // Distinguish caller teardown vs timeout when possible.
          throw new DrivingRouteError(
            self && self.callers === 0 ? 'ABORTED' : 'TIMEOUT',
            self && self.callers === 0
              ? 'Route request cancelled.'
              : 'Route request timed out.',
          );
        }
        throw new DrivingRouteError(
          'HTTP',
          err instanceof Error
            ? err.message
            : 'Unable to reach routing service.',
        );
      } finally {
        clearTimeout(timer);
        const current = inflight.get(key);
        // Only remove this generation — never wipe a newer shared entry.
        if (current && current.generation === generation) {
          inflight.delete(key);
        }
      }
    })();

    entry = {
      generation,
      promise,
      controller,
      callers: 0,
    };
    inflight.set(key, entry);
  }

  entry.callers += 1;

  try {
    return await raceWithAbort(entry.promise, options?.signal);
  } finally {
    // Re-read map: entry object is still the same reference for this generation.
    detachCaller(entry, key);
  }
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort);
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}
