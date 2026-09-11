import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { getToken } from '../api/client';

export type OrderChangedPayload = {
  assignedOrderId: number;
  orderId: string;
  status: string;
  storeId?: string | null;
  at?: string;
};

export type RiderAvailabilityChangedPayload = {
  riderUserId: string;
  isOnline: boolean;
  storeId?: string | null;
  at?: string;
};

export type AdminNotificationCreatedPayload = {
  notificationId: number;
  title: string;
  storeId?: string | null;
  at?: string;
};

type AnyHandler = (...args: unknown[]) => void;

let connection: HubConnection | null = null;
let startPromise: Promise<HubConnection> | null = null;
const reconnectListeners = new Set<() => void>();

function hubUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  const base = env && env.length > 0 ? env.replace(/\/$/, '') : '';
  return `${base}/hubs/admin`;
}

export function isAdminHubConnected(): boolean {
  return connection?.state === HubConnectionState.Connected;
}

export async function ensureAdminHub(): Promise<HubConnection> {
  if (connection?.state === HubConnectionState.Connected) {
    return connection;
  }
  if (startPromise) return startPromise;

  // Let SignalR finish its own reconnect loop; callers still get polling fallback.
  if (
    connection &&
    (connection.state === HubConnectionState.Connecting ||
      connection.state === HubConnectionState.Reconnecting)
  ) {
    return connection;
  }

  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl(hubUrl(), {
        accessTokenFactory: () => getToken() ?? '',
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.onreconnected(() => {
      for (const cb of reconnectListeners) {
        try {
          cb();
        } catch {
          /* ignore listener errors */
        }
      }
    });
  }

  startPromise = connection
    .start()
    .then(() => connection!)
    .finally(() => {
      startPromise = null;
    });

  return startPromise;
}

export async function stopAdminHub(): Promise<void> {
  const conn = connection;
  connection = null;
  startPromise = null;
  if (conn) {
    try {
      await conn.stop();
    } catch {
      /* ignore */
    }
  }
}

/** Fired after SignalR automatic reconnect succeeds — use to re-fetch. */
export function onAdminHubReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => {
    reconnectListeners.delete(cb);
  };
}

function subscribeEvent(event: string, handler: AnyHandler): () => void {
  let disposed = false;
  let bound: HubConnection | null = null;

  void ensureAdminHub()
    .then((conn) => {
      if (disposed) return;
      bound = conn;
      conn.on(event, handler);
    })
    .catch(() => {
      /* hub may be unreachable; polling fallback covers this */
    });

  return () => {
    disposed = true;
    bound?.off(event, handler);
  };
}

export function subscribeOrderChanged(handler: (payload: OrderChangedPayload) => void): () => void {
  return subscribeEvent('OrderChanged', handler as AnyHandler);
}

export function subscribeRiderAvailabilityChanged(
  handler: (payload: RiderAvailabilityChangedPayload) => void,
): () => void {
  return subscribeEvent('RiderAvailabilityChanged', handler as AnyHandler);
}

export function subscribeAdminNotificationCreated(
  handler: (payload: AdminNotificationCreatedPayload) => void,
): () => void {
  return subscribeEvent('AdminNotificationCreated', handler as AnyHandler);
}

/**
 * Optional store group join. Server already adds Hoffice + claim storeId on connect.
 * Call when filtering a store not on the JWT claims.
 */
export async function joinStore(storeId: string): Promise<void> {
  if (!storeId.trim()) return;
  const conn = await ensureAdminHub();
  await conn.invoke('JoinStore', storeId.trim());
}
