/**
 * Must match the host you use in Swagger, e.g.
 * http://192.168.25.188:5195/swagger
 *
 * - Physical Android device / same Wi‑Fi → PC LAN IP
 * - Android emulator only → use 10.0.2.2 instead
 */
const API_HOST = '192.168.25.105';

export const API_BASE_URL = `http://${API_HOST}:5195`;

export const API_PATHS = {
  login: '/api/User/login',
  availableOrders: '/api/Order/Available',
  orderById: (id: number | string) => `/api/Order/${id}`,
} as const;
