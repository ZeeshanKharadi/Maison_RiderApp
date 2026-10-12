import {
  VOICE_MANEUVER_ADVANCE_M,
  VOICE_MANEUVER_NEAR_M,
} from '../config/voiceGuidance';
import {
  formatManeuverInstruction,
  type ManeuverGuidance,
  type RouteManeuver,
} from '../routing/routeManeuvers';

export type VoiceWarningStage = 'advance' | 'near' | 'depart' | 'arrive';

export function voiceAnnouncementKey(
  routeRevision: number,
  maneuverIndex: number,
  stage: VoiceWarningStage,
): string {
  return `${routeRevision}|${maneuverIndex}|${stage}`;
}

/** Directional / U-turn continue modifiers — not straight or name-only chatter. */
function isActionableContinueModifier(modifier: string | null): boolean {
  switch (modifier) {
    case 'left':
    case 'right':
    case 'slight left':
    case 'slight right':
    case 'sharp left':
    case 'sharp right':
    case 'uturn':
    case 'u-turn':
      return true;
    default:
      return false;
  }
}

/**
 * Actionable maneuvers only — suppress routine straight / continue / name-change
 * chatter, but keep directional continue and U-turns.
 */
export function shouldSpeakManeuver(maneuver: RouteManeuver): boolean {
  if (maneuver.type === 'continue' || maneuver.type === 'new name') {
    return isActionableContinueModifier(maneuver.modifier);
  }
  if (maneuver.type === 'depart' || maneuver.type === 'arrive') {
    return true;
  }
  const { instruction } = formatManeuverInstruction(maneuver);
  if (instruction === 'Continue') return false;
  if (instruction.startsWith('Continue on ')) return false;
  if (instruction === 'Continue straight') return false;
  return true;
}

export function pickVoiceWarningStage(
  distanceToManeuverM: number,
  advanceM = VOICE_MANEUVER_ADVANCE_M,
  nearM = VOICE_MANEUVER_NEAR_M,
): 'advance' | 'near' | null {
  if (!Number.isFinite(distanceToManeuverM)) return null;
  if (distanceToManeuverM <= nearM) return 'near';
  if (distanceToManeuverM <= advanceM) return 'advance';
  return null;
}

export function isStageAnnounced(
  announced: ReadonlySet<string>,
  routeRevision: number,
  maneuverIndex: number,
  stage: VoiceWarningStage,
): boolean {
  return announced.has(
    voiceAnnouncementKey(routeRevision, maneuverIndex, stage),
  );
}

export function markAnnouncedForStage(
  announced: Set<string>,
  routeRevision: number,
  maneuverIndex: number,
  stage: VoiceWarningStage,
): void {
  announced.add(voiceAnnouncementKey(routeRevision, maneuverIndex, stage));
  if (stage === 'near') {
    announced.add(voiceAnnouncementKey(routeRevision, maneuverIndex, 'advance'));
  }
}

/**
 * Mark distance (or one-shot) stages already crossed while muted / paused /
 * backgrounded so resume does not catch up.
 */
export function suppressCrossedVoiceStages(
  announced: Set<string>,
  routeRevision: number,
  maneuverIndex: number,
  maneuver: RouteManeuver,
  guidance: ManeuverGuidance,
): void {
  if (maneuver.type === 'arrive') {
    if (guidance.status === 'arrived') {
      markAnnouncedForStage(announced, routeRevision, maneuverIndex, 'arrive');
    }
    return;
  }
  if (maneuver.type === 'depart') {
    markAnnouncedForStage(announced, routeRevision, maneuverIndex, 'depart');
    return;
  }
  if (guidance.status !== 'active') return;
  const distance = guidance.distanceToManeuverM;
  if (distance == null || !Number.isFinite(distance)) return;
  const stage = pickVoiceWarningStage(distance);
  if (!stage) return;
  markAnnouncedForStage(announced, routeRevision, maneuverIndex, stage);
}

export function nextVoiceStageToAnnounce(
  announced: ReadonlySet<string>,
  routeRevision: number,
  maneuverIndex: number,
  maneuver: RouteManeuver,
  guidance: ManeuverGuidance,
): VoiceWarningStage | null {
  if (maneuver.type === 'arrive') {
    if (guidance.status !== 'arrived') return null;
    if (isStageAnnounced(announced, routeRevision, maneuverIndex, 'arrive')) {
      return null;
    }
    return 'arrive';
  }
  if (maneuver.type === 'depart') {
    if (isStageAnnounced(announced, routeRevision, maneuverIndex, 'depart')) {
      return null;
    }
    return 'depart';
  }
  if (guidance.status !== 'active') return null;
  const distance = guidance.distanceToManeuverM;
  if (distance == null || !Number.isFinite(distance)) return null;
  const stage = pickVoiceWarningStage(distance);
  if (!stage) return null;
  if (isStageAnnounced(announced, routeRevision, maneuverIndex, stage)) {
    return null;
  }
  return stage;
}

/** Match on-screen maneuver distance rounding (10 m below 1 km). */
export function roundVoiceDistanceMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters < 0) return 0;
  if (meters < 1000) return Math.round(meters / 10) * 10;
  return Math.round(meters / 100) * 100;
}

export function buildVoiceAnnouncementText(
  guidance: ManeuverGuidance,
  stage: VoiceWarningStage,
  distanceToManeuverM?: number | null,
): string {
  const base = guidance.instruction.trim();
  let text = base;
  if (
    guidance.roadName &&
    !base.toLowerCase().includes(guidance.roadName.toLowerCase())
  ) {
    text = `${base} onto ${guidance.roadName}`;
  }
  if (stage === 'advance') {
    const meters =
      distanceToManeuverM != null && Number.isFinite(distanceToManeuverM)
        ? roundVoiceDistanceMeters(distanceToManeuverM)
        : VOICE_MANEUVER_ADVANCE_M;
    return `In about ${meters} meters, ${text}`;
  }
  return text;
}
