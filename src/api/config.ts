const API_HOST = '192.168.25.18';

export const API_BASE_URL = `http://${API_HOST}:8086`;

export const API_PATHS = {
  login: '/api/User/login',
  logout: '/api/User/Logout',
  currentUser: '/api/User/CurrentUser',
  forgetPassword: '/api/User/ForgetPassword',
  verifyOtp: '/api/User/VerifyOtp',
  updatePassword: '/api/User/UpdatePassword',
  availableOrders: '/api/Order/Available',
  activeOrders: '/api/Order/Active',
  orderHistory: '/api/Order/History',
  orderPerformance: '/api/Order/Performance',
  availability: '/api/Order/availability',
  riderLocation: '/api/Order/location',
  finance: '/api/Order/Finance',
  financeSummary: '/api/Order/Finance/summary',
  orderById: (id: number | string) => `/api/Order/${id}`,
  orderStatus: (id: number | string) => `/api/Order/${id}/status`,
  orderReject: (id: number | string) => `/api/Order/${id}/reject`,
  notifications: '/api/User/Notifications',
  notificationRead: (id: string | number) => `/api/User/Notifications/${id}/read`,
  notificationsReadAll: '/api/User/Notifications/read-all',
  deviceToken: '/api/User/device-token',
} as const;
