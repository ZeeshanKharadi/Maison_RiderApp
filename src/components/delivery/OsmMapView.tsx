import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import {
  buildOsmRasterStyle,
  OSM_ATTRIBUTION,
  OSM_RASTER_TILE_URL,
} from '../../config/osmTiles';
import { configureOsmTileRequests } from '../../maps/configureOsmTileRequests';
import { LatLng, straightPolyline } from '../../utils/geo';
import { colors, radius, spacing, typography } from '../../theme';

export type CameraFitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type OsmMapViewProps = {
  riderLocation: LatLng | null;
  destination: LatLng | null;
  destinationLabel?: string;
  destinationKind?: 'store' | 'customer';
  /** Road route from last OSRM calculation (preferred over straight connector). */
  roadRouteCoordinates?: LatLng[] | null;
  showStraightLineFallback?: boolean;
  /** Extra padding so Fit accounts for header / route card / controls. */
  fitPadding?: CameraFitPadding;
  variant?: 'panel' | 'fullscreen';
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_FIT_PADDING: CameraFitPadding = {
  top: 56,
  right: 52,
  bottom: 88,
  left: 40,
};

function toLngLat(p: LatLng): [number, number] {
  return [p.longitude, p.latitude];
}

function boundsForPoints(points: LatLng[]): [number, number, number, number] {
  let west = points[0].longitude;
  let east = points[0].longitude;
  let south = points[0].latitude;
  let north = points[0].latitude;
  for (const p of points) {
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  if (west === east) {
    west -= 0.005;
    east += 0.005;
  }
  if (south === north) {
    south -= 0.005;
    north += 0.005;
  }
  return [west, south, east, north];
}

export default function OsmMapView({
  riderLocation,
  destination,
  destinationLabel = 'Destination',
  destinationKind = 'customer',
  roadRouteCoordinates = null,
  showStraightLineFallback = true,
  fitPadding = DEFAULT_FIT_PADDING,
  variant = 'panel',
  style,
}: OsmMapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followRider, setFollowRider] = useState(false);
  const [styleNonce, setStyleNonce] = useState(0);
  const userPannedRef = useRef(false);
  const lastFitKeyRef = useRef<string | null>(null);
  const riderRef = useRef(riderLocation);
  const destRef = useRef(destination);
  const routeRef = useRef(roadRouteCoordinates);
  const fitPaddingRef = useRef(fitPadding);
  riderRef.current = riderLocation;
  destRef.current = destination;
  routeRef.current = roadRouteCoordinates;
  fitPaddingRef.current = fitPadding;

  useEffect(() => {
    configureOsmTileRequests();
  }, []);

  const mapStyle = useMemo(
    () => buildOsmRasterStyle(OSM_RASTER_TILE_URL),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- styleNonce remounts map on Retry
    [styleNonce],
  );

  const destKey = destination
    ? `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`
    : 'none';

  const routeKey =
    roadRouteCoordinates && roadRouteCoordinates.length > 1
      ? `${roadRouteCoordinates.length}:${roadRouteCoordinates[0].latitude.toFixed(4)},${roadRouteCoordinates[roadRouteCoordinates.length - 1].latitude.toFixed(4)}`
      : 'noroute';

  /** Fit only on initial load / destination or route geometry change — not every GPS tick. */
  const fitKey = `${destKey}|${routeKey}`;

  const fitCamera = useCallback((animated: boolean) => {
    const rider = riderRef.current;
    const dest = destRef.current;
    const route = routeRef.current;
    const pts: LatLng[] = [];
    if (route && route.length > 1) {
      // Sample route endpoints + mid for bounds without huge arrays
      pts.push(route[0], route[Math.floor(route.length / 2)], route[route.length - 1]);
      if (rider) pts.push(rider);
      if (dest) pts.push(dest);
    } else {
      if (rider) pts.push(rider);
      if (dest) pts.push(dest);
    }
    if (!cameraRef.current || pts.length === 0) return;
    if (pts.length === 1) {
      const center = toLngLat(pts[0]);
      if (animated) {
        cameraRef.current.easeTo({ center, zoom: 14, duration: 400 });
      } else {
        cameraRef.current.jumpTo({ center, zoom: 14 });
      }
      return;
    }
    cameraRef.current.fitBounds(boundsForPoints(pts), {
      padding: fitPaddingRef.current,
      duration: animated ? 450 : 0,
    });
  }, []);

  useEffect(() => {
    if (!mapReady || followRider) return;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    userPannedRef.current = false;
    fitCamera(true);
  }, [mapReady, fitKey, fitCamera, followRider]);

  useEffect(() => {
    if (!mapReady || !followRider || !riderLocation) return;
    cameraRef.current?.easeTo({
      center: toLngLat(riderLocation),
      zoom: 15,
      duration: 350,
    });
  }, [mapReady, followRider, riderLocation]);

  const lineFeature = useMemo(() => {
    if (roadRouteCoordinates && roadRouteCoordinates.length > 1) {
      return {
        type: 'Feature' as const,
        properties: { kind: 'road' },
        geometry: {
          type: 'LineString' as const,
          coordinates: roadRouteCoordinates.map(toLngLat),
        },
      };
    }
    if (
      !showStraightLineFallback ||
      !riderLocation ||
      !destination
    ) {
      return null;
    }
    const line = straightPolyline(riderLocation, destination, 12);
    return {
      type: 'Feature' as const,
      properties: { kind: 'straight' },
      geometry: {
        type: 'LineString' as const,
        coordinates: line.map(toLngLat),
      },
    };
  }, [
    roadRouteCoordinates,
    showStraightLineFallback,
    riderLocation,
    destination,
  ]);

  const onRetry = () => {
    setLoadError(null);
    setMapReady(false);
    userPannedRef.current = false;
    lastFitKeyRef.current = null;
    setStyleNonce(n => n + 1);
  };

  const zoomBy = (delta: number) => {
    void (async () => {
      const z = (await mapRef.current?.getZoom()) ?? 14;
      cameraRef.current?.zoomTo(Math.min(18, Math.max(3, z + delta)), {
        duration: 200,
      });
    })();
  };

  const onRecenter = () => {
    userPannedRef.current = false;
    setFollowRider(false);
    lastFitKeyRef.current = null;
    fitCamera(true);
    lastFitKeyRef.current = fitKey;
  };

  const destColor =
    destinationKind === 'store' ? colors.warning : colors.success;

  return (
    <View style={[styles.root, style]}>
      <Map
        key={`osm-map-${styleNonce}`}
        ref={mapRef}
        style={styles.map}
        mapStyle={mapStyle}
        attribution={false}
        logo={false}
        compass={false}
        scaleBar={false}
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          setLoadError(null);
        }}
        onDidFailLoadingMap={() => {
          setLoadError('Map tiles failed to load.');
          setMapReady(false);
        }}
        onRegionDidChange={e => {
          if (e.nativeEvent.userInteraction) {
            userPannedRef.current = true;
            if (followRider) setFollowRider(false);
          }
        }}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: toLngLat(
              destination ??
                riderLocation ?? { latitude: 24.8607, longitude: 67.0011 },
            ),
            zoom: 12,
          }}
        />

        {lineFeature ? (
          <GeoJSONSource id="preview-line" data={lineFeature}>
            <Layer
              id="preview-line-layer"
              type="line"
              paint={{
                'line-color': colors.primaryDark,
                'line-width':
                  lineFeature.properties.kind === 'road' ? 4 : 3,
                'line-opacity': 0.9,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {riderLocation ? (
          <Marker id="rider" lngLat={toLngLat(riderLocation)} anchor="center">
            <View style={[styles.pin, styles.pinRider]} />
          </Marker>
        ) : null}

        {destination ? (
          <Marker id="dest" lngLat={toLngLat(destination)} anchor="bottom">
            <View style={styles.destWrap}>
              <View style={[styles.pin, { backgroundColor: destColor }]} />
              {variant === 'panel' && destinationLabel ? (
                <Text style={styles.destLabel} numberOfLines={1}>
                  {destinationLabel}
                </Text>
              ) : null}
            </View>
          </Marker>
        ) : null}
      </Map>

      {!mapReady && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.attribution} pointerEvents="none">
        {OSM_ATTRIBUTION}
      </Text>

      {variant === 'fullscreen' ? (
        <View style={styles.controls}>
          <Pressable style={styles.ctrlBtn} onPress={() => zoomBy(1)}>
            <Text style={styles.ctrlLabel}>+</Text>
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={() => zoomBy(-1)}>
            <Text style={styles.ctrlLabel}>−</Text>
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={onRecenter}>
            <Text style={styles.ctrlCaption}>Fit</Text>
          </Pressable>
          <Pressable
            style={[styles.ctrlBtn, followRider && styles.ctrlBtnActive]}
            onPress={() => {
              if (!riderLocation) return;
              userPannedRef.current = false;
              setFollowRider(v => !v);
            }}>
            <Text style={styles.ctrlCaption}>
              {followRider ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  errorBox: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
  retry: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  attribution: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  controls: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    gap: 6,
  },
  ctrlBtn: {
    minWidth: 44,
    minHeight: 44,
    width: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 2,
  },
  ctrlBtnActive: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ctrlLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.primary,
    lineHeight: 26,
  },
  ctrlCaption: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
  },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinRider: {
    backgroundColor: colors.info,
  },
  destWrap: {
    alignItems: 'center',
    maxWidth: 140,
  },
  destLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.92)',
    marginTop: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
});
