import {
  buildManeuverGuidance,
  formatManeuverInstruction,
  parseRouteManeuvers,
  updateManeuverIndex,
  type RouteManeuver,
} from '../src/routing/routeManeuvers';
import { MANEUVER_PASS_TOLERANCE_M } from '../src/config/routeManeuvers';

/** Eastbound overview covering 67.0 → 67.003 at lat 24.8. */
const OVERVIEW = [
  { latitude: 24.8, longitude: 67.0 },
  { latitude: 24.8, longitude: 67.001 },
  { latitude: 24.8, longitude: 67.002 },
  { latitude: 24.8, longitude: 67.003 },
];

function man(
  partial: Partial<RouteManeuver> &
    Pick<RouteManeuver, 'type' | 'alongMeters'>,
): RouteManeuver {
  return {
    modifier: null,
    location: { latitude: 24.8, longitude: 67.0 },
    name: '',
    exit: null,
    distanceMeters: 0,
    coordinates: [],
    ...partial,
  };
}

describe('parseRouteManeuvers', () => {
  it('places maneuvers on overview geometry with ordered continuity', () => {
    const maneuvers = parseRouteManeuvers(
      {
        legs: [
          {
            steps: [
              {
                distance: 100,
                name: 'A Street',
                maneuver: {
                  type: 'depart',
                  location: [67.0, 24.8],
                },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [67.0, 24.8],
                    [67.001, 24.8],
                  ],
                },
              },
              {
                distance: 50,
                name: 'B Road',
                maneuver: {
                  type: 'turn',
                  modifier: 'left',
                  location: [67.001, 24.8],
                },
              },
            ],
          },
          {
            steps: [
              {
                distance: 20,
                name: '',
                maneuver: {
                  type: 'roundabout',
                  exit: 2,
                  location: [67.002, 24.8],
                },
              },
              {
                distance: 0,
                name: '',
                maneuver: {
                  type: 'arrive',
                  location: [67.003, 24.8],
                },
              },
            ],
          },
        ],
      },
      OVERVIEW,
    );

    expect(maneuvers).not.toBeNull();
    expect(maneuvers!).toHaveLength(4);
    // Geometry scale: strictly non-decreasing along the overview.
    for (let i = 1; i < maneuvers!.length; i += 1) {
      expect(maneuvers![i].alongMeters).toBeGreaterThanOrEqual(
        maneuvers![i - 1].alongMeters,
      );
    }
    expect(maneuvers![0].alongMeters).toBeLessThan(maneuvers![3].alongMeters);
    expect(maneuvers![0].coordinates.length).toBe(2);
  });

  it('returns null for incomplete legs or missing maneuver location', () => {
    expect(
      parseRouteManeuvers(
        {
          legs: [
            {
              steps: [
                {
                  distance: 10,
                  maneuver: { type: 'depart' },
                },
              ],
            },
          ],
        },
        OVERVIEW,
      ),
    ).toBeNull();

    expect(
      parseRouteManeuvers(
        {
          legs: [
            {
              steps: [
                {
                  distance: 10,
                  maneuver: {
                    type: 'depart',
                    location: [67.0, 24.8],
                  },
                },
              ],
            },
            { steps: [] },
          ],
        },
        OVERVIEW,
      ),
    ).toBeNull();
  });
});

describe('updateManeuverIndex', () => {
  const maneuvers = [
    man({ type: 'depart', alongMeters: 0 }),
    man({ type: 'turn', modifier: 'right', alongMeters: 100 }),
    man({ type: 'arrive', alongMeters: 200 }),
  ];

  it('advances only after pass tolerance and retreats on backtrack', () => {
    expect(updateManeuverIndex(maneuvers, 10, 0)).toBe(0);
    expect(
      updateManeuverIndex(maneuvers, MANEUVER_PASS_TOLERANCE_M, 0),
    ).toBe(1);
    expect(
      updateManeuverIndex(maneuvers, 100 + MANEUVER_PASS_TOLERANCE_M - 1, 1),
    ).toBe(1);
    expect(
      updateManeuverIndex(maneuvers, 100 + MANEUVER_PASS_TOLERANCE_M, 1),
    ).toBe(2);
    expect(updateManeuverIndex(maneuvers, 10, 1)).toBe(0);
  });
});

describe('formatManeuverInstruction', () => {
  it('formats continue modifiers with matching icons', () => {
    expect(
      formatManeuverInstruction(
        man({
          type: 'continue',
          modifier: 'uturn',
          alongMeters: 100,
          name: 'Main St',
        }),
      ),
    ).toEqual({
      instruction: 'Make a U-turn',
      icon: 'u-turn-left',
      roadName: 'Main St',
    });

    expect(
      formatManeuverInstruction(
        man({
          type: 'continue',
          modifier: 'slight left',
          alongMeters: 100,
        }),
      ),
    ).toEqual({
      instruction: 'Slight left',
      icon: 'arrow-top-left',
      roadName: null,
    });

    expect(
      formatManeuverInstruction(
        man({
          type: 'continue',
          modifier: null,
          alongMeters: 100,
          name: 'Main St',
        }),
      ).roadName,
    ).toBeNull();
  });
});

describe('buildManeuverGuidance', () => {
  it('uses neutral pause copy and keeps index frozen', () => {
    expect(
      buildManeuverGuidance({
        maneuvers: null,
        alongMeters: 50,
        currentIndex: 0,
        paused: false,
      }).guidance.status,
    ).toBe('unavailable');

    const maneuvers = [
      man({ type: 'depart', alongMeters: 0 }),
      man({ type: 'arrive', alongMeters: 200 }),
    ];

    const paused = buildManeuverGuidance({
      maneuvers,
      alongMeters: 200,
      currentIndex: 0,
      paused: true,
      pauseMessage: 'Waiting for accurate GPS',
    });
    expect(paused.guidance.status).toBe('paused');
    expect(paused.guidance.instruction).toBe('Waiting for accurate GPS');
    expect(paused.guidance.icon).toBe('pause-circle-outline');
    expect(paused.guidance.distanceToManeuverM).toBeNull();
    expect(paused.guidance.roadName).toBeNull();
    expect(paused.index).toBe(0);
  });
});
