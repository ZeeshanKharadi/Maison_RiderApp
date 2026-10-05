declare module 'react-native-config' {
  export interface NativeConfig {
    GOOGLE_MAPS_API_KEY?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}

declare module 'react-native-geolocation-service' {
  export type AuthorizationLevel = 'always' | 'whenInUse';
  export type AuthorizationResult =
    | 'granted'
    | 'denied'
    | 'disabled'
    | 'restricted';

  export interface GeoCoordinates {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    altitudeAccuracy?: number | null;
  }

  export interface GeoPosition {
    coords: GeoCoordinates;
    timestamp: number;
    mocked?: boolean;
  }

  export type GeoError = { code: number; message: string };

  export interface GeoOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
    showLocationDialog?: boolean;
    forceRequestLocation?: boolean;
    forceLocationManager?: boolean;
    distanceFilter?: number;
  }

  export interface GeoWatchOptions extends GeoOptions {
    interval?: number;
    fastestInterval?: number;
    useSignificantChanges?: boolean;
    showsBackgroundLocationIndicator?: boolean;
  }

  const Geolocation: {
    requestAuthorization(
      authorizationLevel: AuthorizationLevel,
    ): Promise<AuthorizationResult>;
    getCurrentPosition(
      success: (position: GeoPosition) => void,
      error?: (error: GeoError) => void,
      options?: GeoOptions,
    ): void;
    watchPosition(
      success: (position: GeoPosition) => void,
      error?: (error: GeoError) => void,
      options?: GeoWatchOptions,
    ): number;
    clearWatch(watchId: number): void;
    stopObserving(): void;
  };

  export default Geolocation;
}

declare module 'react-native-maps' {
  import { Component, Ref } from 'react';
  import { ViewProps } from 'react-native';

  export const PROVIDER_GOOGLE: 'google';

  export type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };

  export type LatLng = {
    latitude: number;
    longitude: number;
  };

  export type MapViewProps = ViewProps & {
    provider?: 'google' | null;
    region?: Region;
    initialRegion?: Region;
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
  };

  export type MarkerProps = ViewProps & {
    coordinate: LatLng;
    title?: string;
    description?: string;
    pinColor?: string;
  };

  export type PolylineProps = ViewProps & {
    coordinates: LatLng[];
    strokeColor?: string;
    strokeWidth?: number;
  };

  export default class MapView extends Component<MapViewProps> {
    animateToRegion(region: Region, duration?: number): void;
  }

  export class Marker extends Component<MarkerProps> {}
  export class Polyline extends Component<PolylineProps> {}
}
