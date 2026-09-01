import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ActiveDeliveryJob } from '../../delivery/types';
import { mapDestinationKind, resolveMapTarget } from '../../delivery/mapTargets';
import {
  LatLng,
  regionForPoints,
  straightPolyline,
} from '../../utils/geo';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  job: ActiveDeliveryJob;
  riderLocation: LatLng | null;
  locationLoading?: boolean;
  locationError?: string | null;
};

export default function DeliveryMapPanel({
  job,
  riderLocation,
  locationLoading,
  locationError,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const target = useMemo(
    () => resolveMapTarget(job, riderLocation),
    [job, riderLocation],
  );

  const mapPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (riderLocation) pts.push(riderLocation);
    if (target.coordinate) pts.push(target.coordinate);
    return pts;
  }, [riderLocation, target.coordinate]);

  const region = useMemo(() => regionForPoints(mapPoints), [mapPoints]);

  const routeLine = useMemo(() => {
    if (!riderLocation || !target.coordinate) return [];
    return straightPolyline(riderLocation, target.coordinate);
  }, [riderLocation, target.coordinate]);

  useEffect(() => {
    if (mapPoints.length === 0) return;
    mapRef.current?.animateToRegion(region, 450);
  }, [job.id, job.state, region, mapPoints.length]);

  const destKind = mapDestinationKind(job.state);
  const heading =
    destKind === 'store'
      ? `En route to store · ${target.label}`
      : `En route to customer · ${target.label}`;

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={false}
        showsMyLocationButton={false}>
        {riderLocation ? (
          <Marker
            coordinate={riderLocation}
            title="You"
            pinColor={colors.info}
          />
        ) : null}
        {target.coordinate ? (
          <Marker
            coordinate={target.coordinate}
            title={target.label}
            description={destKind === 'store' ? 'Pickup' : 'Drop-off'}
            pinColor={destKind === 'store' ? colors.warning : colors.success}
          />
        ) : null}
        {routeLine.length > 1 ? (
          <Polyline
            coordinates={routeLine}
            strokeColor={colors.primaryDark}
            strokeWidth={3}
          />
        ) : null}
      </MapView>

      <View style={styles.overlay}>
        <Text style={styles.overlayTitle} numberOfLines={1}>
          {heading}
        </Text>
        {target.distanceLabel && target.etaMinutes != null ? (
          <Text style={styles.overlayMeta}>
            {target.distanceLabel} · ~{target.etaMinutes} min (est.)
          </Text>
        ) : (
          <Text style={styles.overlayMeta}>Distance unavailable</Text>
        )}
      </View>

      {locationLoading && !riderLocation ? (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color={colors.primaryDark} />
          <Text style={styles.bannerText}>Getting GPS location…</Text>
        </View>
      ) : null}

      {locationError && !riderLocation ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>{locationError}</Text>
        </View>
      ) : null}

      {!target.coordinate ? (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            {destKind === 'store'
              ? 'Store coordinates missing — set Stores.Latitude/Longitude in the backend.'
              : 'Customer coordinates missing on this order.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 240,
    backgroundColor: colors.border,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  overlayTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  overlayMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  banner: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  bannerWarn: {
    backgroundColor: colors.warningSoft,
  },
  bannerText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
