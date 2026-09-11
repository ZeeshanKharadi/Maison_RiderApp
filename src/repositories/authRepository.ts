import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { saveTokens } from '../api/tokenStorage';
import { ApiResult, fail, ok } from './types';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isAvailableOnline?: boolean;
};

type ApiUserData = {
  id?: string;
  employeeId?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  isAvailableOnline?: boolean;
};

type LoginUserData = {
  userData?: ApiUserData;
  token?: string;
  refreshToken?: string;
};

function mapApiUser(dto: ApiUserData | undefined, fallbackId: string): AuthUser {
  return {
    id: dto?.employeeId || dto?.id || fallbackId,
    name: dto?.name?.trim() || 'Rider',
    email: dto?.email?.trim() || '',
    phone: dto?.phoneNumber?.trim() || '',
    isAvailableOnline: dto?.isAvailableOnline,
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

/** Reference: call backend logout before clearing local session. */
export async function logout(): Promise<void> {
  try {
    await apiEnvelope<string>(API_PATHS.logout, {
      method: 'POST',
      auth: true,
    });
  } catch {
    // Local logout proceeds even if API is unreachable.
  }
}

/** POST /api/User/ForgetPassword — body { workerId }. Data may be user GUID. */
export async function requestOtp(
  employeeId: string,
): Promise<ApiResult<{ employeeId: string; userId?: string }>> {
  const workerId = employeeId.trim();
  if (!workerId) {
    return fail('INVALID_INPUT', 'Please enter your Employee ID');
  }

  try {
    const envelope = await apiEnvelope<string>(API_PATHS.forgetPassword, {
      method: 'POST',
      body: { workerId },
    });

    if (!envelope.status) {
      return fail(
        'OTP_FAILED',
        envelope.message || 'Failed to send verification code',
      );
    }

    return ok({
      employeeId: workerId,
      userId: envelope.Data || undefined,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach password reset API',
    );
  }
}

/** POST /api/User/VerifyOtp — Data is resetToken. */
export async function confirmOtp(
  userId: string,
  otp: string,
): Promise<ApiResult<{ resetToken: string }>> {
  const uid = userId.trim();
  const code = otp.trim();
  if (!uid) {
    return fail('INVALID_INPUT', 'Session expired. Please start again.');
  }
  if (code.length < 4) {
    return fail('INVALID_OTP', 'Invalid verification code. Please try again.');
  }

  try {
    const envelope = await apiEnvelope<string>(API_PATHS.verifyOtp, {
      method: 'POST',
      body: { userid: uid, otp: code },
    });

    if (!envelope.status || !envelope.Data) {
      return fail('INVALID_OTP', envelope.message || 'Invalid OTP');
    }

    return ok({ resetToken: envelope.Data });
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to verify OTP',
    );
  }
}

/** POST /api/User/UpdatePassword — requires resetToken (userid alone is not enough). */
export async function resetPassword(
  employeeId: string,
  newPassword: string,
  resetToken: string,
): Promise<ApiResult<{ employeeId: string }>> {
  if (!newPassword || newPassword.length < 6) {
    return fail(
      'WEAK_PASSWORD',
      'Password must be at least 6 characters',
    );
  }
  if (!resetToken?.trim()) {
    return fail(
      'MISSING_TOKEN',
      'Reset session expired. Please verify OTP again.',
    );
  }

  try {
    const envelope = await apiEnvelope<string>(API_PATHS.updatePassword, {
      method: 'POST',
      body: {
        userid: employeeId.trim() || undefined,
        password: newPassword,
        resetToken: resetToken.trim(),
      },
    });

    if (!envelope.status) {
      return fail(
        'RESET_FAILED',
        envelope.message || 'Failed to update password',
      );
    }

    return ok({ employeeId: employeeId.trim() });
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to update password',
    );
  }
}
