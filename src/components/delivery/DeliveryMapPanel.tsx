import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActiveDeliveryJob } from '../../delivery/types';
import { mapDestinationKind, resolveMapTarget } from '../../delivery/mapTargets';
import { LatLng } from '../../utils/geo';
import { colors, radius, spacing, typography } from '../../theme';
import OsmMapView from './OsmMapView';

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
  const target = useMemo(
    () => resolveMapTarget(job, riderLocation),
    [job, riderLocation],
  );

  const destKind = mapDestinationKind(job.state);
  const heading =
    destKind === 'store'
      ? `En route to store · ${target.label}`
      : `En route to customer · ${target.label}`;

  return (
    <View style={styles.wrap}>
      <OsmMapView
        variant="panel"
        style={styles.map}
        riderLocation={riderLocation}
        destination={target.coordinate}
        destinationLabel={target.label}
        destinationKind={destKind}
        showStraightLineFallback
      />

      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.overlayTitle} numberOfLines={1}>
          {heading}
        </Text>
        {target.distanceLabel ? (
          <Text style={styles.overlayMeta}>
            {target.distanceLabel} straight-line (not a routed path)
          </Text>
        ) : (
          <Text style={styles.overlayMeta}>
            {!riderLocation
              ? 'Waiting for your GPS to show distance'
              : !target.coordinate
                ? 'Destination location unavailable'
                : 'Distance unavailable'}
          </Text>
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
            Destination location unavailable
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
    bottom: spacing.sm + 14,
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
