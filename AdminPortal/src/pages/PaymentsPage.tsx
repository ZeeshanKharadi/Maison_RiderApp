import { useEffect, useState } from 'react';
import { api, apiBlob } from '../api/client';
import { daysAgoInput, money, PaymentsDashboard, RiderDto, StoreDto, todayInput } from '../api/types';

export default function PaymentsPage() {
  const [data, setData] = useState<PaymentsDashboard | null>(null);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [storeId, setStoreId] = useState('');
  const [riderId, setRiderId] = useState('');
  const [from, setFrom] = useState(daysAgoInput(7));
  const [to, setTo] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (storeId) qs.set('storeId', storeId);
    if (riderId) qs.set('riderId', riderId);
    const [p, s, r] = await Promise.all([
      api<PaymentsDashboard>(`/api/Admin/Payments?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<RiderDto[]>('/api/Admin/Riders'),
    ]);
    if (!p.status) throw new Error(p.message);
    setData(p.Data);
    setStores(s.Data || []);
    setRiders(r.Data || []);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportQs() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (storeId) qs.set('storeId', storeId);
    if (riderId) qs.set('riderId', riderId);
    return qs.toString();
  }

  return (
    <div>
      <h1 className="page-title">Payments &amp; settlements</h1>
      <p className="page-sub">Cash vs card vs other, cash still held by riders, and payout due from portal settings.</p>
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
        <div>
          <label className="form-label">Rider</label>
          <select className="form-select form-select-sm" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">All</option>
            {riders.map((r) => <option key={r.userId} value={r.userId}>{r.workerId}</option>)}
          </select>
        </div>
        <button className="btn btn-sm btn-maison" type="button" onClick={() => load().catch((e: Error) => setError(e.message))}>Apply</button>
        <button className="btn btn-sm btn-outline-dark" type="button" onClick={() => void apiBlob(`/api/Admin/Payments/export?${exportQs()}&format=csv`, 'settlements.csv')}>CSV</button>
        <button className="btn btn-sm btn-outline-dark" type="button" onClick={() => void apiBlob(`/api/Admin/Payments/export?${exportQs()}&format=xls`, 'settlements.xls')}>Excel</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Completed sales</div><div className="kpi-value">{money(data?.totalSales)}</div></div>
        <div className="kpi"><div className="kpi-label">Cash</div><div className="kpi-value">{money(data?.cashTotal)}</div></div>
        <div className="kpi"><div className="kpi-label">Card</div><div className="kpi-value">{money(data?.cardTotal)}</div></div>
        <div className="kpi"><div className="kpi-label">Other</div><div className="kpi-value">{money(data?.otherTotal)}</div></div>
        <div className="kpi"><div className="kpi-label">Cash to collect</div><div className="kpi-value">{money(data?.cashToCollect)}</div></div>
        <div className="kpi"><div className="kpi-label">Cash collected</div><div className="kpi-value">{money(data?.cashCollected)}</div></div>
      </div>

      <div className="panel">
        <h2 className="h5 mb-3">Rider settlements</h2>
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Store</th>
                <th>Deliveries</th>
                <th>Cancelled</th>
                <th>Sales</th>
                <th>Cash held</th>
                <th>Payout due</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byRider || []).map((r) => (
                <tr key={r.riderId}>
                  <td>{r.workerId} · {r.name}</td>
                  <td>{r.storeId || '—'}</td>
                  <td>{r.deliveryCount}</td>
                  <td>{r.cancelledCount}</td>
                  <td>{money(r.salesTotal)}</td>
                  <td>{money(r.cashHeld)}</td>
                  <td>{money(r.payoutDue)}</td>
                </tr>
              ))}
              {(data?.byRider || []).length === 0 && <tr><td colSpan={7} className="text-muted">No rider activity in this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="panel">
            <h2 className="h5 mb-3">By day</h2>
            <table className="table mb-0">
              <thead><tr><th>Date</th><th>Orders</th><th>Total</th><th>Cash</th><th>Card</th></tr></thead>
              <tbody>
                {(data?.byDay || []).map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.orderCount}</td>
                    <td>{money(d.total)}</td>
                    <td>{money(d.cash)}</td>
                    <td>{money(d.card)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="panel">
            <h2 className="h5 mb-3">By store</h2>
            <table className="table mb-0">
              <thead><tr><th>Store</th><th>Orders</th><th>Total</th></tr></thead>
              <tbody>
                {(data?.byStore || []).map((s) => (
                  <tr key={s.storeId}>
                    <td>{s.storeId}</td>
                    <td>{s.orderCount}</td>
                    <td>{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
