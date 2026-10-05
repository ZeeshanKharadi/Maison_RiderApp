import Config from 'react-native-config';
import { Platform } from 'react-native';

/**
 * Build-time API host from react-native-config (.env / .env.development / .env.production).
 * Never hard-code LAN IPs here. Never put passwords or API secrets in this file.
 */
function readConfiguredBaseUrl(): string {
  const raw = (Config.API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return raw;
}

function assertValidApiBaseUrl(url: string): string {
  if (!url) {
    const hint =
      'Set API_BASE_URL in .env.development (debug) or .env.production (release). See .env.example.';
    if (__DEV__) {
      throw new Error(`[API] Missing API_BASE_URL. ${hint}`);
    }
    throw new Error(
      `[API] Missing API_BASE_URL. This release build is misconfigured. ${hint}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `[API] Invalid API_BASE_URL "${url}". Use a full URL like https://api.example.com`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `[API] API_BASE_URL must use http or https (got ${parsed.protocol}).`,
    );
  }

  // Release / production builds must use HTTPS — never silent LAN/http fallback.
  if (!__DEV__) {
    if (parsed.protocol !== 'https:') {
      throw new Error(
        `[API] Release builds require HTTPS API_BASE_URL (got ${url}).`,
      );
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      throw new Error(
        `[API] Release builds must not use a LAN/localhost API_BASE_URL (got ${url}).`,
      );
    }
  }

  return url;
}

export const API_BASE_URL = assertValidApiBaseUrl(readConfiguredBaseUrl());

export function getApiSetupError(): string | null {
  try {
    assertValidApiBaseUrl(readConfiguredBaseUrl());
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'API is not configured.';
  }
}

/** Human-readable connection error for login / accept / status. */
export function connectionErrorMessage(err?: unknown): string {
  const base = `Cannot reach the server at ${API_BASE_URL}`;
  if (err instanceof Error && err.message && !/network request failed/i.test(err.message)) {
    return `${base}. ${err.message}`;
  }
  return `${base}. Check your internet connection and that the API is running.`;
}

export const API_PATHS = {
  login: '/api/User/login',
  logout: '/api/User/Logout',
  currentUser: '/api/User/CurrentUser',
  patchProfile: '/api/User/profile',
  forgetPassword: '/api/User/ForgetPassword',
  verifyOtp: '/api/User/VerifyOtp',
  updatePassword: '/api/User/UpdatePassword',
  availableOrders: '/api/Order/Available',
  activeOrders: '/api/Order/Active',
  recentCancellations: '/api/Order/RecentCancellations',
  acknowledgeCancellations: '/api/Order/AcknowledgeCancellations',
  orderHistory: '/api/Order/History',
  orderPerformance: '/api/Order/Performance',
  availability: '/api/Order/availability',
  riderLocation: '/api/Order/location',
  finance: '/api/Order/Finance',
  financeSummary: '/api/Order/Finance/summary',
  orderById: (id: number | string) => `/api/Order/${id}`,
  orderStatus: (id: number | string) => `/api/Order/${id}/status`,
  orderReject: (id: number | string) => `/api/Order/${id}/reject`,
  orderReportIssue: (id: number | string) => `/api/Order/${id}/report-issue`,
  orderRequestFailedDelivery: (id: number | string) =>
    `/api/Order/${id}/request-failed-delivery`,
  orderConfirmReturnToStore: (id: number | string) =>
    `/api/Order/${id}/confirm-return-to-store`,
  notifications: '/api/User/Notifications',
  notificationRead: (id: string | number) => `/api/User/Notifications/${id}/read`,
  notificationsReadAll: '/api/User/Notifications/read-all',
  notificationDelete: (id: string | number) => `/api/User/Notifications/${id}`,
  notificationsDeleteAll: '/api/User/Notifications',
  deviceToken: '/api/User/device-token',
} as const;

/** Dev-only log so misconfigured hosts are obvious. */
if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log(`[API] ${Platform.OS} → ${API_BASE_URL}`);
}
