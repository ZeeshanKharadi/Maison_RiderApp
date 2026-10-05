import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { RiderDto, StoreDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';

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

export default function FloatPage() {
  const { user } = useAuth();
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [pending, setPending] = useState<FloatEntry[]>([]);
  const [riderId, setRiderId] = useState('');
  const [storeId, setStoreId] = useState(user?.storeId || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<FloatSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    const [r, s, p] = await Promise.all([
      api<RiderDto[]>('/api/Admin/Riders'),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<FloatEntry[]>('/api/Admin/Float/pending'),
    ]);
    setRiders(r.Data || []);
    setStores(s.Data || []);
    setPending(p.Data || []);
  }, []);

  const loadRider = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      return;
    }
    const res = await api<FloatSummary>(`/api/Admin/Float/${id}/summary`);
    if (!res.status) throw new Error(res.message || 'Failed to load float');
    setSummary(res.Data);
  }, []);

  useEffect(() => {
    loadLists().catch((e: Error) => setError(e.message));
  }, [loadLists]);

  useEffect(() => {
    if (!riderId) return;
    loadRider(riderId).catch((e: Error) => setError(e.message));
  }, [riderId, loadRider]);

  async function mutate(kind: 'issue' | 'return', e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!riderId) {
      setError('Select a rider');
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
    setBusy(true);
    try {
      const path = kind === 'issue' ? '/api/Admin/Float/issue' : '/api/Admin/Float/return';
      const res = await api<FloatEntry>(path, {
        method: 'POST',
        body: JSON.stringify({
          riderUserId: riderId,
          storeId: sid,
          amount: n,
          reason: reason.trim() || undefined,
          requestId: reqId(kind),
        }),
      });
      if (!res.status) throw new Error(res.message || 'Float update failed');
      setNotice(res.message || 'Saved');
      setAmount('');
      setReason('');
      await Promise.all([loadLists(), loadRider(riderId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Float update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Change float</h1>
      <p className="page-sub">
        Issue float to riders, track pending acknowledgments, and record returns.
        Separate from COD handovers and compensation.
      </p>
      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="panel">
        <h2 className="panel-title">Pending acknowledgments</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Rider</th>
              <th>Store</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.riderWorkerId || p.riderName || p.riderUserId}</td>
                <td>{p.storeId}</td>
                <td>{money(p.amount)}</td>
                <td>{p.status}</td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={5}>No pending float acknowledgments.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="form-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label>
            Rider
            <select value={riderId} onChange={(e) => setRiderId(e.target.value)}>
              <option value="">Select rider…</option>
              {riders.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.workerId} — {r.name} ({r.storeId || '—'})
                </option>
              ))}
            </select>
          </label>
          <label>
            Store
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Select store…</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>
                  {s.storeId} — {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {summary && (
        <div className="kpi-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-label">Outstanding float</div>
            <div className="kpi-value">{money(summary.outstandingFloat)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Pending ack</div>
            <div className="kpi-value">{money(summary.pendingAcknowledgmentTotal)}</div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">Issue / return</h2>
        <form className="form-row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>
            Amount
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 180 }}>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={(e) => void mutate('issue', e as unknown as FormEvent)}>
            Issue float
          </button>
          <button type="button" className="btn" disabled={busy} onClick={(e) => void mutate('return', e as unknown as FormEvent)}>
            Record return
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">History</h2>
        {!riderId ? (
          <p className="page-sub">Select a rider to view history.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Actor</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.recent || []).map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.createdAt).toLocaleString()}</td>
                  <td>{h.entryType}</td>
                  <td>{h.status || '—'}</td>
                  <td>{money(h.amount)}</td>
                  <td>{h.actorName || '—'}</td>
                  <td>{h.reason || '—'}</td>
                </tr>
              ))}
              {(!summary?.recent || summary.recent.length === 0) && (
                <tr><td colSpan={6}>No float transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
