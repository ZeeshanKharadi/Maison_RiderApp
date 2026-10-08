import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, AppButton } from '../components/ui';
import OsmMapView from '../components/delivery/OsmMapView';
import TurnInstructionBanner from '../components/delivery/TurnInstructionBanner';
import { useRiderSession } from '../context/RiderSessionContext';
import { mapDestinationKind, resolveMapTarget } from '../delivery/mapTargets';
import {
  isUsableStreetAddress,
  navigationInputForKind,
  openNavigationPlan,
  resolveNavigationPlan,
} from '../delivery/navigationDestination';
import type { ActiveDeliveryJob } from '../delivery/types';
import {
  useRiderLocation,
  type RiderLocationSample,
} from '../hooks/useRiderLocation';
import type { MainStackParamList } from '../navigation/MainNavigator';
import * as ordersRepository from '../repositories/ordersRepository';
import {
  MAX_GPS_ACCURACY_PROGRESS_M,
  MAX_GPS_ACCURACY_REROUTE_M,
  MAX_GPS_AGE_MS,
  RESUME_MAX_GPS_AGE_MS,
} from '../config/routeProgress';
import {
  hasValidRoutingBaseUrl,
  routingBaseValidation,
  ROUTING_BASE_URL,
} from '../config/routing';
import {
  DrivingRouteError,
  fetchDrivingRoute,
  type DrivingRouteResult,
} from '../routing/fetchDrivingRoute';
import {
  formatDestinationCardTitle,
  formatRouteDistanceMeters,
  formatRouteDurationCompact,
} from '../routing/formatRouteSummary';
import { areRouteActionsAllowed } from '../routing/routeActionGate';
import {
  canAttemptAutoReroute,
  createDeviationTracker,
  noteDeviationSample,
  resetDeviationTracker,
} from '../routing/routeDeviation';
import {
  buildRouteGeometryIndex,
  isReliableGpsFix,
  pausedProgress,
  projectOntoRoute,
  updateLiveRouteProgress,
  type GpsFix,
  type LiveRouteProgress,
} from '../routing/routeProgress';
import {
  buildManeuverGuidance,
  type ManeuverGuidance,
} from '../routing/routeManeuvers';
import { shouldPollActiveDelivery } from '../utils/activeDeliverySync';
import { colors, radius, spacing, typography } from '../theme';

type Route = RouteProp<MainStackParamList, 'DeliveryMap'>;

const POLL_MS = 20_000;

type AssignmentPhase =
  | 'loading'
  | 'assigned'
  | 'preview'
  | 'removed'
  | 'stale_network';

type CachedRoute = {
  jobId: string;
  destKey: string;
  route: DrivingRouteResult;
};

/**
 * Full-screen OSM map + Stage-3 visual turn instructions
 * (not voice / background navigation).
 */
export default function DeliveryMapScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const { orderId, preview } = route.params;
  const {
    activeJobs,
    restoreActiveDeliveries,
    lifecyclePending,
    lastLifecycleError,
  } = useRiderSession();

  const sessionJob = useMemo(
    () => activeJobs.find(j => j.id === orderId) ?? null,
    [activeJobs, orderId],
  );

  const lockedToSessionRef = useRef(false);
  const lastKnownJobRef = useRef<ActiveDeliveryJob | null>(null);
  const [lockedToSession, setLockedToSession] = useState(false);
  const [offerStillAvailable, setOfferStillAvailable] = useState<
    boolean | null
  >(null);
  const [offerValidationError, setOfferValidationError] = useState<
    string | null
  >(null);
  const [offerValidationNonce, setOfferValidationNonce] = useState(0);
  const [assignmentPhase, setAssignmentPhase] =
    useState<AssignmentPhase>('loading');

  const screenFocusedRef = useRef(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const offerValidationGenRef = useRef(0);
  const offerValidationOrderRef = useRef(orderId);
  /** Shared Available-list fetch so overlapping validations do not duplicate HTTP. */
  const offerFetchSharedRef = useRef<ReturnType<
    typeof ordersRepository.fetchAvailableOrders
  > | null>(null);
  offerValidationOrderRef.current = orderId;

  // Stage-2 progress / auto-reroute (declared early for focus/AppState cleanup).
  const needsFreshGpsRef = useRef(true);
  /** Wall time when screen last focused / returned to foreground. */
  const resumeAtMsRef = useRef(0);
  const deviationTrackerRef = useRef(createDeviationTracker());
  const rerouteInFlightRef = useRef(false);
  const lastAutoRerouteAtRef = useRef<number | null>(null);
  const alongMetersRef = useRef<number | null>(null);
  const lastReliableFixRef = useRef<GpsFix | null>(null);
  const gpsAgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoRerouting, setAutoRerouting] = useState(false);
  const [progressUnavailable, setProgressUnavailable] = useState(false);
  const [liveProgress, setLiveProgress] = useState<LiveRouteProgress>(() =>
    pausedProgress('waiting_gps'),
  );
  const maneuverIndexRef = useRef(0);
  const [maneuverGuidance, setManeuverGuidance] =
    useState<ManeuverGuidance | null>(null);

  const clearManeuverState = useCallback(() => {
    maneuverIndexRef.current = 0;
    setManeuverGuidance(null);
  }, []);

  const clearGpsAgeTimer = useCallback(() => {
    if (gpsAgeTimerRef.current != null) {
      clearTimeout(gpsAgeTimerRef.current);
      gpsAgeTimerRef.current = null;
    }
  }, []);

  /** Deduplicated one-shot GPS refresh (does not restart the watcher). */
  const refreshLocationRef = useRef<
    () => Promise<RiderLocationSample | null>
  >(() => Promise.resolve(null));
  const riderReceivedAtRef = useRef<number | null>(null);
  const gpsRefreshInFlightRef = useRef(false);
  /** Ownership token for the full manual Refresh (GPS await + routing). */
  const manualRefreshOwnerRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const invalidateManualRefresh = useCallback(() => {
    manualRefreshOwnerRef.current += 1;
    gpsRefreshInFlightRef.current = false;
  }, []);

  const markResumeGate = useCallback(() => {
    needsFreshGpsRef.current = true;
    resumeAtMsRef.current = Date.now();
    clearGpsAgeTimer();
    resetDeviationTracker(deviationTrackerRef.current);
  }, [clearGpsAgeTimer]);

  /**
   * Pause progress when the accepted GPS measurement ages out without a new
   * event, and immediately request a fresh sample so we do not stay stuck
   * until the user leaves the screen (common when stationary).
   */
  const scheduleGpsAgeTimer = useCallback(
    (fixTimestampMs: number) => {
      clearGpsAgeTimer();
      if (!Number.isFinite(fixTimestampMs) || fixTimestampMs <= 0) return;
      const remaining = MAX_GPS_AGE_MS - (Date.now() - fixTimestampMs);
      const onStale = () => {
        resetDeviationTracker(deviationTrackerRef.current);
        setLiveProgress(pausedProgress('unreliable', alongMetersRef.current));
        // Shared deduped one-shot — watcher stays up; joins in-flight if any.
        if (screenFocusedRef.current && AppState.currentState === 'active') {
          void refreshLocationRef.current();
        }
      };
      if (remaining <= 0) {
        onStale();
        return;
      }
      gpsAgeTimerRef.current = setTimeout(() => {
        gpsAgeTimerRef.current = null;
        if (!screenFocusedRef.current || AppState.currentState !== 'active') {
          return;
        }
        onStale();
      }, remaining);
    },
    [clearGpsAgeTimer],
  );

  useEffect(() => {
    if (sessionJob) {
      lockedToSessionRef.current = true;
      setLockedToSession(true);
      lastKnownJobRef.current = sessionJob;
      setAssignmentPhase('assigned');
      // Assigned recovery — drop offer preview validation entirely.
      offerValidationGenRef.current += 1;
      setOfferStillAvailable(null);
      setOfferValidationError(null);
    }
  }, [sessionJob]);

  // Order change invalidates any in-flight offer check.
  useEffect(() => {
    offerValidationGenRef.current += 1;
    setOfferStillAvailable(null);
    setOfferValidationError(null);
  }, [orderId]);

  const validateOffer = useCallback(async () => {
    if (lockedToSessionRef.current || !preview) return;

    const gen = ++offerValidationGenRef.current;
    const validatingOrderId = orderId;
    // Fresh validation starts unverified — block routing / external Maps.
    setOfferStillAvailable(null);
    setOfferValidationError(null);

    const shared =
      offerFetchSharedRef.current ??
      (offerFetchSharedRef.current = ordersRepository
        .fetchAvailableOrders()
        .finally(() => {
          offerFetchSharedRef.current = null;
        }));

    const result = await shared;

    const stillRelevant =
      gen === offerValidationGenRef.current &&
      screenFocusedRef.current &&
      !lockedToSessionRef.current &&
      offerValidationOrderRef.current === validatingOrderId;

    if (!stillRelevant) return;

    if (!result.ok) {
      setOfferStillAvailable(false);
      setOfferValidationError(
        result.error.message || 'Could not verify offer availability.',
      );
      return;
    }

    const stillThere = result.data.some(
      o =>
        o.id === validatingOrderId ||
        (preview.backendId != null && o.backendId === preview.backendId),
    );
    setOfferStillAvailable(stillThere);
    setOfferValidationError(null);
    if (!stillThere) {
      setAssignmentPhase('removed');
    }
  }, [preview, orderId]);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      setScreenFocused(true);
      markResumeGate();
      void restoreActiveDeliveries();
      if (!lockedToSessionRef.current && preview) {
        void validateOffer();
      }
      return () => {
        screenFocusedRef.current = false;
        setScreenFocused(false);
        clearGpsAgeTimer();
        if (heartbeatTimerRef.current != null) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        invalidateManualRefresh();
        clearManeuverState();
        // Invalidate offer validation + abort pending routing / progress.
        offerValidationGenRef.current += 1;
        setOfferStillAvailable(null);
        setOfferValidationError(null);
        routeSessionRef.current += 1;
        routeAbortRef.current?.abort();
        routeAbortRef.current = null;
        setRouteLoading(false);
        setAutoRerouting(false);
        rerouteInFlightRef.current = false;
        calculatedKeyRef.current = null;
        needsFreshGpsRef.current = true;
        resetDeviationTracker(deviationTrackerRef.current);
        setLiveProgress(pausedProgress('waiting_gps'));
      };
    }, [
      restoreActiveDeliveries,
      preview,
      validateOffer,
      markResumeGate,
      clearGpsAgeTimer,
      clearManeuverState,
      invalidateManualRefresh,
    ]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      setAppState(next);
      if (next !== 'active') {
        clearGpsAgeTimer();
        invalidateManualRefresh();
        needsFreshGpsRef.current = true;
        resetDeviationTracker(deviationTrackerRef.current);
        setRouteLoading(false);
        if (rerouteInFlightRef.current) {
          routeSessionRef.current += 1;
          routeAbortRef.current?.abort();
          routeAbortRef.current = null;
          rerouteInFlightRef.current = false;
          setAutoRerouting(false);
        }
        return;
      }
      if (screenFocusedRef.current) {
        markResumeGate();
        // Watch may still be running — deduped one-shot for resume gate.
        void refreshLocationRef.current();
        void restoreActiveDeliveries();
        if (!lockedToSessionRef.current && preview) {
          void validateOffer();
        }
      }
    });
    return () => {
      clearGpsAgeTimer();
      sub.remove();
    };
  }, [
    restoreActiveDeliveries,
    preview,
    validateOffer,
    markResumeGate,
    clearGpsAgeTimer,
    invalidateManualRefresh,
  ]);

  useEffect(() => {
    const tick = () => {
      if (
        !shouldPollActiveDelivery({
          screenFocused: screenFocusedRef.current,
          appState: AppState.currentState,
          hasActiveJob:
            !!sessionJob ||
            !!lastKnownJobRef.current ||
            assignmentPhase === 'loading' ||
            assignmentPhase === 'preview',
        })
      ) {
        return;
      }
      void restoreActiveDeliveries();
    };

    if (
      !shouldPollActiveDelivery({
        screenFocused,
        appState,
        hasActiveJob:
          !!sessionJob ||
          !!lastKnownJobRef.current ||
          assignmentPhase === 'loading' ||
          assignmentPhase === 'preview',
      })
    ) {
      return undefined;
    }

    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [
    screenFocused,
    appState,
    sessionJob,
    assignmentPhase,
    restoreActiveDeliveries,
  ]);

  useEffect(() => {
    if (lifecyclePending) {
      if (!sessionJob && !lastKnownJobRef.current && !preview) {
        setAssignmentPhase('loading');
      }
      return;
    }

    if (sessionJob) {
      setAssignmentPhase('assigned');
      return;
    }

    if (lastLifecycleError) {
      if (lastKnownJobRef.current || lockedToSessionRef.current) {
        setAssignmentPhase('stale_network');
      } else if (!preview) {
        setAssignmentPhase('loading');
      }
      return;
    }

    if (lockedToSessionRef.current || lastKnownJobRef.current) {
      lastKnownJobRef.current = null;
      setAssignmentPhase('removed');
      return;
    }

    if (preview) {
      setAssignmentPhase('preview');
      return;
    }

    setAssignmentPhase('removed');
  }, [lifecyclePending, sessionJob, lastLifecycleError, preview]);

  // Re-run offer validation when Retry bumps nonce (focus already validates).
  useEffect(() => {
    if (offerValidationNonce === 0) return;
    if (lockedToSession || assignmentPhase !== 'preview' || !preview) return;
    void validateOffer();
  }, [
    offerValidationNonce,
    lockedToSession,
    assignmentPhase,
    preview,
    validateOffer,
  ]);

  const previewJob: ActiveDeliveryJob | null = useMemo(() => {
    if (lockedToSession || assignmentPhase !== 'preview' || !preview) {
      return null;
    }
    // Show map pins while verifying; routing gated separately.
    return {
      id: orderId,
      backendId: preview.backendId ?? 0,
      restaurant: preview.restaurant || 'Store',
      customerName: preview.customerName || 'Customer',
      customerPhone: preview.customerPhone || '',
      pickupAddress: preview.pickupAddress || '',
      dropoffAddress: preview.dropoffAddress || '',
      storeLat: preview.storeLat,
      storeLng: preview.storeLng,
      customerLat: preview.customerLat,
      customerLng: preview.customerLng,
      distanceMiles: null,
      etaMinutes: null,
      orderAmount: 0,
      deliveryFee: 0,
      tip: 0,
      paymentMethod: 'cash',
      isCod: false,
      packageInfo: '',
      items: 0,
      imageColor: colors.primary,
      fragile: false,
      express: false,
      state: preview.stateHint === 'customer' ? 'ON_THE_WAY' : 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
      stateTimestamps: {},
      cashCollected: null,
    };
  }, [lockedToSession, assignmentPhase, preview, orderId]);

  const job: ActiveDeliveryJob | null =
    sessionJob ??
    (assignmentPhase === 'stale_network' ? lastKnownJobRef.current : null) ??
    previewJob;

  const confirmedUnassigned = assignmentPhase === 'removed';
  const offerVerifiedForRouting =
    assignmentPhase !== 'preview' || offerStillAvailable === true;
  const actionsOk =
    areRouteActionsAllowed(job, confirmedUnassigned) &&
    offerVerifiedForRouting;

  const locationEnabled =
    screenFocused && appState === 'active' && !!job && !confirmedUnassigned;
  const {
    location: riderLocation,
    accuracy: riderAccuracy,
    timestamp: riderTimestamp,
    receivedAt: riderReceivedAt,
    error: locationError,
    refresh: refreshLocation,
  } = useRiderLocation(locationEnabled);
  refreshLocationRef.current = refreshLocation;
  riderReceivedAtRef.current = riderReceivedAt;

  const target = useMemo(
    () => (job ? resolveMapTarget(job, riderLocation) : null),
    [job, riderLocation],
  );

  const destKind = job ? mapDestinationKind(job.state) : 'store';
  const destCoord = target?.coordinate ?? null;
  const destRouteKey = destCoord
    ? `${destCoord.latitude.toFixed(5)},${destCoord.longitude.toFixed(5)}`
    : null;

  const [roadRoute, setRoadRoute] = useState<DrivingRouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeRefreshNonce, setRouteRefreshNonce] = useState(0);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const routeSessionRef = useRef(0);
  const routeAbortRef = useRef<AbortController | null>(null);
  const calculatedKeyRef = useRef<string | null>(null);
  const cachedRouteRef = useRef<CachedRoute | null>(null);
  const activeDestKeyRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const roadRouteRef = useRef<DrivingRouteResult | null>(null);
  roadRouteRef.current = roadRoute;
  const riderForRouteRef = useRef(riderLocation);
  if (riderLocation) {
    riderForRouteRef.current = riderLocation;
  }

  const resetProgressState = useCallback(
    (
      status: Exclude<LiveRouteProgress['status'], 'ok'> = 'waiting_gps',
    ) => {
      clearGpsAgeTimer();
      alongMetersRef.current = null;
      lastReliableFixRef.current = null;
      resetDeviationTracker(deviationTrackerRef.current);
      clearManeuverState();
      setProgressUnavailable(false);
      setLiveProgress(pausedProgress(status));
    },
    [clearGpsAgeTimer, clearManeuverState],
  );

  useEffect(() => {
    if (riderLocation) setHasGpsFix(true);
  }, [riderLocation]);

  const clearRouteVisual = useCallback(() => {
    setRoadRoute(null);
    setRouteError(null);
    clearManeuverState();
  }, [clearManeuverState]);

  // Destination / job change or ineligibility: clear previous route + progress.
  useEffect(() => {
    const prevDest = activeDestKeyRef.current;
    const prevJob = activeJobIdRef.current;
    activeDestKeyRef.current = destRouteKey;
    activeJobIdRef.current = job?.id ?? null;

    const jobChanged = prevJob != null && job?.id != null && prevJob !== job.id;
    const destChanged =
      prevDest != null && destRouteKey != null && prevDest !== destRouteKey;

    if (!actionsOk || !job || !destRouteKey) {
      invalidateManualRefresh();
      routeSessionRef.current += 1;
      routeAbortRef.current?.abort();
      routeAbortRef.current = null;
      calculatedKeyRef.current = null;
      cachedRouteRef.current = null;
      clearRouteVisual();
      setRouteLoading(false);
      setAutoRerouting(false);
      rerouteInFlightRef.current = false;
      resetProgressState('unavailable');
      return;
    }

    if (jobChanged || destChanged) {
      invalidateManualRefresh();
      routeSessionRef.current += 1;
      routeAbortRef.current?.abort();
      routeAbortRef.current = null;
      calculatedKeyRef.current = null;
      cachedRouteRef.current = null;
      clearRouteVisual();
      setRouteLoading(false);
      setAutoRerouting(false);
      rerouteInFlightRef.current = false;
      needsFreshGpsRef.current = true;
      resetProgressState('waiting_gps');
    }
  }, [
    actionsOk,
    job?.id,
    destRouteKey,
    clearRouteVisual,
    resetProgressState,
    invalidateManualRefresh,
  ]);

  useEffect(() => {
    if (confirmedUnassigned) {
      invalidateManualRefresh();
      routeSessionRef.current += 1;
      routeAbortRef.current?.abort();
      routeAbortRef.current = null;
      calculatedKeyRef.current = null;
      cachedRouteRef.current = null;
      clearRouteVisual();
      setRouteLoading(false);
      setAutoRerouting(false);
      rerouteInFlightRef.current = false;
      resetProgressState('unavailable');
    }
  }, [
    confirmedUnassigned,
    clearRouteVisual,
    resetProgressState,
    invalidateManualRefresh,
  ]);

  // Calculate / restore route (independent of ordinary GPS ticks & camera).
  useEffect(() => {
    if (!screenFocused || !actionsOk || !job || !destRouteKey || !destCoord) {
      return;
    }

    if (!hasValidRoutingBaseUrl) {
      clearRouteVisual();
      setRouteError(
        routingBaseValidation.ok
          ? 'Routing endpoint is not configured.'
          : routingBaseValidation.message,
      );
      return;
    }

    const origin = riderForRouteRef.current;
    if (!origin || !hasGpsFix) {
      return;
    }

    const cache = cachedRouteRef.current;
    if (
      cache &&
      cache.jobId === job.id &&
      cache.destKey === destRouteKey &&
      routeRefreshNonce === 0
    ) {
      setRoadRoute(cache.route);
      setRouteError(null);
      setRouteLoading(false);
      calculatedKeyRef.current = `${job.id}|${destRouteKey}|0`;
      return;
    }

    // After Refresh, nonce > 0 — allow refetch. Also allow when cache missing.
    const calcKey = `${job.id}|${destRouteKey}|${routeRefreshNonce}`;
    if (calculatedKeyRef.current === calcKey && roadRoute) {
      return;
    }

    // Reuse in-memory route for same key after blur without refetch.
    if (
      calculatedKeyRef.current === calcKey &&
      !roadRoute &&
      cache?.jobId === job.id &&
      cache.destKey === destRouteKey
    ) {
      setRoadRoute(cache.route);
      return;
    }

    calculatedKeyRef.current = calcKey;
    const session = ++routeSessionRef.current;
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    // Destination change: clear previous geometry. Manual refresh keeps the
    // existing polyline until the new route arrives (avoids empty map on fail).
    if (!roadRoute || activeDestKeyRef.current !== destRouteKey) {
      clearRouteVisual();
    }

    setRouteLoading(true);
    setRouteError(null);

    void (async () => {
      try {
        const result = await fetchDrivingRoute(origin, destCoord, {
          signal: controller.signal,
          baseUrl: ROUTING_BASE_URL,
        });
        if (session !== routeSessionRef.current) return;
        if (!screenFocusedRef.current) {
          // Keep cache for refocus; do not paint while blurred.
          cachedRouteRef.current = {
            jobId: job.id,
            destKey: destRouteKey,
            route: result,
          };
          return;
        }
        if (activeDestKeyRef.current !== destRouteKey) return;
        cachedRouteRef.current = {
          jobId: job.id,
          destKey: destRouteKey,
          route: result,
        };
        setRoadRoute(result);
        setRouteError(null);
        alongMetersRef.current = null;
        maneuverIndexRef.current = 0;
        resetDeviationTracker(deviationTrackerRef.current);
        setProgressUnavailable(false);
        setLiveProgress(pausedProgress('waiting_gps'));
      } catch (err) {
        if (session !== routeSessionRef.current) return;
        if (err instanceof DrivingRouteError && err.code === 'ABORTED') {
          if (calculatedKeyRef.current === calcKey) {
            calculatedKeyRef.current = null;
          }
          return;
        }
        // Keep same-job/same-destination geometry if we already have it.
        const keepExisting =
          roadRouteRef.current != null &&
          cachedRouteRef.current?.jobId === job.id &&
          cachedRouteRef.current?.destKey === destRouteKey;
        if (keepExisting) {
          setRouteError('Route refresh failed — tap Refresh to retry');
          setLiveProgress(
            pausedProgress('unreliable', alongMetersRef.current),
          );
        } else {
          cachedRouteRef.current = null;
          setRoadRoute(null);
          clearManeuverState();
          setRouteError(
            err instanceof Error ? err.message : 'Route unavailable',
          );
          setProgressUnavailable(true);
          setLiveProgress(pausedProgress('unavailable'));
        }
      } finally {
        if (session === routeSessionRef.current) {
          setRouteLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // Intentionally omit riderLocation / roadRoute from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    screenFocused,
    actionsOk,
    job?.id,
    destRouteKey,
    routeRefreshNonce,
    hasGpsFix,
    clearRouteVisual,
  ]);

  const autoRerouteEligible =
    actionsOk &&
    (assignmentPhase === 'assigned' || assignmentPhase === 'stale_network') &&
    screenFocused &&
    appState === 'active' &&
    !!job &&
    !!destCoord &&
    !!destRouteKey;

  const runAutoReroute = useCallback(async () => {
    if (!autoRerouteEligible || !job || !destCoord || !destRouteKey) return;
    // Do not auto-reroute until a post-resume reliable fix has been accepted.
    if (needsFreshGpsRef.current) return;
    const now = Date.now();
    if (
      !canAttemptAutoReroute(
        lastAutoRerouteAtRef.current,
        now,
        rerouteInFlightRef.current,
      )
    ) {
      return;
    }

    const origin = riderForRouteRef.current;
    if (!origin) return;
    if (!hasValidRoutingBaseUrl) return;

    // Recheck eligibility + destination immediately before starting.
    if (
      !areRouteActionsAllowed(job, confirmedUnassigned) ||
      activeDestKeyRef.current !== destRouteKey ||
      !screenFocusedRef.current ||
      AppState.currentState !== 'active' ||
      needsFreshGpsRef.current
    ) {
      return;
    }

    lastAutoRerouteAtRef.current = now;
    rerouteInFlightRef.current = true;
    setAutoRerouting(true);
    setRouteLoading(true);
    setRouteError(null);

    const session = ++routeSessionRef.current;
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    const startDestKey = destRouteKey;
    const startJobId = job.id;

    try {
      const result = await fetchDrivingRoute(origin, destCoord, {
        signal: controller.signal,
        baseUrl: ROUTING_BASE_URL,
      });
      if (session !== routeSessionRef.current) return;
      // Recheck before applying.
      if (
        !screenFocusedRef.current ||
        AppState.currentState !== 'active' ||
        activeDestKeyRef.current !== startDestKey ||
        activeJobIdRef.current !== startJobId ||
        !areRouteActionsAllowed(job, confirmedUnassigned)
      ) {
        return;
      }
      cachedRouteRef.current = {
        jobId: startJobId,
        destKey: startDestKey,
        route: result,
      };
      calculatedKeyRef.current = `${startJobId}|${startDestKey}|${routeRefreshNonce}`;
      setRoadRoute(result);
      setRouteError(null);
      alongMetersRef.current = null;
      maneuverIndexRef.current = 0;
      resetDeviationTracker(deviationTrackerRef.current);
      setProgressUnavailable(false);
      setLiveProgress(pausedProgress('waiting_gps'));
    } catch (err) {
      if (session !== routeSessionRef.current) return;
      if (err instanceof DrivingRouteError && err.code === 'ABORTED') {
        return;
      }
      // Keep same-destination route; mark progress unavailable. No retry loop.
      setProgressUnavailable(true);
      setLiveProgress(pausedProgress('unavailable'));
      resetDeviationTracker(deviationTrackerRef.current);
    } finally {
      // Obsolete request must not clear a newer request's in-flight/loading flags.
      if (session === routeSessionRef.current) {
        rerouteInFlightRef.current = false;
        setAutoRerouting(false);
        setRouteLoading(false);
      }
    }
  }, [
    autoRerouteEligible,
    job,
    destCoord,
    destRouteKey,
    confirmedUnassigned,
    routeRefreshNonce,
  ]);

  // Heartbeat: shared deduped one-shot only while location is enabled/focused.
  // Skips while a refresh is already in flight so slow GPS is not interrupted.
  useEffect(() => {
    if (heartbeatTimerRef.current != null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (
      !locationEnabled ||
      !screenFocused ||
      appState !== 'active' ||
      !roadRoute ||
      confirmedUnassigned
    ) {
      return undefined;
    }
    const HEARTBEAT_MS = 12_000;
    heartbeatTimerRef.current = setInterval(() => {
      if (!screenFocusedRef.current || AppState.currentState !== 'active') {
        return;
      }
      if (gpsRefreshInFlightRef.current) return;
      const last = riderReceivedAtRef.current;
      if (last == null || Date.now() - last >= HEARTBEAT_MS) {
        void refreshLocationRef.current();
      }
    }, HEARTBEAT_MS);
    return () => {
      if (heartbeatTimerRef.current != null) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [
    locationEnabled,
    screenFocused,
    appState,
    roadRoute,
    confirmedUnassigned,
  ]);

  // Live progress from GPS + route geometry (no per-tick route requests).
  // Offer previews keep a static last-route estimate only (no live progress / auto-reroute).
  useEffect(() => {
    if (
      !screenFocused ||
      appState !== 'active' ||
      !actionsOk ||
      !roadRoute ||
      confirmedUnassigned
    ) {
      clearGpsAgeTimer();
      return;
    }

    if (assignmentPhase === 'preview') {
      clearGpsAgeTimer();
      setLiveProgress(pausedProgress('unavailable'));
      return;
    }

    if (progressUnavailable) {
      clearGpsAgeTimer();
      setLiveProgress(pausedProgress('unavailable', alongMetersRef.current));
      return;
    }

    if (!riderLocation || riderTimestamp == null) {
      clearGpsAgeTimer();
      resetDeviationTracker(deviationTrackerRef.current);
      setLiveProgress(pausedProgress('waiting_gps', alongMetersRef.current));
      return;
    }

    const fix: GpsFix = {
      latitude: riderLocation.latitude,
      longitude: riderLocation.longitude,
      accuracy: riderAccuracy,
      timestamp: riderTimestamp,
    };

    if (needsFreshGpsRef.current) {
      // New callback after resume (receivedAt) + freshly measured GPS timestamp
      // (not a newly delivered cached fix). Pin may still show older coords.
      const receivedAfterResume =
        riderReceivedAt != null &&
        riderReceivedAt >= resumeAtMsRef.current;
      const measuredFresh = isReliableGpsFix(fix, null, Date.now(), {
        maxAccuracyM: MAX_GPS_ACCURACY_PROGRESS_M,
        maxAgeMs: RESUME_MAX_GPS_AGE_MS,
      });
      if (!measuredFresh || !receivedAfterResume) {
        clearGpsAgeTimer();
        resetDeviationTracker(deviationTrackerRef.current);
        setLiveProgress(pausedProgress('waiting_gps', alongMetersRef.current));
        return;
      }
      needsFreshGpsRef.current = false;
      lastReliableFixRef.current = fix;
    } else if (
      !isReliableGpsFix(fix, lastReliableFixRef.current, Date.now(), {
        maxAccuracyM: MAX_GPS_ACCURACY_PROGRESS_M,
        maxAgeMs: MAX_GPS_AGE_MS,
      })
    ) {
      clearGpsAgeTimer();
      resetDeviationTracker(deviationTrackerRef.current);
      setLiveProgress(pausedProgress('unreliable', alongMetersRef.current));
      return;
    } else {
      lastReliableFixRef.current = fix;
    }

    const geometry = buildRouteGeometryIndex(roadRoute.coordinates);
    if (!geometry) {
      clearGpsAgeTimer();
      setLiveProgress(pausedProgress('unavailable', alongMetersRef.current));
      return;
    }

    const projection = projectOntoRoute(
      fix,
      geometry,
      alongMetersRef.current,
    );
    if (!projection) {
      clearGpsAgeTimer();
      resetDeviationTracker(deviationTrackerRef.current);
      setLiveProgress(pausedProgress('unreliable', alongMetersRef.current));
      return;
    }

    const next = updateLiveRouteProgress({
      projection,
      previousAlongMeters: alongMetersRef.current,
      routeDistanceMeters: roadRoute.distanceMeters,
      routeDurationSeconds: roadRoute.durationSeconds,
    });

    if (next.status === 'ok' && next.alongMeters != null) {
      alongMetersRef.current = next.alongMeters;
    }
    setLiveProgress(next);
    scheduleGpsAgeTimer(fix.timestamp);

    // Controlled auto-reroute: tighter accuracy than progress display.
    // Distinct strictly increasing GPS timestamps only (noteDeviationSample).
    if (
      autoRerouteEligible &&
      !needsFreshGpsRef.current &&
      !rerouteInFlightRef.current &&
      !autoRerouting
    ) {
      const rerouteFixOk = isReliableGpsFix(fix, null, Date.now(), {
        maxAccuracyM: MAX_GPS_ACCURACY_REROUTE_M,
        maxAgeMs: MAX_GPS_AGE_MS,
      });
      if (!rerouteFixOk) {
        resetDeviationTracker(deviationTrackerRef.current);
      } else {
        const sustained = noteDeviationSample(
          deviationTrackerRef.current,
          projection.crossTrackMeters,
          fix.timestamp,
        );
        if (sustained) {
          resetDeviationTracker(deviationTrackerRef.current);
          void runAutoReroute();
        }
      }
    }
  }, [
    screenFocused,
    appState,
    actionsOk,
    roadRoute,
    confirmedUnassigned,
    assignmentPhase,
    progressUnavailable,
    riderLocation,
    riderAccuracy,
    riderTimestamp,
    riderReceivedAt,
    autoRerouteEligible,
    autoRerouting,
    runAutoReroute,
    clearGpsAgeTimer,
    scheduleGpsAgeTimer,
  ]);

  // Stage-3 turn guidance from along-route progress (assigned only).
  useEffect(() => {
    const instructionsEligible =
      actionsOk &&
      !confirmedUnassigned &&
      (assignmentPhase === 'assigned' || assignmentPhase === 'stale_network') &&
      screenFocused &&
      appState === 'active' &&
      !!roadRoute;

    if (!instructionsEligible) {
      setManeuverGuidance(null);
      return;
    }

    const paused =
      autoRerouting ||
      routeLoading ||
      progressUnavailable ||
      liveProgress.status !== 'ok';

    const pauseMessage = autoRerouting
      ? 'Updating route…'
      : liveProgress.status === 'off_route'
        ? 'Off route — instructions paused'
        : liveProgress.status === 'waiting_gps' ||
            liveProgress.status === 'unreliable'
          ? 'Waiting for accurate GPS'
          : progressUnavailable
            ? 'Progress unavailable'
            : 'Instructions paused';

    const { guidance, index } = buildManeuverGuidance({
      maneuvers: roadRoute.maneuvers,
      alongMeters: liveProgress.alongMeters,
      currentIndex: maneuverIndexRef.current,
      paused,
      pauseMessage,
    });
    maneuverIndexRef.current = index;
    setManeuverGuidance(guidance);
  }, [
    actionsOk,
    confirmedUnassigned,
    assignmentPhase,
    screenFocused,
    appState,
    roadRoute,
    autoRerouting,
    routeLoading,
    progressUnavailable,
    liveProgress,
  ]);

  const refreshRoute = useCallback(async () => {
    if (!areRouteActionsAllowed(job, confirmedUnassigned)) return;
    if (assignmentPhase === 'preview' && offerStillAvailable !== true) {
      setOfferValidationNonce(n => n + 1);
      return;
    }
    if (!destCoord || !destRouteKey || !job) return;
    if (!hasValidRoutingBaseUrl) {
      setRouteError(
        routingBaseValidation.ok
          ? 'Routing endpoint is not configured.'
          : routingBaseValidation.message,
      );
      return;
    }
    // Ignore duplicate Refresh while the current owner is still active.
    if (gpsRefreshInFlightRef.current) return;

    const owner = ++manualRefreshOwnerRef.current;
    const stillOwner = () => owner === manualRefreshOwnerRef.current;

    clearGpsAgeTimer();
    gpsRefreshInFlightRef.current = true;
    setRouteLoading(true);
    setRouteError(null);
    // Pause guidance during refresh; keep polyline + cache until replaced.
    setLiveProgress(pausedProgress('waiting_gps', alongMetersRef.current));

    const startDestKey = destRouteKey;
    const startJobId = job.id;

    try {
      const sample = await refreshLocation();

      if (!stillOwner()) return;

      // Recheck after awaiting GPS.
      if (
        !screenFocusedRef.current ||
        AppState.currentState !== 'active' ||
        activeDestKeyRef.current !== startDestKey ||
        activeJobIdRef.current !== startJobId ||
        !areRouteActionsAllowed(job, confirmedUnassigned)
      ) {
        return;
      }

      const originOk =
        sample != null &&
        isReliableGpsFix(
          {
            latitude: sample.latitude,
            longitude: sample.longitude,
            accuracy: sample.accuracy,
            timestamp: sample.timestamp,
          },
          null,
          Date.now(),
          {
            maxAccuracyM: MAX_GPS_ACCURACY_PROGRESS_M,
            maxAgeMs: MAX_GPS_AGE_MS,
          },
        );

      if (!originOk || !sample) {
        if (!stillOwner()) return;
        setRouteError('GPS unavailable — tap Refresh to retry');
        setLiveProgress(pausedProgress('unreliable', alongMetersRef.current));
        return;
      }

      if (!stillOwner()) return;

      const origin = {
        latitude: sample.latitude,
        longitude: sample.longitude,
      };
      riderForRouteRef.current = origin;

      const session = ++routeSessionRef.current;
      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;

      try {
        const result = await fetchDrivingRoute(origin, destCoord, {
          signal: controller.signal,
          baseUrl: ROUTING_BASE_URL,
        });
        if (!stillOwner()) return;
        if (session !== routeSessionRef.current) return;
        if (
          !screenFocusedRef.current ||
          AppState.currentState !== 'active' ||
          activeDestKeyRef.current !== startDestKey ||
          activeJobIdRef.current !== startJobId ||
          !areRouteActionsAllowed(job, confirmedUnassigned)
        ) {
          return;
        }
        cachedRouteRef.current = {
          jobId: startJobId,
          destKey: startDestKey,
          route: result,
        };
        calculatedKeyRef.current = `${startJobId}|${startDestKey}|0`;
        setRoadRoute(result);
        setRouteError(null);
        alongMetersRef.current = null;
        maneuverIndexRef.current = 0;
        resetDeviationTracker(deviationTrackerRef.current);
        setProgressUnavailable(false);
        setLiveProgress(pausedProgress('waiting_gps'));
      } catch (err) {
        if (!stillOwner()) return;
        if (session !== routeSessionRef.current) return;
        if (err instanceof DrivingRouteError && err.code === 'ABORTED') {
          return;
        }
        // Preserve same-destination route + cache; do not blank the map.
        setRouteError('Route refresh failed — tap Refresh to retry');
        setLiveProgress(pausedProgress('unreliable', alongMetersRef.current));
      }
    } finally {
      // Obsolete Refresh must not clear a newer operation's flags.
      if (stillOwner()) {
        gpsRefreshInFlightRef.current = false;
        setRouteLoading(false);
      }
    }
  }, [
    job,
    confirmedUnassigned,
    assignmentPhase,
    offerStillAvailable,
    destCoord,
    destRouteKey,
    refreshLocation,
    clearGpsAgeTimer,
  ]);

  const openGoogleMaps = useCallback(async () => {
    if (!areRouteActionsAllowed(job, confirmedUnassigned) || !job || !target) {
      return;
    }
    if (assignmentPhase === 'preview' && offerStillAvailable !== true) {
      return;
    }
    const plan = resolveNavigationPlan(
      navigationInputForKind(job, target.kind),
      riderLocation,
    );
    await openNavigationPlan(plan, {
      canOpenURL: url => Linking.canOpenURL(url),
      openURL: url => Linking.openURL(url),
      alert: (title, message, buttons) => Alert.alert(title, message, buttons),
      platformOS: Platform.OS,
    });
  }, [
    job,
    target,
    riderLocation,
    confirmedUnassigned,
    assignmentPhase,
    offerStillAvailable,
  ]);

  const externalUsable =
    !!job &&
    actionsOk &&
    (!!destCoord ||
      isUsableStreetAddress(
        destKind === 'store' ? job.pickupAddress : job.dropoffAddress,
      ));

  const cardTitle = formatDestinationCardTitle(destKind, target?.label);
  const turnBannerVisible = !!maneuverGuidance;
  const fitPadding = {
    // Extra top padding when the turn banner is shown so endpoints stay visible.
    top: turnBannerVisible ? 88 : 16,
    right: 56,
    bottom: 120 + insets.bottom,
    left: 16,
  };

  if (assignmentPhase === 'loading' && !job) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Delivery map"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Loading assignment…</Text>
        </View>
      </View>
    );
  }

  if (confirmedUnassigned || !job) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Delivery map"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Order not active</Text>
          <Text style={styles.emptyBody}>
            This delivery is no longer assigned. Cancellation alerts stay on
            Active Delivery when the server reports them.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={job.id}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.mapArea}>
        <OsmMapView
          variant="fullscreen"
          riderLocation={riderLocation}
          destination={destCoord}
          destinationLabel={target?.label}
          destinationKind={destKind}
          roadRouteCoordinates={roadRoute?.coordinates ?? null}
          showStraightLineFallback={false}
          fitPadding={fitPadding}
        />

        {maneuverGuidance ? (
          <View style={styles.turnBannerWrap} pointerEvents="box-none">
            <TurnInstructionBanner guidance={maneuverGuidance} />
          </View>
        ) : null}

        <View style={styles.routeCard} pointerEvents="box-none">
          <Text style={styles.cardTitle} numberOfLines={1}>
            {cardTitle}
          </Text>
          {!destCoord ? (
            <Text style={styles.cardWarn}>Destination location unavailable</Text>
          ) : autoRerouting || (routeLoading && roadRoute) ? (
            <View style={styles.cardRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.cardHint}>Updating route…</Text>
            </View>
          ) : routeLoading && !roadRoute ? (
            <View style={styles.cardRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.cardHint}>Calculating route…</Text>
            </View>
          ) : roadRoute &&
            liveProgress.status === 'ok' &&
            liveProgress.remainingMeters != null ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(liveProgress.remainingMeters)}
                {' remaining'}
              </Text>
              <Text style={styles.cardHint}>
                Approximate time{' '}
                {liveProgress.approximateRemainingSeconds != null
                  ? formatRouteDurationCompact(
                      liveProgress.approximateRemainingSeconds,
                    )
                  : '—'}
              </Text>
            </>
          ) : roadRoute && liveProgress.status === 'off_route' ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(roadRoute.distanceMeters)}
                {' · '}
                {formatRouteDurationCompact(roadRoute.durationSeconds)}
              </Text>
              <Text style={styles.cardWarn}>Off route — progress paused</Text>
            </>
          ) : roadRoute && routeError ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(roadRoute.distanceMeters)}
                {' · '}
                {formatRouteDurationCompact(roadRoute.durationSeconds)}
              </Text>
              <Text style={styles.cardWarn} numberOfLines={2}>
                {routeError}
              </Text>
            </>
          ) : roadRoute &&
            assignmentPhase !== 'preview' &&
            (liveProgress.status === 'unreliable' ||
              liveProgress.status === 'waiting_gps') ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(roadRoute.distanceMeters)}
                {' · '}
                {formatRouteDurationCompact(roadRoute.durationSeconds)}
              </Text>
              <Text style={styles.cardHint}>Waiting for accurate GPS</Text>
            </>
          ) : roadRoute &&
            assignmentPhase !== 'preview' &&
            (progressUnavailable || liveProgress.status === 'unavailable') ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(roadRoute.distanceMeters)}
                {' · '}
                {formatRouteDurationCompact(roadRoute.durationSeconds)}
              </Text>
              <Text style={styles.cardWarn}>
                Progress unavailable · Refresh or open Maps
              </Text>
            </>
          ) : roadRoute ? (
            <>
              <Text style={styles.cardStats}>
                {formatRouteDistanceMeters(roadRoute.distanceMeters)}
                {' · '}
                {formatRouteDurationCompact(roadRoute.durationSeconds)}
              </Text>
              <Text style={styles.cardHint}>
                {assignmentPhase === 'preview'
                  ? 'Preview estimate · not live'
                  : 'Estimate from last refresh'}
              </Text>
            </>
          ) : routeError ? (
            <Text style={styles.cardWarn} numberOfLines={2}>
              Route unavailable
            </Text>
          ) : !riderLocation ? (
            <Text style={styles.cardHint}>Waiting for accurate GPS</Text>
          ) : (
            <Text style={styles.cardHint}>Tap Refresh Route</Text>
          )}
          {assignmentPhase === 'preview' && offerStillAvailable === null ? (
            <Text style={styles.cardHint}>Verifying offer…</Text>
          ) : null}
          {assignmentPhase === 'preview' && offerValidationError ? (
            <Pressable
              onPress={() => setOfferValidationNonce(n => n + 1)}
              hitSlop={8}>
              <Text style={styles.cardWarn}>
                {offerValidationError} · Tap to retry
              </Text>
            </Pressable>
          ) : null}
          {assignmentPhase === 'stale_network' ? (
            <Text style={styles.cardWarn}>Last-known assignment</Text>
          ) : null}
          {locationError && !riderLocation ? (
            <Text style={styles.cardWarn}>{locationError}</Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.actions,
          { paddingBottom: Math.max(spacing.sm, insets.bottom) },
        ]}>
        {locationError && !riderLocation ? (
          <AppButton
            label="Retry GPS"
            icon="crosshairs-gps"
            variant="outline"
            size="sm"
            fullWidth
            onPress={refreshLocation}
          />
        ) : null}
        <AppButton
          label={
            autoRerouting
              ? 'Updating…'
              : routeLoading
                ? 'Refreshing…'
                : 'Refresh Route'
          }
          icon="refresh"
          variant="primary"
          fullWidth
          onPress={refreshRoute}
          disabled={!actionsOk || routeLoading || autoRerouting}
          loading={routeLoading || autoRerouting}
        />
        <AppButton
          label="Open Google Maps"
          icon="google-maps"
          variant="outline"
          fullWidth
          onPress={() => void openGoogleMaps()}
          disabled={!externalUsable}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  mapArea: {
    flex: 1,
  },
  turnBannerWrap: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: 60,
    zIndex: 2,
  },
  routeCard: {
    position: 'absolute',
    left: spacing.sm,
    right: 60,
    bottom: spacing.sm + 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 3,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  cardStats: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardWarn: {
    ...typography.caption,
    color: colors.warning,
    marginTop: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  actions: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
