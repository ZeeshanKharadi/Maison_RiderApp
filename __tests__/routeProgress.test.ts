import {
  buildRouteGeometryIndex,
  isReliableGpsFix,
  projectOntoRoute,
  updateLiveRouteProgress,
} from '../src/routing/routeProgress';
import {
  canAttemptAutoReroute,
  createDeviationTracker,
  noteDeviationSample,
  resetDeviationTracker,
} from '../src/routing/routeDeviation';
import { OFF_ROUTE_DISTANCE_M } from '../src/config/routeProgress';

describe('routeProgress', () => {
  const line = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.01 },
    { latitude: 0, longitude: 0.02 },
  ];

  it('builds geometry and projects with continuity', () => {
    const index = buildRouteGeometryIndex(line);
    expect(index).not.toBeNull();
    if (!index) return;

    const mid = projectOntoRoute(
      { latitude: 0.0001, longitude: 0.01 },
      index,
      null,
    );
    expect(mid).not.toBeNull();
    expect(mid!.alongMeters).toBeGreaterThan(0);
    expect(mid!.remainingMeters).toBeLessThan(index.totalMeters);

    const jumped = projectOntoRoute(
      { latitude: 0.0001, longitude: 0.001 },
      index,
      mid!.alongMeters,
    );
    expect(jumped).not.toBeNull();
    // Prefer continuity near previous progress over distant parallel match.
    expect(Math.abs(jumped!.alongMeters - mid!.alongMeters)).toBeLessThan(
      index.totalMeters * 0.6,
    );
  });

  it('rejects inaccurate GPS and holds jitter', () => {
    expect(
      isReliableGpsFix(
        {
          latitude: 1,
          longitude: 1,
          accuracy: 120,
          timestamp: Date.now(),
        },
        null,
      ),
    ).toBe(false);
    expect(
      isReliableGpsFix(
        {
          latitude: 1,
          longitude: 1,
          accuracy: -1,
          timestamp: Date.now(),
        },
        null,
      ),
    ).toBe(false);
    expect(
      isReliableGpsFix(
        {
          latitude: 1,
          longitude: 1,
          accuracy: 10,
          timestamp: NaN,
        },
        null,
      ),
    ).toBe(false);

    const index = buildRouteGeometryIndex(line)!;
    const proj = projectOntoRoute(
      { latitude: 0, longitude: 0.01001 },
      index,
      index.totalMeters * 0.5,
    )!;
    const held = updateLiveRouteProgress({
      projection: {
        ...proj,
        alongMeters: index.totalMeters * 0.5 + 5,
        remainingMeters: index.totalMeters * 0.5 - 5,
        crossTrackMeters: 5,
      },
      previousAlongMeters: index.totalMeters * 0.5,
      routeDistanceMeters: index.totalMeters,
      routeDurationSeconds: 600,
    });
    expect(held.status).toBe('ok');
    expect(held.alongMeters).toBeCloseTo(index.totalMeters * 0.5, 0);
  });

  it('marks off-route when cross-track exceeds threshold', () => {
    const next = updateLiveRouteProgress({
      projection: {
        alongMeters: 100,
        remainingMeters: 400,
        crossTrackMeters: OFF_ROUTE_DISTANCE_M + 10,
        segmentIndex: 0,
      },
      previousAlongMeters: 100,
      routeDistanceMeters: 500,
      routeDurationSeconds: 600,
    });
    expect(next.status).toBe('off_route');
    expect(next.remainingMeters).toBeNull();
  });
});

describe('routeDeviation', () => {
  it('requires sustained off-route fixes before reroute', () => {
    const tracker = createDeviationTracker();
    const t0 = 1_000_000;
    expect(noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0)).toBe(
      false,
    );
    expect(
      noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0 + 3_000),
    ).toBe(false);
    expect(
      noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0 + 8_000),
    ).toBe(true);

    resetDeviationTracker(tracker);
    expect(noteDeviationSample(tracker, 10, t0 + 9_000)).toBe(false);

    expect(canAttemptAutoReroute(null, t0, false)).toBe(true);
    expect(canAttemptAutoReroute(t0, t0 + 10_000, false)).toBe(false);
    expect(canAttemptAutoReroute(t0, t0 + 31_000, false)).toBe(true);
    expect(canAttemptAutoReroute(t0, t0 + 31_000, true)).toBe(false);
  });

  it('counts each strictly increasing fix timestamp once', () => {
    const tracker = createDeviationTracker();
    const t0 = 2_000_000;
    expect(noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0)).toBe(
      false,
    );
    // Duplicate timestamp must not advance the count.
    expect(noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0)).toBe(
      false,
    );
    expect(tracker.offRouteAtMs).toEqual([t0]);
    // Non-increasing rejected.
    expect(
      noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0 - 1),
    ).toBe(false);
    expect(tracker.offRouteAtMs).toEqual([t0]);
    expect(
      noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0 + 4_000),
    ).toBe(false);
    expect(
      noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, t0 + 8_000),
    ).toBe(true);
    // Invalid timestamp resets consecutive tracking.
    expect(noteDeviationSample(tracker, OFF_ROUTE_DISTANCE_M + 1, NaN)).toBe(
      false,
    );
    expect(tracker.offRouteAtMs).toEqual([]);
  });
});
