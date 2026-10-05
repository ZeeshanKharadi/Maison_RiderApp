import { API_BASE_URL, connectionErrorMessage } from './config';
import { getAccessToken } from './tokenStorage';

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

export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = 'HTTP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Thrown when the client aborts a request that may already have reached the server. */
export class TimeoutError extends Error {
  code = 'TIMEOUT';

  constructor(message = 'Request timed out') {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  /** Override default request timeout (ms). */
  timeoutMs?: number;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = false,
    headers = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options;
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = await getAccessToken();
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const controller = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof (payload as { message: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : typeof payload === 'string' && payload
            ? payload
            : `Request failed (${response.status})`;
      throw new HttpError(response.status, message);
    }

    return payload as T;
  } catch (err) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
    if (name === 'AbortError') {
      throw new TimeoutError(
        'Request timed out. The server may have received it — refresh before retrying.',
      );
    }
    // fetch network failures (offline, DNS, refused) — clear message for login/accept/status
    if (
      err instanceof TypeError ||
      (err instanceof Error && /network request failed|failed to fetch|networkerror/i.test(err.message))
    ) {
      throw new HttpError(0, connectionErrorMessage(err), 'NETWORK');
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function apiEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const raw = await apiRequest<RawApiEnvelope<T>>(path, options);
  return {
    status: !!raw?.status,
    message: raw?.message ?? '',
    // ASP.NET camelCase serializes `Data` as `data`
    Data: (raw?.Data ?? raw?.data) as T,
  };
}
