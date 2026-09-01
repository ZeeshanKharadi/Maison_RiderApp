export type ApiEnvelope<T> = {
  status: boolean;
  message: string;
  Data: T;
};

type RawApiEnvelope<T> = {
  status?: boolean;
  message?: string;
  Data?: T;
  data?: T;
};

function normalizeEnvelope<T>(raw: RawApiEnvelope<T>): ApiEnvelope<T> {
  return {
    status: !!raw.status,
    message: raw.message ?? '',
    // ASP.NET serializes ApiResponse.Data as `data` (camelCase)
    Data: (raw.Data ?? raw.data) as T,
  };
}

export type UserData = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phoneNumber: string;
  storeId?: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  isVerified: boolean;
};

export type LoginPayload = {
  userData: UserData;
  token: string;
  refreshToken: string;
};

const TOKEN_KEY = 'maison.admin.token';
const USER_KEY = 'maison.admin.user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserData | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: UserData) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAdminPortalUser(user: UserData | null): boolean {
  if (!user?.roles?.length) return false;
  return user.roles.includes('Administrator') || user.roles.includes('Manager');
}

export function isHeadOffice(user: UserData | null): boolean {
  return !!user?.roles?.includes('Administrator');
}

function apiBase(): string {
  const env = import.meta.env.VITE_API_URL;
  return env && env.length > 0 ? env.replace(/\/$/, '') : '';
}

/** Pull a human-readable message from ApiResponse or ProblemDetails bodies. */
function readApiError(json: unknown, httpStatus: number): string {
  if (!json || typeof json !== 'object') {
    if (httpStatus === 401) return 'Session expired. Please sign in again.';
    if (httpStatus === 403) return 'You do not have access to this action.';
    return `Request failed (${httpStatus})`;
  }

  const body = json as Record<string, unknown>;
  const direct =
    (typeof body.message === 'string' && body.message) ||
    (typeof body.Message === 'string' && body.Message);
  if (direct) return direct;

  const errors = body.errors as Record<string, string[]> | undefined;
  if (errors) {
    const parts = Object.entries(errors).flatMap(([field, msgs]) =>
      (msgs ?? []).map((m) => `${field}: ${m}`),
    );
    if (parts.length > 0) return parts.join(' · ');
  }

  if (typeof body.title === 'string' && body.title) return body.title;

  if (httpStatus === 401) return 'Session expired. Please sign in again.';
  if (httpStatus === 403) return 'You do not have access to this action.';
  return `Request failed (${httpStatus})`;
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const text = await res.text();
  let json: RawApiEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as RawApiEnvelope<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(readApiError(json, res.status));
  }

  if (!json) {
    throw new Error('Empty response from API');
  }

  const envelope = normalizeEnvelope(json);

  // Some endpoints return HTTP 200 with status:false — treat as an error too.
  if (!envelope.status && res.ok) {
    throw new Error(envelope.message || 'Request failed');
  }

  return envelope;
}

export async function apiBlob(
  path: string,
  filename: string,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
