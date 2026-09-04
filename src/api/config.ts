
const API_HOST = '192.168.100.119';

export const API_BASE_URL = `http://${API_HOST}:5195`;

export const API_PATHS = {
  login: '/api/User/login',
  logout: '/api/User/Logout',
  currentUser: '/api/User/CurrentUser',
  availableOrders: '/api/Order/Available',
  orderById: (id: number | string) => `/api/Order/${id}`,
  notifications: '/api/User/Notifications',
  notificationRead: (id: string | number) => `/api/User/Notifications/${id}/read`,
  notificationsReadAll: '/api/User/Notifications/read-all',
  deviceToken: '/api/User/device-token',
} as const;
