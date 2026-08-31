import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, daysAgoInput, money, OrderListDto, RiderDto, StoreDto, todayInput } from '../api/types';

const STATUSES = ['Available', 'Accepted', 'InProgress', 'Completed', 'Cancelled'];

export default function OperationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [riderId, setRiderId] = useState('');
  const [from, setFrom] = useState(daysAgoInput(7));
  const [to, setTo] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'table'>('board');

  async function load() {
    const qs = new URLSearchParams();
    if (storeId) qs.set('storeId', storeId);
    if (status) qs.set('status', status);
    if (riderId) qs.set('riderId', riderId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const [o, s, r] = await Promise.all([
      api<OrderListDto[]>(`/api/Admin/Orders?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<RiderDto[]>('/api/Admin/Riders'),
    ]);
    if (!o.status) throw new Error(o.message);
    setOrders(o.Data || []);
    setStores(s.Data || []);
    setRiders(r.Data || []);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, OrderListDto[]> = {};
    for (const st of STATUSES) map[st] = [];
    for (const o of orders) {
      (map[o.status] ||= []).push(o);
    }
    return map;
  }, [orders]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h1 className="page-title">Live operations</h1>
          <p className="page-sub">Assigned orders from KDS. Cancel or requeue Available / Cancelled jobs only — this is not a kitchen bump.</p>
        </div>
        <div className="btn-group">
          <button className={`btn btn-sm ${view === 'board' ? 'btn-maison' : 'btn-outline-secondary'}`} type="button" onClick={() => setView('board')}>Board</button>
          <button className={`btn btn-sm ${view === 'table' ? 'btn-maison' : 'btn-outline-secondary'}`} type="button" onClick={() => setView('table')}>Table</button>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="filters">
        <div>
          <label className="form-label">Store</label>
          <select className="form-select form-select-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">All</option>
            {stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select form-select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Rider</label>
          <select className="form-select form-select-sm" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">All</option>
            {riders.map((r) => <option key={r.userId} value={r.userId}>{r.workerId} · {r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">From</label>
          <input className="form-control form-control-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label">To</label>
          <input className="form-control form-control-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-sm btn-maison" type="button" onClick={() => load().catch((e: Error) => setError(e.message))}>Apply</button>
      </div>

      {view === 'board' ? (
        <div className="board">
          {STATUSES.map((st) => (
            <div className="board-col" key={st}>
              <h6>{st} · {grouped[st]?.length ?? 0}</h6>
              {(grouped[st] || []).map((o) => (
                <div className="order-card" key={o.id} onClick={() => navigate(`/operations/${o.id}`)}>
                  <div className="fw-semibold">#{o.orderNo || o.orderId}</div>
                  <div className="small">{customerName(o)}</div>
                  <div className="small text-muted">{o.storeId} · {money(o.orderTotal)}</div>
                  {o.acceptedByWorkerId && <div className="small">{o.acceptedByWorkerId}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Store</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Rider</th>
                  <th>Total</th>
                  <th>Pay</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/operations/${o.id}`)}>
                    <td>#{o.orderNo || o.orderId}</td>
                    <td>{o.storeId}</td>
                    <td>{customerName(o)}</td>
                    <td><span className={`status-pill status-${o.status}`}>{o.status}</span></td>
                    <td>{o.acceptedByWorkerId || '—'}</td>
                    <td>{money(o.orderTotal)}</td>
                    <td>{o.paymentMethod || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
