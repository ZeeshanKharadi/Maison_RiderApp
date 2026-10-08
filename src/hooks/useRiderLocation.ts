import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { LatLng } from '../utils/geo';

export type RiderLocationSample = LatLng & {
  accuracy: number | null;
  timestamp: number;
  receivedAt: number;
};

type RiderLocationState = {
  location: LatLng | null;
  /** Horizontal accuracy in meters when the platform reports it. */
  accuracy: number | null;
  /** Fix timestamp (ms since epoch) from the last GPS sample. */
  timestamp: number | null;
  /** Wall time when the app received this sample (for resume freshness). */
  receivedAt: number | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  /**
   * One-shot getCurrentPosition without restarting the watcher.
   * Concurrent callers share one in-flight request. Returns null if disabled
   * or generation invalidated (blur / logout).
   */
  refresh: () => Promise<RiderLocationSample | null>;
};

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  // 0 so a stationary rider still gets interval updates (progress age timer).
  distanceFilter: 0,
  interval: 5000,
  fastestInterval: 3000,
  showsBackgroundLocationIndicator: false,
  forceRequestLocation: true,
};

const PRIME_OPTIONS_HIGH = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 5_000,
  forceRequestLocation: true,
};

const PRIME_OPTIONS_LOW = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 15_000,
  forceRequestLocation: true,
};

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }

  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location permission',
      message: 'Maison Rider needs your location to show the delivery map.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  if (fine === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }

  // Coarse still lets the map show an approximate fix when fine is denied.
  const coarse = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  );
  if (coarse === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }

  if (
    fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
    coarse === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
  ) {
    Alert.alert(
      'Location required',
      'Enable location permission in Settings to show your position on the map.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
  }

  return false;
}

type PositionSample = LatLng & {
  accuracy: number | null;
  timestamp: number;
};

function readPositionOnce(
  options: typeof PRIME_OPTIONS_HIGH,
): Promise<PositionSample> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      pos => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      err => reject(err),
      options,
    );
  });
}

export function useRiderLocation(enabled = true): RiderLocationState {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchId = useRef<number | null>(null);
  const generationRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const oneShotInflightRef = useRef<Promise<RiderLocationSample | null> | null>(
    null,
  );

  const applySample = useCallback((sample: PositionSample): number => {
    const received = Date.now();
    setLocation({
      latitude: sample.latitude,
      longitude: sample.longitude,
    });
    setAccuracy(sample.accuracy);
    setTimestamp(sample.timestamp);
    setReceivedAt(received);
    return received;
  }, []);

  const stopWatch = useCallback(() => {
    if (watchId.current != null) {
      Geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  /**
   * Deduplicated one-shot refresh. Does not stop the watcher or re-request
   * permissions when already watching.
   */
  const refresh = useCallback((): Promise<RiderLocationSample | null> => {
    if (!enabledRef.current) {
      return Promise.resolve(null);
    }
    if (oneShotInflightRef.current) {
      return oneShotInflightRef.current;
    }

    const gen = generationRef.current;
    let promise!: Promise<RiderLocationSample | null>;
    promise = (async (): Promise<RiderLocationSample | null> => {
      try {
        const sample = await readPositionOnce(PRIME_OPTIONS_HIGH).catch(() =>
          readPositionOnce(PRIME_OPTIONS_LOW),
        );
        if (gen !== generationRef.current || !enabledRef.current) {
          return null;
        }
        const received = applySample(sample);
        setError(null);
        return {
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracy: sample.accuracy,
          timestamp: sample.timestamp,
          receivedAt: received,
        };
      } catch {
        if (gen !== generationRef.current || !enabledRef.current) {
          return null;
        }
        return null;
      } finally {
        if (oneShotInflightRef.current === promise) {
          oneShotInflightRef.current = null;
        }
      }
    })();

    oneShotInflightRef.current = promise;
    return promise;
  }, [applySample]);

  const startWatch = useCallback(async () => {
    const gen = ++generationRef.current;
    // Invalidate any in-flight one-shot from a prior generation.
    oneShotInflightRef.current = null;
    stopWatch();
    setLoading(true);
    setError(null);

    const granted = await requestLocationPermission();
    if (gen !== generationRef.current) return;

    if (!granted) {
      setPermissionDenied(true);
      setLoading(false);
      setError('Location permission denied');
      return;
    }

    setPermissionDenied(false);

    // Prime quickly — watchPosition alone can sit on "Getting GPS…" for a long time.
    try {
      const primed = await readPositionOnce(PRIME_OPTIONS_HIGH).catch(() =>
        readPositionOnce(PRIME_OPTIONS_LOW),
      );
      if (gen !== generationRef.current) return;
      applySample(primed);
      setLoading(false);
      setError(null);
    } catch {
      if (gen !== generationRef.current) return;
      // Keep loading until watch delivers or reports an error.
    }

    if (gen !== generationRef.current) return;

    watchId.current = Geolocation.watchPosition(
      pos => {
        if (gen !== generationRef.current) return;
        applySample({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === 'number'
              ? pos.coords.accuracy
              : null,
          timestamp: pos.timestamp || Date.now(),
        });
        setLoading(false);
        setError(null);
      },
      err => {
        if (gen !== generationRef.current) return;
        setError(err.message || 'Unable to read GPS location');
        setLoading(false);
      },
      WATCH_OPTIONS,
    );
  }, [applySample, stopWatch]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      oneShotInflightRef.current = null;
      stopWatch();
      // Keep last known location; clear only the in-flight loading flag.
      setLoading(false);
      return undefined;
    }
    void startWatch();
    return () => {
      generationRef.current += 1;
      oneShotInflightRef.current = null;
      stopWatch();
    };
  }, [enabled, startWatch, stopWatch]);

  return {
    location,
    accuracy,
    timestamp,
    receivedAt,
    loading,
    error,
    permissionDenied,
    refresh,
  };
}
