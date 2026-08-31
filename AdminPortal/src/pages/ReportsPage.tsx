import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { daysAgoInput, ReportsDto, StoreDto, todayInput } from '../api/types';

export default function ReportsPage() {
  const [data, setData] = useState<ReportsDto | null>(null);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState(daysAgoInput(7));
  const [to, setTo] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (storeId) qs.set('storeId', storeId);
    const [r, s] = await Promise.all([
      api<ReportsDto>(`/api/Admin/Reports?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
    ]);
    if (!r.status) throw new Error(r.message);
    setData(r.Data);
    setStores(s.Data || []);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avg = data?.avgDeliveryTime?.avgMinutes;
  const avgLabel = avg == null ? 'n/a (no Accepted→Completed timestamps yet)' : `${avg.toFixed(1)} min`;

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Orders per rider per day, completed vs cancelled, and average delivery time.</p>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filters">
        <div>
          <label className="form-label">From</label>
          <input className="form-control form-control-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label">To</label>
          <input className="form-control form-control-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Store</label>
          <select className="form-select form-select-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">All</option>
            {stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn btn-sm btn-maison" type="button" onClick={() => load().catch((e: Error) => setError(e.message))}>Apply</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Completed</div><div className="kpi-value">{data?.status.completed ?? '—'}</div></div>
        <div className="kpi"><div className="kpi-label">Cancelled</div><div className="kpi-value">{data?.status.cancelled ?? '—'}</div></div>
        <div className="kpi"><div className="kpi-label">Available</div><div className="kpi-value">{data?.status.available ?? '—'}</div></div>
        <div className="kpi"><div className="kpi-label">Avg Accepted → Completed</div><div className="kpi-value" style={{ fontSize: '1.1rem' }}>{avgLabel}</div></div>
      </div>

      <div className="panel">
        <h2 className="h5 mb-3">Orders per rider per day</h2>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rider</th>
                <th>Completed</th>
                <th>Cancelled</th>
                <th>Accepted</th>
                <th>In progress</th>
              </tr>
            </thead>
            <tbody>
              {(data?.perRiderPerDay || []).map((row) => (
                <tr key={`${row.date}-${row.riderId}`}>
                  <td>{row.date}</td>
                  <td>{row.workerId} · {row.name}</td>
                  <td>{row.completed}</td>
                  <td>{row.cancelled}</td>
                  <td>{row.accepted}</td>
                  <td>{row.inProgress}</td>
                </tr>
              ))}
              {(data?.perRiderPerDay || []).length === 0 && (
                <tr><td colSpan={6} className="text-muted">No rider-attributed orders in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
