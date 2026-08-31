export type ApiEnvelope<T> = {
  status: boolean;
  message: string;
  Data: T;
};

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
  let json: ApiEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      json?.message ||
      (res.status === 401
        ? 'Session expired. Please sign in again.'
        : res.status === 403
          ? 'You do not have access to this action.'
          : `Request failed (${res.status})`);
    throw new Error(message);
  }

  if (!json) {
    throw new Error('Empty response from API');
  }

  return json;
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
