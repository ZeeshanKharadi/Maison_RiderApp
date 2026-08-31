import { DEMO_EMPLOYEE_ID } from '../constants/app';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { saveTokens } from '../api/tokenStorage';
import { ApiResult, fail, ok } from './types';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type LoginUserData = {
  userData?: {
    id?: string;
    employeeId?: string;
    name?: string;
    email?: string;
  };
  token?: string;
  refreshToken?: string;
};

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

    const user = envelope.Data.userData;
    return ok({
      id: user?.employeeId || user?.id || id,
      name: user?.name || 'Rider',
      email: user?.email || '',
    });
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

export async function requestOtp(
  employeeId: string,
): Promise<ApiResult<{ employeeId: string }>> {
  if (!employeeId.trim()) {
    return fail('INVALID_INPUT', 'Please enter your Employee ID');
  }
  // Registration / OTP still wired through backend in a later pass.
  // Keep local success so existing create-account flow is not blocked.
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
