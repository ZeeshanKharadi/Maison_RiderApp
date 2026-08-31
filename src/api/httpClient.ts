import { API_BASE_URL } from './config';
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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false, headers = {} } = options;
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
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
