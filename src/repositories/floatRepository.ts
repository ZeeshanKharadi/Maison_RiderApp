import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { ApiResult, fail, ok } from './types';

export type FloatLedgerEntry = {
  id: number;
  amount: number;
  entryType: string;
  status?: string | null;
  reason?: string | null;
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

function createRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchFloatSummary(): Promise<ApiResult<FloatSummary>> {
  try {
    const envelope = await apiEnvelope<FloatSummary>(API_PATHS.floatSummary, {
      auth: true,
    });
    if (!envelope.status || !envelope.Data) {
      return fail('FLOAT_FAILED', envelope.message || 'Failed to load float');
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

export async function acknowledgeFloat(
  issueId: number,
): Promise<ApiResult<FloatLedgerEntry>> {
  try {
    const envelope = await apiEnvelope<FloatLedgerEntry>(
      API_PATHS.floatAcknowledge,
      {
        method: 'POST',
        auth: true,
        body: { issueId, requestId: createRequestId('float-ack') },
      },
    );
    if (!envelope.status || !envelope.Data) {
      return fail('FLOAT_ACK_FAILED', envelope.message || 'Acknowledge failed');
    }
    return ok(envelope.Data);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code, err.message);
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to acknowledge float',
    );
  }
}
