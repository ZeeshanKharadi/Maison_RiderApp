import { Platform } from 'react-native';
import { isValidCoord, LatLng } from '../utils/geo';
import {
  buildGoogleMapsDirectionsUrl,
  MapDestinationKind,
} from './mapTargets';

/** Minimal fields needed to navigate to pickup or customer. */
export type NavigableOrderLocation = {
  storeLat?: number | null;
  storeLng?: number | null;
  pickupAddress?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  dropoffAddress?: string | null;
  customerPhone?: string | null;
};

export function navigationInputForKind(
  order: NavigableOrderLocation,
  kind: MapDestinationKind,
): NavigationDestinationInput {
  if (kind === 'store') {
    return {
      lat: order.storeLat,
      lng: order.storeLng,
      address: order.pickupAddress,
      // Store phone is not modeled yet — offer customer Call when available.
      contactPhone: order.customerPhone,
      contactLabel: 'Call customer',
    };
  }
  return {
    lat: order.customerLat,
    lng: order.customerLng,
    address: order.dropoffAddress,
    contactPhone: order.customerPhone,
    contactLabel: 'Call customer',
  };
}

export type NavigationContact = {
  phone: string;
  label: string;
};

export type NavigationDestinationInput = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  contactPhone?: string | null;
  /** Alert button label when offering Call, e.g. "Call customer". */
  contactLabel?: string;
};

export type NavigationPlan =
  | {
      kind: 'coordinates';
      latitude: number;
      longitude: number;
      url: string;
    }
  | {
      kind: 'address';
      address: string;
      url: string;
    }
  | {
      kind: 'unavailable';
      title: string;
      message: string;
      contact: NavigationContact | null;
    };

const PLACEHOLDER_ADDRESSES = new Set([
  '',
  '—',
  '-',
  'n/a',
  'na',
  'address unavailable',
  'unavailable',
  'unknown',
]);

/** True when the string looks like a real street address (not a placeholder). */
export function isUsableStreetAddress(address?: string | null): boolean {
  if (address == null) return false;
  const trimmed = address.trim();
  if (!trimmed) return false;
  if (PLACEHOLDER_ADDRESSES.has(trimmed.toLowerCase())) return false;
  // Mapper uses "Store {id}" when no store street is available — not navigable.
  if (/^store\s+\S+$/i.test(trimmed)) return false;
  return true;
}

export function isUsablePhone(phone?: string | null): boolean {
  if (phone == null) return false;
  const trimmed = phone.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return false;
  return /[\d+]/.test(trimmed);
}

export function buildGoogleMapsSearchDestinationUrl(
  destination: string,
  origin?: LatLng | null,
): string {
  const dest = encodeURIComponent(destination);
  if (origin && isValidCoord(origin.latitude, origin.longitude)) {
    const o = encodeURIComponent(
      `${origin.latitude},${origin.longitude}`,
    );
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${dest}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

function resolveContact(
  input: NavigationDestinationInput,
): NavigationContact | null {
  if (!isUsablePhone(input.contactPhone)) return null;
  return {
    phone: input.contactPhone!.trim(),
    label: (input.contactLabel ?? 'Call').trim() || 'Call',
  };
}

/**
 * Resolve how to open Google Maps for a pickup/customer destination.
 * Never invents coordinates — 0,0 / invalid / missing fall through to address or unavailable.
 */
export function resolveNavigationPlan(
  input: NavigationDestinationInput,
  origin?: LatLng | null,
): NavigationPlan {
  if (isValidCoord(input.lat, input.lng)) {
    const latitude = input.lat!;
    const longitude = input.lng!;
    const destination: LatLng = { latitude, longitude };
    const url =
      origin && isValidCoord(origin.latitude, origin.longitude)
        ? buildGoogleMapsDirectionsUrl(origin, destination)
        : buildGoogleMapsSearchDestinationUrl(
            `${latitude},${longitude}`,
            null,
          );
    return { kind: 'coordinates', latitude, longitude, url };
  }

  if (isUsableStreetAddress(input.address)) {
    const address = input.address!.trim();
    return {
      kind: 'address',
      address,
      url: buildGoogleMapsSearchDestinationUrl(address, origin ?? null),
    };
  }

  return {
    kind: 'unavailable',
    title: 'Navigation unavailable',
    message:
      'No destination coordinates or street address are available for this stop. Use Call if a contact number is listed.',
    contact: resolveContact(input),
  };
}

export type OpenMapsDeps = {
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<void>;
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      style?: 'cancel' | 'default' | 'destructive';
      onPress?: () => void;
    }>,
  ) => void;
  platformOS?: string;
};

/**
 * Open Google Maps from a resolved plan, or show unavailable + optional Call.
 */
export async function openNavigationPlan(
  plan: NavigationPlan,
  deps: OpenMapsDeps,
): Promise<void> {
  if (plan.kind === 'unavailable') {
    const buttons = plan.contact
      ? [
          { text: 'Cancel', style: 'cancel' as const },
          {
            text: plan.contact.label,
            onPress: () => {
              const digits = plan.contact!.phone.replace(/[^\d+]/g, '');
              void deps.openURL(`tel:${digits}`);
            },
          },
        ]
      : [{ text: 'OK' }];
    deps.alert(plan.title, plan.message, buttons);
    return;
  }

  const { url } = plan;
  try {
    const supported = await deps.canOpenURL(url);
    if (supported) {
      await deps.openURL(url);
      return;
    }
    // Android 11+ may report false negatives without manifest queries — try anyway.
    if ((deps.platformOS ?? Platform.OS) === 'android') {
      await deps.openURL(url);
      return;
    }
    deps.alert(
      'Unable to open maps',
      'Google Maps is not available on this device.',
    );
  } catch {
    deps.alert('Unable to open maps', 'Could not launch Google Maps.');
  }
}
