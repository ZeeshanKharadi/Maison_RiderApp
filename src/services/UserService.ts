const DEMO_OTP = '123456';
const DEMO_EMPLOYEE_ID = 'RD-9921';
const DEMO_PASSWORD = 'password123';

export interface AuthResult {
  status: boolean;
  message?: string;
  data?: string;
}

export async function loginUser(
  employeeId: string,
  password: string,
): Promise<AuthResult> {
  await delay(800);
  if (
    employeeId.trim().toLowerCase() === DEMO_EMPLOYEE_ID.toLowerCase() &&
    password === DEMO_PASSWORD
  ) {
    return {
      status: true,
      data: JSON.stringify({
        id: DEMO_EMPLOYEE_ID,
        name: 'Alex Rider',
        email: 'alex.rider@rapiddelivery.com',
      }),
    };
  }
  if (employeeId.trim() && password.trim()) {
    return {
      status: true,
      data: JSON.stringify({
        id: employeeId.trim(),
        name: 'Alex Rider',
        email: 'rider@rapiddelivery.com',
      }),
    };
  }
  return { status: false, message: 'Invalid Employee ID or Password' };
}

export async function sendOtp(employeeId: string): Promise<AuthResult> {
  await delay(600);
  if (!employeeId.trim()) {
    return { status: false, message: 'Please enter your Employee ID' };
  }
  return {
    status: true,
    message: 'A verification code has been sent to your registered phone!',
    data: employeeId.trim(),
  };
}

export async function verifyOtp(
  employeeId: string,
  otp: string,
): Promise<AuthResult> {
  await delay(600);
  if (otp === DEMO_OTP) {
    return { status: true, message: 'OTP verified successfully!' };
  }
  return { status: false, message: 'Invalid OTP. Use 123456 for demo.' };
}

export async function updatePassword(
  employeeId: string,
  newPassword: string,
): Promise<AuthResult> {
  await delay(600);
  if (!newPassword || newPassword.length < 6) {
    return {
      status: false,
      message: 'Password must be at least 6 characters',
    };
  }
  return {
    status: true,
    message: 'Password updated successfully!',
    data: employeeId,
  };
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
