import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { LatLng } from '../utils/geo';

type RiderLocationState = {
  location: LatLng | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  refresh: () => void;
};

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: 10,
  interval: 5000,
  fastestInterval: 3000,
  showsBackgroundLocationIndicator: false,
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

  if (fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
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

export function useRiderLocation(enabled = true): RiderLocationState {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const watchId = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchId.current != null) {
      Geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const startWatch = useCallback(async () => {
    stopWatch();
    setLoading(true);
    setError(null);

    const granted = await requestLocationPermission();
    if (!granted) {
      setPermissionDenied(true);
      setLoading(false);
      setError('Location permission denied');
      return;
    }

    setPermissionDenied(false);

    watchId.current = Geolocation.watchPosition(
      pos => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLoading(false);
        setError(null);
      },
      err => {
        setError(err.message || 'Unable to read GPS location');
        setLoading(false);
      },
      WATCH_OPTIONS,
    );
  }, [stopWatch]);

  useEffect(() => {
    if (!enabled) {
      stopWatch();
      return undefined;
    }
    void startWatch();
    return stopWatch;
  }, [enabled, startWatch, stopWatch]);

  return {
    location,
    loading,
    error,
    permissionDenied,
    refresh: () => {
      void startWatch();
    },
  };
}
