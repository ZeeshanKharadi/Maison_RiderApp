/**
 * Shared repository contracts — swap mock implementations for HTTP later
 * without changing screens or context APIs.
 */

export type ApiError = {
  code: string;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: ApiError };

export type LoadState = 'idle' | 'loading' | 'success' | 'error' | 'empty';

export function ok<T>(data: T, message?: string): ApiResult<T> {
  return message ? { ok: true, data, message } : { ok: true, data };
}

export function fail(code: string, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
