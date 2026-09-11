import { LatLng } from '../utils/geo';

/**
 * Store coordinates come from the API (storeLat/storeLng).
 * No geographic fallbacks — missing coords must surface as unavailable in UI.
 */
export type StoreLocationEntry = LatLng & { label?: string };

/** @deprecated Empty — do not use Karachi or other fabricated store pins. */
export const DEV_STORE_LOCATIONS: Record<string, StoreLocationEntry> = {};

export function resolveStoreLocation(
  _storeId?: string | null,
): StoreLocationEntry | null {
  return null;
}
