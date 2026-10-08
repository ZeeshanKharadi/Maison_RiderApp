import {
  MANEUVER_ALIGN_END_MAX_M,
  MANEUVER_ALIGN_MAX_BACKWARD_M,
  MANEUVER_ALIGN_MAX_CROSS_TRACK_M,
  MANEUVER_ALIGN_PLACE_WINDOW_M,
  MANEUVER_ALIGN_SEARCH_BACK_M,
  MANEUVER_ALIGN_START_MAX_M,
  MANEUVER_BACKTRACK_TOLERANCE_M,
  MANEUVER_PASS_TOLERANCE_M,
} from '../config/routeManeuvers';
import { isValidCoord, type LatLng } from '../utils/geo';
import {
  buildRouteGeometryIndex,
  projectOntoRoute,
  type RouteGeometryIndex,
} from './routeProgress';

/** One OSRM step maneuver placed along the full route. */
export type RouteManeuver = {
  type: string;
  modifier: string | null;
  location: LatLng;
  name: string;
  exit: number | null;
  /** Length of this step (meters). */
  distanceMeters: number;
  /**
   * Distance from route start on the same overview geometry scale used by
   * live progress (meters).
   */
  alongMeters: number;
  /** Step geometry when present (may be empty). */
  coordinates: LatLng[];
};

type OsrmManeuverJson = {
  type?: string;
  modifier?: string;
  location?: number[];
  exit?: number;
};

type OsrmStepJson = {
  distance?: number;
  name?: string;
  ref?: string;
  maneuver?: OsrmManeuverJson;
  geometry?: {
    type?: string;
    coordinates?: number[][];
  };
};

type OsrmLegJson = {
  steps?: OsrmStepJson[];
};

export type OsrmRouteWithLegs = {
  legs?: OsrmLegJson[];
};

function parseStepCoordinates(
  geometry: OsrmStepJson['geometry'],
): LatLng[] {
  const coords = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !Array.isArray(coords)) return [];
  const out: LatLng[] = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!isValidCoord(lat, lng)) continue;
    out.push({ latitude: lat, longitude: lng });
  }
  return out;
}

type ParsedStep = {
  type: string;
  modifier: string | null;
  location: LatLng;
  name: string;
  exit: number | null;
  distanceMeters: number;
  coordinates: LatLng[];
};

/**
 * Walk ordered step geometry forward along the overview polyline, advancing
 * the continuity cursor. The gap after a maneuver belongs to that step — not
 * the next step's (often short) distance. No unrestricted full-route fallback.
 */
function advanceCursorAlongStepGeometry(
  overview: RouteGeometryIndex,
  cursorAlong: number,
  stepCoords: LatLng[],
  stepDistanceM: number,
): number | null {
  let cursor = cursorAlong;

  if (stepCoords.length >= 2) {
    // Skip index 0 (typically at the maneuver just placed).
    for (let i = 1; i < stepCoords.length; i += 1) {
      const remainingHint = Math.max(50, stepDistanceM * 1.25 + 50);
      const proj = projectOntoRoute(stepCoords[i], overview, cursor, {
        searchForwardM: remainingHint,
        searchBackM: MANEUVER_ALIGN_SEARCH_BACK_M,
        allowUnrestrictedFallback: false,
      });
      if (!proj) return null;
      if (proj.crossTrackMeters > MANEUVER_ALIGN_MAX_CROSS_TRACK_M) return null;
      if (proj.alongMeters + MANEUVER_ALIGN_MAX_BACKWARD_M < cursor) return null;
      cursor = Math.max(cursor, proj.alongMeters);
    }
    return cursor;
  }

  // No usable step geometry: advance by this step's length on the overview scale.
  if (!(stepDistanceM >= 0)) return null;
  return Math.min(overview.totalMeters, cursor + stepDistanceM);
}

/**
 * Snap a maneuver location onto the overview near the walked cursor only.
 * Tight window — not a global nearest-point search.
 */
function placeManeuverNearCursor(
  overview: RouteGeometryIndex,
  point: LatLng,
  cursorAlong: number | null,
  isFirst: boolean,
): number | null {
  if (isFirst) {
    const proj = projectOntoRoute(point, overview, 0, {
      searchForwardM: MANEUVER_ALIGN_START_MAX_M,
      searchBackM: 0,
      allowUnrestrictedFallback: false,
    });
    if (!proj) return null;
    if (proj.crossTrackMeters > MANEUVER_ALIGN_MAX_CROSS_TRACK_M) return null;
    if (proj.alongMeters > MANEUVER_ALIGN_START_MAX_M) return null;
    return proj.alongMeters;
  }

  if (cursorAlong == null || !Number.isFinite(cursorAlong)) return null;

  const proj = projectOntoRoute(point, overview, cursorAlong, {
    searchForwardM: MANEUVER_ALIGN_PLACE_WINDOW_M,
    searchBackM: MANEUVER_ALIGN_PLACE_WINDOW_M,
    allowUnrestrictedFallback: false,
  });
  if (!proj) return null;
  if (proj.crossTrackMeters > MANEUVER_ALIGN_MAX_CROSS_TRACK_M) return null;
  if (proj.alongMeters + MANEUVER_ALIGN_MAX_BACKWARD_M < cursorAlong) return null;
  return Math.max(proj.alongMeters, cursorAlong);
}

/**
 * Parse all legs' steps into ordered maneuvers on the overview geometry
 * distance scale (same as live progress). Walks ordered step geometry forward
 * with continuity — not independent global nearest-point matching.
 * Returns null when maneuver data is missing, incomplete, or cannot be aligned
 * (route geometry/progress remain valid).
 */
export function parseRouteManeuvers(
  route: OsrmRouteWithLegs | null | undefined,
  overviewCoordinates: LatLng[],
): RouteManeuver[] | null {
  const legs = route?.legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;

  const geometry = buildRouteGeometryIndex(overviewCoordinates);
  if (!geometry) return null;

  // Flatten legs in order; reject any incomplete leg.
  const steps: ParsedStep[] = [];
  for (const leg of legs) {
    const legSteps = leg?.steps;
    if (!Array.isArray(legSteps) || legSteps.length === 0) return null;

    for (const step of legSteps) {
      const man = step?.maneuver;
      const loc = man?.location;
      if (!Array.isArray(loc) || loc.length < 2) return null;
      const lng = Number(loc[0]);
      const lat = Number(loc[1]);
      if (!isValidCoord(lat, lng)) return null;

      const type =
        typeof man?.type === 'string' && man.type.trim()
          ? man.type.trim().toLowerCase()
          : '';
      if (!type) return null;

      const distanceMeters = Number(step.distance);
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;

      const modifier =
        typeof man?.modifier === 'string' && man.modifier.trim()
          ? man.modifier.trim().toLowerCase()
          : null;

      const exitRaw = man?.exit;
      const exit =
        typeof exitRaw === 'number' &&
        Number.isFinite(exitRaw) &&
        exitRaw > 0
          ? Math.round(exitRaw)
          : null;

      const name =
        typeof step.name === 'string' ? step.name.trim() : '';

      steps.push({
        type,
        modifier,
        location: { latitude: lat, longitude: lng },
        name,
        exit,
        distanceMeters,
        coordinates: parseStepCoordinates(step.geometry),
      });
    }
  }

  if (steps.length === 0) return null;

  const maneuvers: RouteManeuver[] = [];
  let cursorAlong: number | null = null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const placePoint =
      step.coordinates.length > 0 && (i === 0 || step.type === 'depart')
        ? step.coordinates[0]
        : step.location;

    const alongMeters = placeManeuverNearCursor(
      geometry,
      placePoint,
      cursorAlong,
      i === 0,
    );
    if (alongMeters == null) return null;

    maneuvers.push({
      type: step.type,
      modifier: step.modifier,
      location: step.location,
      name: step.name,
      exit: step.exit,
      distanceMeters: step.distanceMeters,
      alongMeters,
      coordinates: step.coordinates,
    });

    // Advance using THIS step's geometry/distance — that gap owns the next place.
    if (i < steps.length - 1) {
      const advanced = advanceCursorAlongStepGeometry(
        geometry,
        alongMeters,
        step.coordinates,
        step.distanceMeters,
      );
      if (advanced == null) return null;
      if (advanced + MANEUVER_ALIGN_MAX_BACKWARD_M < alongMeters) return null;
      cursorAlong = Math.max(advanced, alongMeters);
    } else {
      cursorAlong = alongMeters;
    }
  }

  // Departure near start (already enforced for index 0); arrival near end.
  const first = maneuvers[0];
  if (first.alongMeters > MANEUVER_ALIGN_START_MAX_M) return null;

  const last = maneuvers[maneuvers.length - 1];
  if (
    geometry.totalMeters - last.alongMeters >
    MANEUVER_ALIGN_END_MAX_M
  ) {
    // Arrival matched too early (e.g. earlier loop segment) — unavailable.
    return null;
  }
  if (last.alongMeters > geometry.totalMeters + MANEUVER_ALIGN_MAX_CROSS_TRACK_M) {
    return null;
  }

  return maneuvers;
}

export type ManeuverGuidanceStatus =
  | 'active'
  | 'paused'
  | 'unavailable'
  | 'arrived';

export type ManeuverGuidance = {
  status: ManeuverGuidanceStatus;
  /** Index into maneuvers when active/arrived; frozen while paused. */
  index: number;
  distanceToManeuverM: number | null;
  instruction: string;
  icon: string;
  roadName: string | null;
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Valid directional modifiers — never invent a direction for unknown values. */
function directionalFromModifier(
  modifier: string | null,
): { instruction: string; icon: string } | null {
  switch (modifier) {
    case 'left':
      return { instruction: 'Turn left', icon: 'arrow-left' };
    case 'right':
      return { instruction: 'Turn right', icon: 'arrow-right' };
    case 'slight left':
      return { instruction: 'Slight left', icon: 'arrow-top-left' };
    case 'slight right':
      return { instruction: 'Slight right', icon: 'arrow-top-right' };
    case 'sharp left':
      return { instruction: 'Sharp left', icon: 'arrow-bottom-left' };
    case 'sharp right':
      return { instruction: 'Sharp right', icon: 'arrow-bottom-right' };
    case 'straight':
      return { instruction: 'Continue straight', icon: 'arrow-up' };
    case 'uturn':
    case 'u-turn':
      return { instruction: 'Make a U-turn', icon: 'u-turn-left' };
    default:
      return null;
  }
}

function continueFromModifier(
  modifier: string | null,
  road: string | null,
): { instruction: string; icon: string } {
  switch (modifier) {
    case 'left':
      return { instruction: 'Continue left', icon: 'arrow-left' };
    case 'right':
      return { instruction: 'Continue right', icon: 'arrow-right' };
    case 'slight left':
      return { instruction: 'Slight left', icon: 'arrow-top-left' };
    case 'slight right':
      return { instruction: 'Slight right', icon: 'arrow-top-right' };
    case 'sharp left':
      return { instruction: 'Sharp left', icon: 'arrow-bottom-left' };
    case 'sharp right':
      return { instruction: 'Sharp right', icon: 'arrow-bottom-right' };
    case 'straight':
      return { instruction: 'Continue straight', icon: 'arrow-up' };
    case 'uturn':
    case 'u-turn':
      return { instruction: 'Make a U-turn', icon: 'u-turn-left' };
    default:
      // Unsupported / missing — neutral, do not invent a direction.
      return {
        instruction: road ? `Continue on ${road}` : 'Continue',
        icon: 'arrow-up',
      };
  }
}

/** Concise English instruction + MaterialCommunityIcons name. */
export function formatManeuverInstruction(maneuver: RouteManeuver): {
  instruction: string;
  icon: string;
  roadName: string | null;
} {
  const { type, modifier, name, exit } = maneuver;
  const road = name && name !== '-' ? name : null;

  let instruction: string;
  let icon: string;

  switch (type) {
    case 'turn': {
      const dir = directionalFromModifier(modifier);
      if (dir) {
        instruction = dir.instruction;
        icon = dir.icon;
      } else {
        instruction = 'Continue';
        icon = 'arrow-up';
      }
      break;
    }
    case 'end of road': {
      const dir = directionalFromModifier(modifier);
      if (dir) {
        instruction = `${dir.instruction} at end of road`;
        icon = dir.icon;
      } else {
        instruction = 'Continue at end of road';
        icon = 'arrow-up';
      }
      break;
    }
    case 'new name':
    case 'continue': {
      const cont = continueFromModifier(modifier, road);
      instruction = cont.instruction;
      icon = cont.icon;
      break;
    }
    case 'depart':
      instruction = road ? `Depart toward ${road}` : 'Depart';
      icon = 'navigation-variant';
      break;
    case 'arrive':
      instruction = 'Arrive at destination';
      icon = 'map-marker-check';
      break;
    case 'merge': {
      const dir = directionalFromModifier(modifier);
      if (dir && modifier !== 'straight' && !modifier?.includes('uturn') && modifier !== 'u-turn') {
        // Merge left/right / slight — reuse direction word without "Turn".
        instruction = `Merge ${modifier!.replace('slight ', '').replace('sharp ', '')}`;
        icon = dir.icon;
      } else if (modifier === 'uturn' || modifier === 'u-turn') {
        instruction = 'Make a U-turn';
        icon = 'u-turn-left';
      } else {
        instruction = 'Merge';
        icon = 'call-merge';
      }
      break;
    }
    case 'fork': {
      const dir = directionalFromModifier(modifier);
      if (dir && modifier && modifier !== 'straight' && modifier !== 'uturn' && modifier !== 'u-turn') {
        const side = modifier.replace('slight ', '').replace('sharp ', '');
        instruction = `Keep ${side} at the fork`;
        icon = dir.icon;
      } else {
        instruction = 'Keep at the fork';
        icon = 'call-split';
      }
      break;
    }
    case 'on ramp':
    case 'off ramp':
    case 'ramp': {
      const dir = directionalFromModifier(modifier);
      if (dir && modifier && modifier !== 'uturn' && modifier !== 'u-turn') {
        instruction = `Take the ramp ${modifier}`;
        icon = dir.icon;
      } else {
        instruction = 'Take the ramp';
        icon = 'highway';
      }
      break;
    }
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      if (exit) {
        instruction = `Take the ${ordinal(exit)} exit`;
        icon = 'rotate-right';
      } else {
        const dir = directionalFromModifier(modifier);
        if (dir) {
          instruction = dir.instruction.replace(/^Turn /, 'Exit ');
          icon = dir.icon;
        } else {
          instruction = 'Enter the roundabout';
          icon = 'rotate-right';
        }
      }
      break;
    case 'notification': {
      const dir = directionalFromModifier(modifier);
      if (dir) {
        instruction = dir.instruction;
        icon = dir.icon;
      } else {
        instruction = 'Continue';
        icon = 'arrow-up';
      }
      break;
    }
    case 'exit roundabout':
    case 'exit rotary':
      instruction = exit
        ? `Take the ${ordinal(exit)} exit`
        : 'Exit the roundabout';
      icon = 'rotate-right';
      break;
    default:
      instruction = 'Continue';
      icon = 'arrow-up';
      break;
  }

  // Avoid duplicating the road name when already embedded in the instruction.
  let roadName: string | null = road;
  if (roadName && instruction.toLowerCase().includes(roadName.toLowerCase())) {
    roadName = null;
  }

  return { instruction, icon, roadName };
}

/**
 * Select maneuver index from along-route progress with pass/backtrack hysteresis.
 * Does not invent turns — only walks the ordered OSRM list.
 */
export function updateManeuverIndex(
  maneuvers: RouteManeuver[],
  alongMeters: number,
  currentIndex: number,
  options?: {
    passToleranceM?: number;
    backtrackToleranceM?: number;
  },
): number {
  if (maneuvers.length === 0) return 0;
  const pass = options?.passToleranceM ?? MANEUVER_PASS_TOLERANCE_M;
  const back = options?.backtrackToleranceM ?? MANEUVER_BACKTRACK_TOLERANCE_M;
  let idx = Math.max(0, Math.min(currentIndex, maneuvers.length - 1));

  while (
    idx > 0 &&
    alongMeters < maneuvers[idx - 1].alongMeters + back
  ) {
    idx -= 1;
  }

  while (
    idx < maneuvers.length - 1 &&
    alongMeters >= maneuvers[idx].alongMeters + pass
  ) {
    idx += 1;
  }

  return idx;
}

const PAUSED_ICON = 'pause-circle-outline';

export function buildManeuverGuidance(args: {
  maneuvers: RouteManeuver[] | null;
  alongMeters: number | null;
  currentIndex: number;
  paused: boolean;
  /** Neutral pause copy when directional guidance is suspended. */
  pauseMessage?: string | null;
}): { guidance: ManeuverGuidance; index: number } {
  const { maneuvers, alongMeters, paused } = args;
  if (!maneuvers || maneuvers.length === 0) {
    return {
      index: 0,
      guidance: {
        status: 'unavailable',
        index: 0,
        distanceToManeuverM: null,
        instruction: 'Turn instructions unavailable',
        icon: 'map-marker-question',
        roadName: null,
      },
    };
  }

  const idx = Math.max(0, Math.min(args.currentIndex, maneuvers.length - 1));

  if (paused || alongMeters == null || !Number.isFinite(alongMeters)) {
    return {
      index: idx,
      guidance: {
        status: 'paused',
        index: idx,
        distanceToManeuverM: null,
        instruction: args.pauseMessage?.trim() || 'Instructions paused',
        icon: PAUSED_ICON,
        roadName: null,
      },
    };
  }

  const index = updateManeuverIndex(maneuvers, alongMeters, args.currentIndex);
  const man = maneuvers[index];
  const formatted = formatManeuverInstruction(man);
  const distanceToManeuverM = Math.max(0, man.alongMeters - alongMeters);
  const isArrive = man.type === 'arrive';

  return {
    index,
    guidance: {
      status:
        isArrive && distanceToManeuverM <= MANEUVER_PASS_TOLERANCE_M
          ? 'arrived'
          : 'active',
      index,
      distanceToManeuverM,
      instruction: formatted.instruction,
      icon: formatted.icon,
      roadName: formatted.roadName,
    },
  };
}

export function formatDistanceToManeuver(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
