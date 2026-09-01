import { LatLng } from '../utils/geo';

/**
 * Dev/testing store coordinates keyed by storeId.
 * Used only when API storeLat/storeLng are null.
 */
export type StoreLocationEntry = LatLng & { label?: string };

export const DEV_STORE_LOCATIONS: Record<string, StoreLocationEntry> = {
  'ST-001': {
    latitude: 24.8607,
    longitude: 67.0011,
    label: 'Maison Store 001',
  },
  DEFAULT: {
    latitude: 24.8607,
    longitude: 67.0011,
    label: 'Maison Store',
  },
};

export function resolveStoreLocation(
  storeId?: string | null,
): StoreLocationEntry | null {
  if (!storeId?.trim()) {
    return DEV_STORE_LOCATIONS.DEFAULT ?? null;
  }
  const key = storeId.trim();
  return DEV_STORE_LOCATIONS[key] ?? DEV_STORE_LOCATIONS.DEFAULT ?? null;
}
