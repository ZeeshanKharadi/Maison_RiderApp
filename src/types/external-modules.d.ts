declare module 'react-native-config' {
  export interface NativeConfig {
    GOOGLE_MAPS_API_KEY?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}

declare module 'react-native-geolocation-service' {
  export type GeoPosition = {
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    };
  };

  export type GeoError = { code: number; message: string };

  export type AuthorizationResult =
    | 'granted'
    | 'denied'
    | 'disabled'
    | 'restricted';

  const Geolocation: {
    requestAuthorization(
      authorizationLevel: 'whenInUse' | 'always',
    ): Promise<AuthorizationResult>;
    watchPosition(
      success: (position: GeoPosition) => void,
      error?: (error: GeoError) => void,
      options?: Record<string, unknown>,
    ): number;
    clearWatch(watchId: number): void;
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
