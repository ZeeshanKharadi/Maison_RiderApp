import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, daysAgoInput, money, DeliveryIssueReportDto, OrderListDto, OrderRejectionDto, RiderDto, StoreDto, todayInput } from '../api/types';
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
  ReturningToStore: 'Returning to store',
  AwaitingStoreReceipt: 'Awaiting store receipt',
  Failed: 'Failed',
};

export default function OperationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListDto[]>([]);
  const [rejections, setRejections] = useState<OrderRejectionDto[]>([]);
  const [issues, setIssues] = useState<DeliveryIssueReportDto[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [issueStatus, setIssueStatus] = useState('Open');
  const [issueQuery, setIssueQuery] = useState('');
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [riderId, setRiderId] = useState('');
  const [from, setFrom] = useState(daysAgoInput(7));
  const [to, setTo] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'table'>('board');

  const filtersRef = useRef({ storeId, status, riderId, from, to, issueStatus, issueQuery });
  filtersRef.current = { storeId, status, riderId, from, to, issueStatus, issueQuery };

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

    const issQs = new URLSearchParams(rejQs);
    if (f.issueStatus) issQs.set('status', f.issueStatus);
    if (f.issueQuery.trim()) issQs.set('q', f.issueQuery.trim());
    if (f.issueStatus === 'Closed') issQs.set('includeClosed', 'true');

    const [o, s, r, rej, iss] = await Promise.all([
      api<OrderListDto[]>(`/api/Admin/Orders?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<RiderDto[]>('/api/Admin/Riders'),
      api<OrderRejectionDto[]>(`/api/Admin/OrderRejections?${rejQs.toString()}`),
      api<DeliveryIssueReportDto[]>(`/api/Admin/DeliveryIssueReports?${issQs.toString()}`),
    ]);
    if (!o.status) throw new Error(o.message);
    setOrders(o.Data || []);
    setStores(s.Data || []);
    setRiders(r.Data || []);
    setRejections(rej.status ? rej.Data || [] : []);
    if (!iss.status) {
      setIssues([]);
      setIssuesError(iss.message || 'Failed to load delivery issue reports');
    } else {
      setIssues(iss.Data || []);
      setIssuesError(null);
    }
    setIssuesLoaded(true);
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

  const filteredIssues = useMemo(() => {
    let list = issues;
    if (riderId) list = list.filter((x) => x.riderUserId === riderId);
    return list;
  }, [issues, riderId]);

  const openIssueCount = useMemo(
    () => filteredIssues.filter((x) => x.status === 'New' || x.status === 'Acknowledged').length,
    [filteredIssues],
  );

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

      {(issuesLoaded || issuesError) && (
        <div className="panel mb-3 border-start border-4 border-warning">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <h2 className="h6 mb-1">
                Delivery issues
                {!issuesError ? ` · ${filteredIssues.length}` : ''}
                {!issuesError && issueStatus === 'Open' ? ` open (${openIssueCount})` : ''}
              </h2>
              <p className="small text-muted mb-0">
                New and Acknowledged issues need ops attention. Closing an issue does not change the delivery,
                COD, or cash. Date range {from || '…'} → {to || '…'} (default 7 days); capped at 500 rows —
                not a complete historical queue.
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <div>
                <label className="form-label small mb-0">Issue status</label>
                <select
                  className="form-select form-select-sm"
                  value={issueStatus}
                  onChange={(e) => setIssueStatus(e.target.value)}
                >
                  <option value="Open">Open (New + Acknowledged)</option>
                  <option value="New">New</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="form-label small mb-0">Search issues</label>
                <input
                  className="form-control form-control-sm"
                  placeholder="Order, rider, reason…"
                  value={issueQuery}
                  onChange={(e) => setIssueQuery(e.target.value)}
                />
              </div>
              <button
                className="btn btn-sm btn-outline-dark"
                type="button"
                onClick={() => load().catch((e: Error) => setError(e.message))}
              >
                Apply issue filters
              </button>
            </div>
          </div>
          {issuesError ? (
            <div className="alert alert-danger mb-0">{issuesError}</div>
          ) : filteredIssues.length === 0 ? (
            <p className="mb-0 small text-muted">No issue reports for these filters.</p>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Order</th>
                    <th>Store</th>
                    <th>Rider</th>
                    <th>Reason</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((iss) => (
                    <tr
                      key={iss.id}
                      style={{ cursor: 'pointer' }}
                      className={iss.status === 'New' ? 'table-warning' : iss.status === 'Acknowledged' ? 'table-info' : undefined}
                      onClick={() => navigate(`/operations/${iss.assignedOrderId}`)}
                    >
                      <td>
                        <span className="fw-semibold">{iss.statusLabel || iss.status || 'New'}</span>
                      </td>
                      <td>
                        <div className="fw-semibold">#{iss.orderId || iss.orderNo}</div>
                        {iss.orderStatus ? (
                          <div className="small text-muted">{iss.orderStatus}</div>
                        ) : null}
                      </td>
                      <td>{iss.storeId}</td>
                      <td>{iss.riderWorkerId || iss.riderName || 'Rider'}</td>
                      <td>
                        {iss.reasonLabel || iss.reasonCode}
                        {iss.note ? <div className="small text-muted">{iss.note}</div> : null}
                      </td>
                      <td className="small">{new Date(iss.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!issuesError && filteredIssues.length >= 500 && (
            <p className="small text-warning mb-0 mt-2">
              Showing the maximum of 500 reports for this range — older or additional reports may exist.
            </p>
          )}
        </div>
      )}

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
