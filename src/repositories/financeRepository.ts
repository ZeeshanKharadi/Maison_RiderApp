import { API_PATHS } from '../api/config';
import { apiEnvelope, HttpError } from '../api/httpClient';
import { ApiResult, fail, ok } from './types';

export type RiderFinanceSummary = {
  cashCollectedTotal: number;
  cashHandedOverTotal: number;
  cashHeld: number;
  codShortageTotal: number;
  completedCashOrders: number;
  legacyAmbiguousCount: number;
  calculatedCompensation: number | null;
  compensationAvailable: boolean;
  compensationNote?: string | null;
  payoutMode?: string | null;
  from?: string | null;
  to?: string | null;
  isPeriodFilter: boolean;
  asOfUtc: string;
};

export type RiderFinanceTransaction = {
  assignedOrderId: number;
  orderId: string;
  orderNo: string;
  type: string;
  amount: number;
  note?: string | null;
  at: string;
  status: string;
};

export type RiderFinancePage = {
  summary: RiderFinanceSummary;
  transactions: RiderFinanceTransaction[];
  page: number;
  pageSize: number;
  totalTransactions: number;
};

export async function fetchFinancePage(opts?: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}): Promise<ApiResult<RiderFinancePage>> {
  try {
    const q = new URLSearchParams();
    if (opts?.page) q.set('page', String(opts.page));
    if (opts?.pageSize) q.set('pageSize', String(opts.pageSize));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    const path = qs ? `${API_PATHS.finance}?${qs}` : API_PATHS.finance;

    const envelope = await apiEnvelope<RiderFinancePage>(path, { auth: true });
    if (!envelope.status || !envelope.Data) {
      return fail('FINANCE_FAILED', envelope.message || 'Failed to load finance');
    }
    return ok(envelope.Data);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code, err.message);
    return fail(
      'NETWORK',
      err instanceof Error ? err.message : 'Unable to reach finance API',
    );
  }
}
