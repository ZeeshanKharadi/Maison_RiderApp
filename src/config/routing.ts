import Config from 'react-native-config';

/**
 * OSRM-compatible HTTPS routing base (no path suffix).
 *
 * Limited-dev testing only when set to https://router.project-osrm.org —
 * not production hosting. Public demo policy: ≤1 req/s, identifiable User-Agent,
 * ODbL attribution. Access may be withdrawn; do not treat as guaranteed hosting.
 * Leave empty to disable road-route preview until a real endpoint is configured.
 * Do not silently switch to another provider in app code.
 */
export const ROUTING_BASE_URL = (Config.ROUTING_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

export const ROUTING_USER_AGENT =
  'MaisonRiderApp/1.0 (RapidDeliveryRider; route preview)';

/** Public demo host — enforce ≤1 req/s in the client when this is configured. */
export const OSRM_DEMO_HOST = 'router.project-osrm.org';

export function isOsrmDemoRoutingHost(
  baseUrl: string = ROUTING_BASE_URL,
): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === OSRM_DEMO_HOST;
  } catch {
    return false;
  }
}

export type RoutingBaseValidation =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

/** Validate an explicit HTTPS routing base. Never invent an alternate host. */
export function validateRoutingBaseUrl(
  raw?: string,
): RoutingBaseValidation {
  const trimmed = (raw ?? ROUTING_BASE_URL).trim().replace(/\/+$/, '');
  if (!trimmed) {
    return {
      ok: false,
      message:
        'Routing endpoint is not configured. Set ROUTING_BASE_URL to an HTTPS OSRM-compatible base.',
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: 'ROUTING_BASE_URL is not a valid URL.',
    };
  }
  if (url.protocol !== 'https:') {
    return {
      ok: false,
      message: 'ROUTING_BASE_URL must use HTTPS.',
    };
  }
  return { ok: true, baseUrl: trimmed };
}

export const routingBaseValidation = validateRoutingBaseUrl();
export const hasValidRoutingBaseUrl = routingBaseValidation.ok;
/** @deprecated Prefer hasValidRoutingBaseUrl */
export const hasRoutingBaseUrl = hasValidRoutingBaseUrl;
