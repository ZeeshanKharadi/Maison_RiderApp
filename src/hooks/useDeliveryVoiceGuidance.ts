import { useEffect, useRef } from 'react';
import type {
  ManeuverGuidance,
  RouteManeuver,
} from '../routing/routeManeuvers';
import {
  buildVoiceAnnouncementText,
  markAnnouncedForStage,
  nextVoiceStageToAnnounce,
  shouldSpeakManeuver,
  suppressCrossedVoiceStages,
} from '../voice/voiceManeuverSpeech';
import {
  discardNavigationSpeech,
  releaseNavigationTts,
  speakNavigationTts,
} from '../voice/navigationDeviceTts';

type Args = {
  voiceEnabled: boolean;
  /** Focused, foreground, assigned job with route actions. */
  sessionActive: boolean;
  /** Reliable along-route progress (not paused / off-route / GPS stale). */
  guidanceLive: boolean;
  guidance: ManeuverGuidance | null;
  maneuvers: RouteManeuver[] | null;
  routeRevision: number;
};

/**
 * Foreground voice warnings for DeliveryMap — deduped by route revision,
 * maneuver index, and warning stage. Stops on lifecycle invalidation.
 */
export function useDeliveryVoiceGuidance({
  voiceEnabled,
  sessionActive,
  guidanceLive,
  guidance,
  maneuvers,
  routeRevision,
}: Args): void {
  const announcedRef = useRef(new Set<string>());
  const lastRouteRevisionRef = useRef(routeRevision);
  const lastManeuverIndexRef = useRef<number | null>(null);
  /** Last fully speakable gate state (voice + session + live + reliable guidance). */
  const wasFullySpeakableRef = useRef(false);
  /** After mute/pause/background, suppress on the first reliable resume snapshot. */
  const resumeSuppressPendingRef = useRef(false);
  /**
   * Genuinely new route only — first reliable snapshot may announce.
   * Not set on refocus/rerender.
   */
  const initialWarningRevisionRef = useRef<number | null>(null);

  const invalidateSpeech = () => {
    discardNavigationSpeech();
  };

  useEffect(() => {
    if (lastRouteRevisionRef.current !== routeRevision) {
      lastRouteRevisionRef.current = routeRevision;
      announcedRef.current.clear();
      lastManeuverIndexRef.current = null;
      resumeSuppressPendingRef.current = false;
      initialWarningRevisionRef.current = routeRevision;
      wasFullySpeakableRef.current = false;
      invalidateSpeech();
    }
  }, [routeRevision]);

  useEffect(() => {
    const fullySpeakable =
      voiceEnabled &&
      sessionActive &&
      guidanceLive &&
      !!guidance &&
      !!maneuvers?.length &&
      (guidance.status === 'active' || guidance.status === 'arrived');

    if (!fullySpeakable) {
      if (wasFullySpeakableRef.current) {
        resumeSuppressPendingRef.current = true;
      }
      wasFullySpeakableRef.current = false;
      invalidateSpeech();
      return;
    }

    const maneuver = maneuvers![guidance!.index];

    // First reliable snapshot after becoming speakable again.
    if (initialWarningRevisionRef.current === routeRevision) {
      // New route: allow the relevant initial warning once.
      initialWarningRevisionRef.current = null;
      resumeSuppressPendingRef.current = false;
    } else if (resumeSuppressPendingRef.current) {
      if (maneuver && shouldSpeakManeuver(maneuver)) {
        suppressCrossedVoiceStages(
          announcedRef.current,
          routeRevision,
          guidance!.index,
          maneuver,
          guidance!,
        );
      }
      resumeSuppressPendingRef.current = false;
    }
    wasFullySpeakableRef.current = true;

    if (!maneuver || !shouldSpeakManeuver(maneuver)) {
      if (lastManeuverIndexRef.current !== guidance!.index) {
        invalidateSpeech();
        lastManeuverIndexRef.current = guidance!.index;
      }
      return;
    }

    if (
      lastManeuverIndexRef.current != null &&
      lastManeuverIndexRef.current !== guidance!.index
    ) {
      invalidateSpeech();
    }
    lastManeuverIndexRef.current = guidance!.index;

    const stage = nextVoiceStageToAnnounce(
      announcedRef.current,
      routeRevision,
      guidance!.index,
      maneuver,
      guidance!,
    );
    if (!stage) return;

    const text = buildVoiceAnnouncementText(
      guidance!,
      stage,
      guidance!.distanceToManeuverM,
    );
    markAnnouncedForStage(
      announcedRef.current,
      routeRevision,
      guidance!.index,
      stage,
    );
    speakNavigationTts(text);
  }, [
    voiceEnabled,
    sessionActive,
    guidanceLive,
    guidance,
    maneuvers,
    routeRevision,
  ]);

  useEffect(() => {
    return () => {
      releaseNavigationTts();
    };
  }, []);
}
