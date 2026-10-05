import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, isHeadOffice } from '../api/client';
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

type FloatRiderBalance = {
  riderUserId: string;
  riderWorkerId?: string | null;
  riderName?: string | null;
  storeId?: string | null;
  outstandingFloat: number;
  pendingAcknowledgmentTotal: number;
};

type FloatStoreBoard = {
  storeId?: string | null;
  totalOutstanding: number;
  pendingAcknowledgmentTotal: number;
  pendingAcknowledgments: FloatEntry[];
  recentActivity: FloatEntry[];
  riders: FloatRiderBalance[];
  asOfUtc: string;
};

type FloatSummary = {
  riderUserId: string;
  riderWorkerId?: string | null;
  riderName?: string | null;
  outstandingFloat: number;
  pendingAcknowledgmentTotal: number;
  pendingAcknowledgments: FloatEntry[];
  recent: FloatEntry[];
  asOfUtc: string;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `Rs. ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reqId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusPill(entry: FloatEntry) {
  if (entry.entryType === 'Return') return { label: 'Returned', className: 'float-pill float-pill-return' };
  if (entry.status === 'PendingAck') return { label: 'Awaiting ack', className: 'float-pill float-pill-pending' };
  if (entry.status === 'Acknowledged') return { label: 'Acknowledged', className: 'float-pill float-pill-ok' };
  return { label: entry.status || entry.entryType, className: 'float-pill' };
}

function riderLabel(r: { riderWorkerId?: string | null; riderName?: string | null; riderUserId?: string }) {
  if (r.riderWorkerId && r.riderName) return `${r.riderWorkerId} · ${r.riderName}`;
  return r.riderWorkerId || r.riderName || r.riderUserId || '—';
}

export default function FloatPage() {
  const { user } = useAuth();
  const headOffice = isHeadOffice(user);
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [board, setBoard] = useState<FloatStoreBoard | null>(null);
  const [riderId, setRiderId] = useState('');
  const [storeFilter, setStoreFilter] = useState(user?.storeId || '');
  const [issueStoreId, setIssueStoreId] = useState(user?.storeId || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<FloatSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedRider = useMemo(
    () => riders.find((r) => r.userId.toLowerCase() === riderId.toLowerCase()) || null,
    [riders, riderId],
  );

  const loadBoard = useCallback(async () => {
    const qs = storeFilter.trim() ? `?storeId=${encodeURIComponent(storeFilter.trim())}` : '';
    const res = await api<FloatStoreBoard>(`/api/Admin/Float/board${qs}`);
    setBoard(res.Data);
  }, [storeFilter]);

  const loadLists = useCallback(async () => {
    const [r, s] = await Promise.all([
      api<RiderDto[]>('/api/Admin/Riders'),
      api<StoreDto[]>('/api/Admin/Stores'),
    ]);
    setRiders(r.Data || []);
    setStores(s.Data || []);
  }, []);

  const loadRider = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      return;
    }
    const res = await api<FloatSummary>(`/api/Admin/Float/${id}/summary`);
    setSummary(res.Data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadLists();
      await loadBoard();
      if (riderId) await loadRider(riderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load float data');
    } finally {
      setLoading(false);
    }
  }, [loadLists, loadBoard, loadRider, riderId]);

  useEffect(() => {
    void refresh();
  }, [storeFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional store filter reload

  useEffect(() => {
    if (!riderId) {
      setSummary(null);
      return;
    }
    loadRider(riderId).catch((e: Error) => setError(e.message));
  }, [riderId, loadRider]);

  // Prefer rider store when selecting a rider
  useEffect(() => {
    if (selectedRider?.storeId) {
      setIssueStoreId(selectedRider.storeId);
    }
  }, [selectedRider]);

  async function mutate(kind: 'issue' | 'return', e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!riderId) {
      setError('Select a rider first');
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a positive amount');
      return;
    }
    const sid = (issueStoreId || selectedRider?.storeId || user?.storeId || '').trim();
    if (!sid) {
      setError('Store is required to issue or return float');
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
      setNotice(res.message || (kind === 'issue' ? 'Float issued — waiting for rider acknowledgment' : 'Return recorded'));
      setAmount('');
      setReason('');
      await Promise.all([loadBoard(), loadRider(riderId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Float update failed');
    } finally {
      setBusy(false);
    }
  }

  const history = summary?.recent?.length ? summary.recent : board?.recentActivity || [];
  const pending = board?.pendingAcknowledgments || [];

  return (
    <div className="float-page">
      <div className="float-hero">
        <div>
          <h1 className="page-title">Change float</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Issue store change money to riders, confirm acknowledgments, and record returns.
            Separate from COD handovers and compensation.
          </p>
        </div>
        <button className="btn btn-outline-secondary" type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Outstanding float</div>
          <div className="kpi-value">{money(board?.totalOutstanding ?? 0)}</div>
          <div className="float-kpi-hint">Acknowledged − returned</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Awaiting acknowledgment</div>
          <div className="kpi-value">{money(board?.pendingAcknowledgmentTotal ?? 0)}</div>
          <div className="float-kpi-hint">{pending.length} open issue{pending.length === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Riders with float</div>
          <div className="kpi-value">{board?.riders?.length ?? 0}</div>
          <div className="float-kpi-hint">With outstanding or pending</div>
        </div>
      </div>

      {headOffice && (
        <div className="panel float-toolbar">
          <label className="float-field">
            <span>Store filter</span>
            <select
              className="form-select"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>
                  {s.storeId} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <p className="float-toolbar-note">
            Tip: acknowledged issues leave the pending list. Use activity below or select a rider for full history.
          </p>
        </div>
      )}

      <div className="float-layout">
        <div className="float-main">
          <div className="panel">
            <div className="float-panel-head">
              <h2 className="h5 mb-0">Pending acknowledgments</h2>
              <span className="float-count">{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <div className="float-empty">
                <strong>No pending acknowledgments</strong>
                <p>
                  Issued float that the rider has already acknowledged appears under Activity and Outstanding.
                  Your Rs. 2,000 test issue is acknowledged — it will not show here.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Rider</th>
                      <th>Store</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((p) => (
                      <tr key={p.id}>
                        <td>{new Date(p.createdAt).toLocaleString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-link p-0 text-start"
                            onClick={() => setRiderId(p.riderUserId)}
                          >
                            {riderLabel(p)}
                          </button>
                        </td>
                        <td><code>{p.storeId}</code></td>
                        <td className="fw-semibold">{money(p.amount)}</td>
                        <td><span className={statusPill(p).className}>{statusPill(p).label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="float-panel-head">
              <h2 className="h5 mb-0">
                {summary ? `History · ${riderLabel(summary)}` : 'Recent activity'}
              </h2>
              {summary && (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRiderId('')}>
                  Show all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="float-empty">
                <strong>No float activity yet</strong>
                <p>
                  {loading
                    ? 'Loading ledger…'
                    : 'Issue float to a rider, or pick a store filter that matches the ledger store (e.g. STORE01).'}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Rider</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Store</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const pill = statusPill(h);
                      return (
                        <tr key={h.id}>
                          <td>{new Date(h.createdAt).toLocaleString()}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link p-0 text-start"
                              onClick={() => setRiderId(h.riderUserId)}
                            >
                              {riderLabel(h)}
                            </button>
                          </td>
                          <td>{h.entryType}</td>
                          <td><span className={pill.className}>{pill.label}</span></td>
                          <td className="fw-semibold">{money(h.amount)}</td>
                          <td><code>{h.storeId}</code></td>
                          <td className="text-muted">{h.reason || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="float-side">
          {(board?.riders?.length ?? 0) > 0 && (
            <div className="panel">
              <h2 className="h5 mb-3">Riders with float</h2>
              <div className="float-rider-list">
                {board!.riders.map((r) => (
                  <button
                    key={r.riderUserId}
                    type="button"
                    className={`float-rider-card ${riderId.toLowerCase() === r.riderUserId.toLowerCase() ? 'active' : ''}`}
                    onClick={() => setRiderId(r.riderUserId)}
                  >
                    <div className="float-rider-card-top">
                      <strong>{riderLabel(r)}</strong>
                      <span>{money(r.outstandingFloat)}</span>
                    </div>
                    <div className="float-rider-card-meta">
                      {r.storeId || '—'}
                      {r.pendingAcknowledgmentTotal > 0
                        ? ` · pending ${money(r.pendingAcknowledgmentTotal)}`
                        : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h2 className="h5 mb-3">Issue / return</h2>
            <form className="float-form" onSubmit={(e) => void mutate('issue', e)}>
              <label className="float-field">
                <span>Rider</span>
                <select
                  className="form-select"
                  value={riderId}
                  onChange={(e) => setRiderId(e.target.value)}
                  required
                >
                  <option value="">Select rider…</option>
                  {riders.map((r) => (
                    <option key={r.userId} value={r.userId}>
                      {r.workerId} — {r.name} ({r.storeId || '—'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="float-field">
                <span>Store</span>
                <select
                  className="form-select"
                  value={issueStoreId}
                  onChange={(e) => setIssueStoreId(e.target.value)}
                  required
                >
                  <option value="">Select store…</option>
                  {stores.map((s) => (
                    <option key={s.storeId} value={s.storeId}>
                      {s.storeId} — {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {summary && (
                <div className="float-selected-summary">
                  <div>
                    <span className="text-muted">Outstanding</span>
                    <strong>{money(summary.outstandingFloat)}</strong>
                  </div>
                  <div>
                    <span className="text-muted">Pending ack</span>
                    <strong>{money(summary.pendingAcknowledgmentTotal)}</strong>
                  </div>
                </div>
              )}

              <label className="float-field">
                <span>Amount</span>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="2000.00"
                  required
                />
              </label>

              <label className="float-field">
                <span>Reason</span>
                <input
                  className="form-control"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional note"
                />
              </label>

              <div className="float-actions">
                <button
                  type="submit"
                  className="btn btn-maison"
                  disabled={busy}
                >
                  Issue float
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={(e) => void mutate('return', e as unknown as FormEvent)}
                >
                  Record return
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
