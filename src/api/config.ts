
const API_HOST = '192.168.25.198';

export const API_BASE_URL = `http://${API_HOST}:5195`;

export const API_PATHS = {
  login: '/api/User/login',
  currentUser: '/api/User/CurrentUser',
  availableOrders: '/api/Order/Available',
  orderById: (id: number | string) => `/api/Order/${id}`,
} as const;
