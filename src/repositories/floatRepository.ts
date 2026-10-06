import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { ApiResult, fail, ok } from './types';

export type FloatLedgerEntry = {
  id: number;
  amount: number;
  entryType: string;
  status?: string | null;
  reason?: string | null;
  storeId?: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
};

export type FloatSummary = {
  outstandingFloat: number;
  pendingAcknowledgmentTotal: number;
  pendingAcknowledgments: FloatLedgerEntry[];
  recent: FloatLedgerEntry[];
  asOfUtc: string;
};

type PendingAckMap = Record<string, { issueId: number; requestId: string }>;

function createRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pendingAckKey(accountId: string) {
  return `maison.rider.float.pendingAck.${accountId}`;
}

async function resolveAccountId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  try {
    const raw = await AsyncStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id || null;
  } catch {
    return null;
  }
}

async function loadPendingAcks(accountId: string): Promise<PendingAckMap> {
  try {
    const raw = await AsyncStorage.getItem(pendingAckKey(accountId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PendingAckMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function savePendingAcks(
  accountId: string,
  map: PendingAckMap,
): Promise<boolean> {
  try {
    await AsyncStorage.setItem(pendingAckKey(accountId), JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export async function fetchFloatSummary(
  accountId?: string | null,
): Promise<ApiResult<FloatSummary>> {
  try {
    const envelope = await apiEnvelope<FloatSummary>(API_PATHS.floatSummary, {
      auth: true,
    });
    if (!envelope.status || !envelope.Data) {
      return fail('FLOAT_FAILED', envelope.message || 'Failed to load float');
    }

    const uid = await resolveAccountId(accountId);
    if (uid) {
      const pendingIds = new Set(
        (envelope.Data.pendingAcknowledgments || []).map(p => p.id),
      );
      const map = await loadPendingAcks(uid);
      let changed = false;
      for (const key of Object.keys(map)) {
        if (!pendingIds.has(Number(key))) {
          delete map[key];
          changed = true;
        }
      }
      if (changed) await savePendingAcks(uid, map);
    }

    return ok(envelope.Data);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code, err.message);
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach float API',
    );
  }
}

/**
 * Acknowledge a pending float issue.
 * Persists requestId + payload before send (account-scoped) so retries after
 * app restart reuse the same operation. Does not send if persistence fails.
 */
export async function acknowledgeFloat(
  issueId: number,
  accountId?: string | null,
): Promise<ApiResult<FloatLedgerEntry>> {
  const uid = await resolveAccountId(accountId);
  if (!uid) {
    return fail('FLOAT_ACK_FAILED', 'Sign in required to acknowledge float');
  }

  const map = await loadPendingAcks(uid);
  const key = String(issueId);
  let requestId = map[key]?.requestId;
  if (!requestId) {
    requestId = createRequestId('float-ack');
    map[key] = { issueId, requestId };
    const saved = await savePendingAcks(uid, map);
    if (!saved) {
      return fail(
        'FLOAT_ACK_FAILED',
        'Could not save acknowledgment for retry. Not sent.',
      );
    }
  }

  try {
    const envelope = await apiEnvelope<FloatLedgerEntry>(
      API_PATHS.floatAcknowledge,
      {
        method: 'POST',
        auth: true,
        body: { issueId, requestId },
        headers: { 'Idempotency-Key': requestId },
      },
    );
    if (!envelope.status || !envelope.Data) {
      const msg = envelope.message || 'Acknowledge failed';
      if (/already acknowledged|not found|conflicting/i.test(msg)) {
        delete map[key];
        await savePendingAcks(uid, map);
      }
      return fail('FLOAT_ACK_FAILED', msg);
    }
    delete map[key];
    await savePendingAcks(uid, map);
    return ok(envelope.Data);
  } catch (err) {
    // Uncertain (network) — keep pending record for retry.
    if (err instanceof HttpError) {
      if (
        err.statusCode >= 400 &&
        err.statusCode < 500 &&
        err.statusCode !== 408
      ) {
        delete map[key];
        await savePendingAcks(uid, map);
      }
      return fail(err.code, err.message);
    }
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to acknowledge float',
    );
  }
}
