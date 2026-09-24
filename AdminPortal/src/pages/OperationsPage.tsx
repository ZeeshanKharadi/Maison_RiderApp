import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, daysAgoInput, money, OrderListDto, OrderRejectionDto, RiderDto, StoreDto, todayInput } from '../api/types';
import { useLiveRefresh } from '../realtime/useLiveRefresh';

const STATUSES = [
  'Available',
  'Accepted',
  'NavigatingToPickup',
  'ArrivedAtPickup',
  'InProgress',
  'OnTheWay',
  'ArrivedAtCustomer',
  'Delivered',
  'Completed',
  'Cancelled',
  'Rejected',
];

const STATUS_LABELS: Record<string, string> = {
  Available: 'Available',
  Accepted: 'Accepted',
  NavigatingToPickup: 'To pickup',
  ArrivedAtPickup: 'At pickup',
  InProgress: 'Picked up',
  OnTheWay: 'On the way',
  ArrivedAtCustomer: 'At customer',
  Delivered: 'Delivered',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Rejected: 'Rejected',
};

export default function OperationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListDto[]>([]);
  const [rejections, setRejections] = useState<OrderRejectionDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [riderId, setRiderId] = useState('');
  const [from, setFrom] = useState(daysAgoInput(7));
  const [to, setTo] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'table'>('board');

  const filtersRef = useRef({ storeId, status, riderId, from, to });
  filtersRef.current = { storeId, status, riderId, from, to };

  const load = useCallback(async () => {
    const f = filtersRef.current;
    const qs = new URLSearchParams();
    if (f.storeId) qs.set('storeId', f.storeId);
    if (f.status && f.status !== 'Rejected') qs.set('status', f.status);
    if (f.riderId) qs.set('riderId', f.riderId);
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);

    const rejQs = new URLSearchParams();
    if (f.storeId) rejQs.set('storeId', f.storeId);
    if (f.from) rejQs.set('from', f.from);
    if (f.to) rejQs.set('to', f.to);

    const [o, s, r, rej] = await Promise.all([
      api<OrderListDto[]>(`/api/Admin/Orders?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<RiderDto[]>('/api/Admin/Riders'),
      api<OrderRejectionDto[]>(`/api/Admin/OrderRejections?${rejQs.toString()}`),
    ]);
    if (!o.status) throw new Error(o.message);
    setOrders(o.Data || []);
    setStores(s.Data || []);
    setRiders(r.Data || []);
    setRejections(rej.status ? rej.Data || [] : []);
    setError(null);
  }, []);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  useLiveRefresh(load);

  const filteredRejections = useMemo(() => {
    let list = rejections;
    if (riderId) list = list.filter((x) => x.riderUserId === riderId);
    if (status && status !== 'Rejected') return [];
    if (status === 'Rejected' || !status) return list;
    return list;
  }, [rejections, riderId, status]);

  const grouped = useMemo(() => {
    const map: Record<string, OrderListDto[]> = {};
    for (const st of STATUSES) map[st] = [];
    for (const o of orders) {
      if (status === 'Rejected') continue;
      (map[o.status] ||= []).push(o);
    }
    return map;
  }, [orders, status]);

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
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
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
              <h6>
                {STATUS_LABELS[st] || st} ·{' '}
                {st === 'Rejected' ? filteredRejections.length : grouped[st]?.length ?? 0}
              </h6>
              {st === 'Rejected'
                ? filteredRejections.map((rej) => (
                    <div
                      className="order-card"
                      key={`rej-${rej.id}`}
                      onClick={() => navigate(`/operations/${rej.assignedOrderId}`)}
                    >
                      <div className="fw-semibold">#{rej.orderId || rej.orderNo}</div>
                      <div className="small">{rej.riderWorkerId || rej.riderName || 'Rider'}</div>
                      <div className="small text-muted">{rej.storeId}{rej.reason ? ` · ${rej.reason}` : ''}</div>
                      <div className="small text-muted">{new Date(rej.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                : (grouped[st] || []).map((o) => (
                    <div className="order-card" key={o.id} onClick={() => navigate(`/operations/${o.id}`)}>
                      <div className="fw-semibold">#{o.orderId || o.orderNo}</div>
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
                {status !== 'Rejected' &&
                  orders.map((o) => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/operations/${o.id}`)}>
                      <td>#{o.orderId || o.orderNo}</td>
                      <td>{o.storeId}</td>
                      <td>{customerName(o)}</td>
                      <td><span className={`status-pill status-${o.status}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                      <td>{o.acceptedByWorkerId || '—'}</td>
                      <td>{money(o.orderTotal)}</td>
                      <td>{o.paymentMethod || '—'}</td>
                    </tr>
                  ))}
                {(status === 'Rejected' || !status) &&
                  filteredRejections.map((rej) => (
                    <tr
                      key={`rej-${rej.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/operations/${rej.assignedOrderId}`)}
                    >
                      <td>#{rej.orderId || rej.orderNo}</td>
                      <td>{rej.storeId}</td>
                      <td>—</td>
                      <td><span className="status-pill status-Rejected">Rejected</span></td>
                      <td>{rej.riderWorkerId || rej.riderName || '—'}</td>
                      <td>—</td>
                      <td>{rej.reason || '—'}</td>
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
