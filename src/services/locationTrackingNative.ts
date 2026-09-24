import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { apiEnvelope } from '../api/httpClient';
import { API_PATHS } from '../api/config';

type NativeLocationTracking = {
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const Native: NativeLocationTracking | undefined = NativeModules.LocationTracking;

export type TrackingLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

type Listener = (loc: TrackingLocation) => void;

let started = false;
let emitter: NativeEventEmitter | null = null;
let subscription: { remove: () => void } | null = null;
const listeners = new Set<Listener>();

function getEmitter(): NativeEventEmitter | null {
  if (Platform.OS !== 'android' || !Native) return null;
  if (!emitter) emitter = new NativeEventEmitter(Native as never);
  return emitter;
}

export function isNativeTrackingAvailable(): boolean {
  return Platform.OS === 'android' && !!Native;
}

export async function startNativeLocationTracking(): Promise<boolean> {
  if (!Native) return false;
  if (started) return true;
  await Native.start();
  started = true;

  const em = getEmitter();
  if (em && !subscription) {
    subscription = em.addListener('LocationTrackingUpdate', (payload: TrackingLocation) => {
      for (const cb of listeners) {
        try {
          cb(payload);
        } catch {
          /* ignore listener errors */
        }
      }
    });
  }
  return true;
}

export async function stopNativeLocationTracking(): Promise<void> {
  if (!Native) return;
  try {
    await Native.stop();
  } catch {
    /* ignore */
  }
  started = false;
  subscription?.remove();
  subscription = null;
}

export function subscribeNativeLocation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function uploadRiderLocation(loc: TrackingLocation): Promise<boolean> {
  try {
    const res = await apiEnvelope<{ riderUserId: string }>(API_PATHS.riderLocation, {
      method: 'PUT',
      auth: true,
      body: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracyMeters: loc.accuracy,
        recordedAt: loc.timestamp
          ? new Date(loc.timestamp).toISOString()
          : new Date().toISOString(),
      },
    });
    return !!res.status;
  } catch {
    return false;
  }
}
