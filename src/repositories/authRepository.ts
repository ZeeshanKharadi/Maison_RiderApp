import { DEMO_EMPLOYEE_ID } from '../constants/app';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { saveTokens } from '../api/tokenStorage';
import { ApiResult, fail, ok } from './types';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
};

type ApiUserData = {
  id?: string;
  employeeId?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
};

type LoginUserData = {
  userData?: ApiUserData;
  token?: string;
  refreshToken?: string;
};

function mapApiUser(dto: ApiUserData | undefined, fallbackId: string): AuthUser {
  return {
    id: dto?.id || dto?.employeeId || fallbackId,
    name: dto?.name?.trim() || 'Rider',
    email: dto?.email?.trim() || '',
    phone: dto?.phoneNumber?.trim() || '',
  };
}

/**
 * ESS-compatible login → persists JWT for Order/Available and other secured APIs.
 */
export async function login(
  employeeId: string,
  password: string,
): Promise<ApiResult<AuthUser>> {
  const id = employeeId.trim();
  if (!id || !password.trim()) {
    return fail('INVALID_INPUT', 'Invalid Employee ID or Password');
  }

  try {
    const envelope = await apiEnvelope<LoginUserData>(API_PATHS.login, {
      method: 'POST',
      body: { userid: id, password },
    });

    if (!envelope.status || !envelope.Data?.token) {
      return fail(
        'LOGIN_FAILED',
        envelope.message || 'Invalid Employee ID or Password',
      );
    }

    await saveTokens(envelope.Data.token, envelope.Data.refreshToken);

    return ok(mapApiUser(envelope.Data.userData, id));
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error
        ? err.message
        : 'Unable to reach login API. Is the backend running?',
    );
  }
}

/** Loads latest user row from DB (name/email/phone). */
export async function fetchCurrentUser(): Promise<ApiResult<AuthUser>> {
  try {
    const envelope = await apiEnvelope<ApiUserData>(API_PATHS.currentUser, {
      auth: true,
    });

    if (!envelope.status || !envelope.Data) {
      return fail(
        'USER_LOAD_FAILED',
        envelope.message || 'Could not load user profile',
      );
    }

    return ok(mapApiUser(envelope.Data, envelope.Data.employeeId || ''));
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach user API',
    );
  }
}

export async function requestOtp(
  employeeId: string,
): Promise<ApiResult<{ employeeId: string }>> {
  if (!employeeId.trim()) {
    return fail('INVALID_INPUT', 'Please enter your Employee ID');
  }
  return ok({ employeeId: employeeId.trim() });
}

export async function confirmOtp(
  _employeeId: string,
  otp: string,
): Promise<ApiResult<true>> {
  if (otp.trim().length >= 4) {
    return ok(true);
  }
  return fail('INVALID_OTP', 'Invalid verification code. Please try again.');
}

export async function resetPassword(
  employeeId: string,
  newPassword: string,
): Promise<ApiResult<{ employeeId: string }>> {
  if (!newPassword || newPassword.length < 6) {
    return fail(
      'WEAK_PASSWORD',
      'Password must be at least 6 characters',
    );
  }
  return ok({ employeeId: employeeId || DEMO_EMPLOYEE_ID });
}
