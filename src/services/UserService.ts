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
    message: 'A verification code has been sent to your registered phone!',
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
  return { status: true, message: 'OTP verified successfully!' };
}

export async function updatePassword(
  employeeId: string,
  newPassword: string,
): Promise<AuthResult> {
  const result = await authRepository.resetPassword(employeeId, newPassword);
  if (!result.ok) {
    return { status: false, message: result.error.message };
  }
  return {
    status: true,
    message: 'Password updated successfully!',
    data: result.data.employeeId,
  };
}
