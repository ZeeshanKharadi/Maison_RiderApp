import { useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {
  isNativeTrackingAvailable,
  startNativeLocationTracking,
  stopNativeLocationTracking,
  subscribeNativeLocation,
  uploadRiderLocation,
  TrackingLocation,
} from '../services/locationTrackingNative';

const MIN_UPLOAD_MS = 8_000;

async function ensureAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location for deliveries',
        message:
          'Maison Rider needs your location while you have active deliveries, including when the app is in the background.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    if (fine !== PermissionsAndroid.RESULTS.GRANTED) return false;

    // Android 10+: optional “All the time”. Never block FGS if this prompt fails.
    if (Platform.Version >= 29) {
      try {
        const bgPerm =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (PermissionsAndroid.PERMISSIONS as any).ACCESS_BACKGROUND_LOCATION as
            | string
            | undefined;
        if (bgPerm) {
          await PermissionsAndroid.request(bgPerm, {
            title: 'Background location',
            message:
              'Allow location access “All the time” so tracking continues when the screen is locked during deliveries.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          });
        }
      } catch {
        /* continue with while-in-use */
      }
    }

    if (Platform.Version >= 33) {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      } catch {
        /* ignore */
      }
    }

    return true;
  } catch {
    return false;
  }
}

function readCurrentPosition(): Promise<TrackingLocation | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
        forceRequestLocation: true,
        showLocationDialog: true,
      },
    );
  });
}

/**
 * Single shared tracker for all active deliveries.
 * Starts Android FGS when enabled; also keeps a JS watch + immediate fix so the
 * admin map gets a point even before the first FGS callback.
 */
export function useDeliveryLocationTracking(enabled: boolean, riderKey: string | null) {
  const lastUploadAt = useRef(0);
  const watchId = useRef<number | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    let unsubNative: (() => void) | null = null;
    let alive = true;

    const maybeUpload = async (loc: TrackingLocation, force = false) => {
      if (!alive || gen !== generation.current) return;
      const now = Date.now();
      if (!force && now - lastUploadAt.current < MIN_UPLOAD_MS) return;
      lastUploadAt.current = now;
      await uploadRiderLocation(loc);
    };

    const startJsWatch = () => {
      if (watchId.current != null) return;
      watchId.current = Geolocation.watchPosition(
        pos => {
          void maybeUpload({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
        },
        () => {
          /* keep trying */
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 8000,
          fastestInterval: 5000,
          showsBackgroundLocationIndicator: true,
        },
      );
    };

    const start = async () => {
      if (!enabled || !riderKey) return;

      if (Platform.OS === 'android') {
        const ok = await ensureAndroidPermissions();
        if (!alive || gen !== generation.current) return;
        if (!ok) return;
      } else {
        await Geolocation.requestAuthorization('whenInUse');
      }

      // Immediate fix so Live map is not stuck on “Location unavailable”.
      const first = await readCurrentPosition();
      if (!alive || gen !== generation.current) return;
      if (first) await maybeUpload(first, true);

      // Always keep JS watch as a backup upload path.
      startJsWatch();

      if (isNativeTrackingAvailable()) {
        unsubNative = subscribeNativeLocation(loc => {
          void maybeUpload(loc);
        });
        try {
          await startNativeLocationTracking();
        } catch {
          /* JS watch still running */
        }
      }
    };

    const stop = async () => {
      alive = false;
      unsubNative?.();
      unsubNative = null;
      if (watchId.current != null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      await stopNativeLocationTracking();
    };

    if (enabled && riderKey) {
      void start();
    } else {
      void stop();
    }

    const appSub = AppState.addEventListener('change', state => {
      if (state === 'active' && enabled && riderKey) {
        void (async () => {
          const fix = await readCurrentPosition();
          if (fix) await maybeUpload(fix, true);
          if (isNativeTrackingAvailable()) {
            try {
              await startNativeLocationTracking();
            } catch {
              /* ignore */
            }
          }
        })();
      }
    });

    return () => {
      appSub.remove();
      void stop();
    };
  }, [enabled, riderKey]);
}
