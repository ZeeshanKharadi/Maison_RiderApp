import { DeliveryState } from './stateMachine';
import { ActiveDeliveryJob } from './types';
import { resolveStoreLocation } from '../config/storeLocations';
import {
  distanceKm,
  estimateEtaMinutes,
  formatDistanceKm,
  isValidCoord,
  LatLng,
} from '../utils/geo';

function resolveStoreCoordinate(job: {
  storeId?: string;
  storeLat?: number | null;
  storeLng?: number | null;
}): { coordinate: LatLng | null; label?: string } {
  if (isValidCoord(job.storeLat, job.storeLng)) {
    return {
      coordinate: { latitude: job.storeLat!, longitude: job.storeLng! },
    };
  }

  const fallback = resolveStoreLocation(job.storeId);
  if (!fallback) {
    return { coordinate: null };
  }

  return {
    coordinate: { latitude: fallback.latitude, longitude: fallback.longitude },
    label: fallback.label,
  };
}

export type MapDestinationKind = 'store' | 'customer';

/** From PICKUP_CONFIRMED onward the rider is en route to the customer. */
const POST_PICKUP_STATES: DeliveryState[] = [
  'PICKUP_CONFIRMED',
  'ON_THE_WAY',
  'ARRIVED_AT_DESTINATION',
  'DELIVERED',
  'COMPLETED',
];

export function isPostPickupState(state: DeliveryState): boolean {
  return POST_PICKUP_STATES.includes(state);
}

export function mapDestinationKind(state: DeliveryState): MapDestinationKind {
  return isPostPickupState(state) ? 'customer' : 'store';
}

export type MapTarget = {
  kind: MapDestinationKind;
  label: string;
  coordinate: LatLng | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  distanceLabel: string | null;
};

export function resolveMapTarget(
  job: ActiveDeliveryJob,
  riderLocation: LatLng | null,
): MapTarget {
  const kind = mapDestinationKind(job.state);

  if (kind === 'store') {
    const store = resolveStoreCoordinate(job);
    const coordinate = store.coordinate;
    const dist =
      riderLocation && coordinate ? distanceKm(riderLocation, coordinate) : null;
    return {
      kind: 'store',
      label: job.restaurant || store.label || 'Store',
      coordinate,
      distanceKm: dist,
      etaMinutes: dist != null ? estimateEtaMinutes(dist) : null,
      distanceLabel: dist != null ? formatDistanceKm(dist) : null,
    };
  }

  const coordinate =
    isValidCoord(job.customerLat, job.customerLng)
      ? { latitude: job.customerLat!, longitude: job.customerLng! }
      : null;
  const dist =
    riderLocation && coordinate ? distanceKm(riderLocation, coordinate) : null;

  return {
    kind: 'customer',
    label: job.customerName || 'Customer',
    coordinate,
    distanceKm: dist,
    etaMinutes: dist != null ? estimateEtaMinutes(dist) : null,
    distanceLabel: dist != null ? formatDistanceKm(dist) : null,
  };
}

export function buildGoogleMapsDirectionsUrl(
  origin: LatLng,
  destination: LatLng,
): string {
  const o = `${origin.latitude},${origin.longitude}`;
  const d = `${destination.latitude},${destination.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`;
}
