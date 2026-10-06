import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { RiderDto, StoreDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  clearPendingFloatMutation,
  loadPendingFloatMutation,
  mutationFingerprint,
  savePendingFloatMutation,
  type PendingFloatMutation,
} from '../operations/floatPending';

type FloatEntry = {
  id: number;
  riderUserId: string;
  riderWorkerId?: string | null;
  riderName?: string | null;
  storeId: string;
  amount: number;
  entryType: string;
  status?: string | null;
  actorName?: string | null;
  reason?: string | null;
  requestId: string;
  createdAt: string;
  acknowledgedAt?: string | null;
};

type FloatSummary = {
  riderUserId: string;
  outstandingFloat: number;
  pendingAcknowledgmentTotal: number;
  pendingAcknowledgments: FloatEntry[];
  recent: FloatEntry[];
  asOfUtc: string;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `Rs. ${Number(n).toFixed(2)}`;
}

function reqId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDefinitiveFloatError(message: string | undefined): boolean {
  return /conflicting|exceeds|not found|required|assigned to this store|only (issue|receive)/i.test(
    message || '',
  );
}

function statusBadge(entry: FloatEntry) {
  if (entry.entryType === 'Return') {
    return <span className="status-pill status-Completed">Returned</span>;
  }
  if (entry.status === 'PendingAck') {
    return <span className="status-pill status-Failed">Pending ack</span>;
  }
  if (entry.status === 'Acknowledged') {
    return <span className="status-pill status-Completed">Acknowledged</span>;
  }
  return <span className="status-pill">{entry.status || entry.entryType}</span>;
}

function riderLabel(e: FloatEntry) {
  return e.riderWorkerId || e.riderName || e.riderUserId;
}

export default function FloatPage() {
  const { user } = useAuth();
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [pending, setPending] = useState<FloatEntry[]>([]);
  const [history, setHistory] = useState<FloatEntry[]>([]);
  const [riderId, setRiderId] = useState('');
  const [storeId, setStoreId] = useState(user?.storeId || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<FloatSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const accountId = user?.id || '';

  const loadBoard = useCallback(async () => {
    const qs = new URLSearchParams();
    if (storeId.trim()) qs.set('storeId', storeId.trim());
    if (riderId) qs.set('riderId', riderId);
    qs.set('take', '100');

    const [r, s, p, h] = await Promise.all([
      api<RiderDto[]>('/api/Admin/Riders'),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<FloatEntry[]>(`/api/Admin/Float/pending${storeId.trim() ? `?storeId=${encodeURIComponent(storeId.trim())}` : ''}`),
      api<FloatEntry[]>(`/api/Admin/Float/history?${qs.toString()}`),
    ]);
    if (!p.status) throw new Error(p.message || 'Failed to load pending float');
    if (!h.status) throw new Error(h.message || 'Failed to load float history');
    setRiders(r.Data || []);
    setStores(s.Data || []);
    setPending(p.Data || []);
    setHistory(h.Data || []);
  }, [storeId, riderId]);

  const loadRiderSummary = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      return;
    }
    const res = await api<FloatSummary>(`/api/Admin/Float/${id}/summary`);
    if (!res.status) throw new Error(res.message || 'Failed to load float balance');
    setSummary(res.Data);
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await loadBoard();
      if (riderId) await loadRiderSummary(riderId);
      else setSummary(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load float');
    } finally {
      setLoading(false);
    }
  }, [loadBoard, loadRiderSummary, riderId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Restore unresolved mutation after browser refresh (same account).
  useEffect(() => {
    if (!accountId) return;
    const pendingOp = loadPendingFloatMutation(accountId);
    if (!pendingOp) return;
    setRiderId(pendingOp.riderUserId);
    setStoreId(pendingOp.storeId);
    setAmount(String(pendingOp.amount));
    setReason(pendingOp.reason || '');
    setNotice(
      `Unresolved ${pendingOp.kind} ready to retry (same request). Confirm to resend.`,
    );
  }, [accountId]);

  useEffect(() => {
    // Clear stale rider KPIs immediately when selection changes.
    setSummary(null);
    if (!riderId) return;
    loadRiderSummary(riderId).catch((e: Error) => setError(e.message));
  }, [riderId, loadRiderSummary]);

  const filteredPending = useMemo(() => {
    if (!riderId) return pending;
    return pending.filter((p) => p.riderUserId === riderId);
  }, [pending, riderId]);

  const filteredHistory = useMemo(() => {
    if (!riderId) return history;
    return history.filter((h) => h.riderUserId === riderId);
  }, [history, riderId]);

  async function mutate(kind: 'issue' | 'return', e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!accountId) {
      setError('Sign in required');
      return;
    }
    if (!riderId) {
      setError('Select a rider for issue / return');
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a positive amount');
      return;
    }
    const sid = storeId.trim() || user?.storeId || '';
    if (!sid) {
      setError('storeId is required');
      return;
    }

    const draft: Omit<PendingFloatMutation, 'requestId'> = {
      kind,
      riderUserId: riderId,
      storeId: sid,
      amount: n,
      reason: reason.trim() || undefined,
    };
    const existing = loadPendingFloatMutation(accountId);
    let pendingOp: PendingFloatMutation;
    if (existing) {
      const existingFp = mutationFingerprint({
        kind: existing.kind,
        riderUserId: existing.riderUserId,
        storeId: existing.storeId,
        amount: existing.amount,
        reason: existing.reason,
      });
      if (existingFp !== mutationFingerprint(draft)) {
        setError(
          `Unresolved ${existing.kind} still pending. Retry that operation — form changes cannot replace it.`,
        );
        setRiderId(existing.riderUserId);
        setStoreId(existing.storeId);
        setAmount(String(existing.amount));
        setReason(existing.reason || '');
        return;
      }
      pendingOp = existing;
    } else {
      pendingOp = { ...draft, requestId: reqId(kind) };
      if (!savePendingFloatMutation(accountId, pendingOp)) {
        setError('Could not save operation for retry. Not sent.');
        return;
      }
    }

    setBusy(true);
    try {
      await loadBoard();
      if (pendingOp.riderUserId) await loadRiderSummary(pendingOp.riderUserId);

      const path = pendingOp.kind === 'issue' ? '/api/Admin/Float/issue' : '/api/Admin/Float/return';
      const res = await api<FloatEntry>(path, {
        method: 'POST',
        body: JSON.stringify({
          riderUserId: pendingOp.riderUserId,
          storeId: pendingOp.storeId,
          amount: pendingOp.amount,
          reason: pendingOp.reason,
          requestId: pendingOp.requestId,
        }),
      });
      if (!res.status) {
        if (isDefinitiveFloatError(res.message)) {
          clearPendingFloatMutation(accountId);
        }
        throw new Error(res.message || 'Float update failed');
      }
      clearPendingFloatMutation(accountId);
      setNotice(res.message || 'Saved');
      setAmount('');
      setReason('');
      await loadBoard();
      await loadRiderSummary(pendingOp.riderUserId);
    } catch (err) {
      // Network / uncertain: keep persisted requestId + payload.
      setError(err instanceof Error ? err.message : 'Float update failed');
      try {
        await loadBoard();
        if (pendingOp.riderUserId) await loadRiderSummary(pendingOp.riderUserId);
      } catch {
        /* ignore reconcile errors */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h1 className="page-title">Change float</h1>
          <p className="page-sub">
            Issue float to riders, track pending acknowledgments, and record returns.
            Separate from COD handovers and compensation.
          </p>
        </div>
        <button
          className="btn btn-sm btn-outline-dark"
          type="button"
          disabled={loading || busy}
          onClick={() => void refreshAll()}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="filters">
        <div>
          <label className="form-label">Store</label>
          <select
            className="form-select form-select-sm"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">All authorized</option>
            {stores.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Rider (optional filter)</label>
          <select
            className="form-select form-select-sm"
            value={riderId}
            onChange={(e) => setRiderId(e.target.value)}
          >
            <option value="">All riders</option>
            {riders.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.workerId} · {r.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-sm btn-maison"
          type="button"
          disabled={loading}
          onClick={() => void refreshAll()}
        >
          Apply
        </button>
      </div>

      {loading && pending.length === 0 && history.length === 0 ? (
        <p className="text-muted">Loading float records…</p>
      ) : null}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Pending acknowledgments</div>
          <div className="kpi-value">{filteredPending.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pending ack total</div>
          <div className="kpi-value">
            {money(filteredPending.reduce((s, p) => s + Number(p.amount || 0), 0))}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            {riderId ? 'Outstanding (selected rider / store)' : 'Outstanding'}
          </div>
          <div className="kpi-value">
            {riderId ? money(summary?.outstandingFloat) : '—'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">History rows</div>
          <div className="kpi-value">{filteredHistory.length}</div>
        </div>
      </div>

      <div className="panel mb-3">
        <h2 className="h5 mb-3">Pending acknowledgments ({filteredPending.length})</h2>
        <p className="small text-muted mb-2">
          Issued but not yet acknowledged — not included in outstanding float until the rider confirms.
        </p>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Issued</th>
                <th>Rider</th>
                <th>Store</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredPending.map((p) => (
                <tr key={p.id}>
                  <td className="small">{new Date(p.createdAt).toLocaleString()}</td>
                  <td>{riderLabel(p)}</td>
                  <td>{p.storeId}</td>
                  <td>{money(p.amount)}</td>
                  <td>{statusBadge(p)}</td>
                  <td>{p.actorName || '—'}</td>
                  <td>{p.reason || '—'}</td>
                </tr>
              ))}
              {!loading && filteredPending.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No pending float acknowledgments for this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel mb-3">
        <h2 className="h5 mb-3">Issue / return</h2>
        <p className="small text-muted mb-2">
          Rider selection is required for actions. Returns are limited to outstanding float for the originating store.
        </p>
        <form
          className="row g-2 align-items-end"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="col-md-2">
            <label className="form-label">Amount</label>
            <input
              className="form-control form-control-sm"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Reason</label>
            <input
              className="form-control form-control-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="col-auto">
            <button
              type="button"
              className="btn btn-sm btn-maison"
              disabled={busy || !riderId}
              onClick={(e) => void mutate('issue', e)}
            >
              Issue float
            </button>
          </div>
          <div className="col-auto">
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              disabled={busy || !riderId}
              onClick={(e) => void mutate('return', e)}
            >
              Record return
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2 className="h5 mb-3">
          Recent float history{riderId ? ' (filtered)' : ' (all riders in scope)'}
        </h2>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rider</th>
                <th>Store</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Ack date</th>
                <th>Actor</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h) => (
                <tr key={h.id}>
                  <td className="small">{new Date(h.createdAt).toLocaleString()}</td>
                  <td>{riderLabel(h)}</td>
                  <td>{h.storeId}</td>
                  <td>{h.entryType}</td>
                  <td>{statusBadge(h)}</td>
                  <td>{money(h.amount)}</td>
                  <td className="small">
                    {h.acknowledgedAt
                      ? new Date(h.acknowledgedAt).toLocaleString()
                      : '—'}
                  </td>
                  <td>{h.actorName || '—'}</td>
                  <td>{h.reason || '—'}</td>
                </tr>
              ))}
              {!loading && filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-muted">
                    No float transactions for this scope yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
