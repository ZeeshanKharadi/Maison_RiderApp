import * as authRepository from '../repositories/authRepository';

export interface AuthResult {
  status: boolean;
  message?: string;
  data?: string;
}

/** Thin adapter — screens keep AuthResult shape; swap authRepository for API. */
export async function loginUser(
  employeeId: string,
  password: string,
): Promise<AuthResult> {
  const result = await authRepository.login(employeeId, password);
  if (!result.ok) {
    return { status: false, message: result.error.message };
  }
  return { status: true, data: JSON.stringify(result.data) };
}

export async function sendOtp(employeeId: string): Promise<AuthResult> {
  const result = await authRepository.requestOtp(employeeId);
  if (!result.ok) {
    return { status: false, message: result.error.message };
  }
  return {
    status: true,
    message:
      result.message ||
      'If this account exists, a verification code has been sent.',
    // VerifyOtp accepts workerId (employee id); do not rely on returned GUID.
    data: result.data.employeeId,
  };
}

export async function verifyOtp(
  employeeId: string,
  otp: string,
): Promise<AuthResult> {
  const result = await authRepository.confirmOtp(employeeId, otp);
  if (!result.ok) {
    return { status: false, message: result.error.message };
  }
  return {
    status: true,
    message: 'OTP verified successfully!',
    data: result.data.resetToken,
  };
}

export async function updatePassword(
  employeeId: string,
  newPassword: string,
  resetToken: string,
): Promise<AuthResult> {
  const result = await authRepository.resetPassword(
    employeeId,
    newPassword,
    resetToken,
  );
  if (!result.ok) {
    return { status: false, message: result.error.message };
  }
  return {
    status: true,
    message: 'Password updated successfully!',
    data: result.data.employeeId,
  };
}
