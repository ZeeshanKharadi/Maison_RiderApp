import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, dt, money, OrderDetailDto, OrderLifecycleEventDto } from '../api/types';
import {
  ensureAdminHub,
  isAdminHubConnected,
  onAdminHubReconnect,
  subscribeOrderChanged,
} from '../realtime/adminHub';

const POLL_MS = 30_000;

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

function statusLabel(status?: string | null) {
  if (!status) return '—';
  return STATUS_LABELS[status] || status;
}

function fallbackHistory(order: OrderDetailDto): OrderLifecycleEventDto[] {
  const rows: OrderLifecycleEventDto[] = [];
  if (order.acceptedAt) rows.push({ status: 'Accepted', at: order.acceptedAt });
  if (order.pickedUpAt) rows.push({ status: 'InProgress', at: order.pickedUpAt });
  if (order.completedAt) rows.push({ status: 'Completed', at: order.completedAt });
  return rows;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cash, setCash] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}`);
    if (!res.status) throw new Error(res.message);
    setOrder(res.Data);
    setCash(res.Data.cashCollected != null ? String(res.Data.cashCollected) : '');
  }, [id]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (!Number.isFinite(orderId)) return;

    const run = () => {
      void load().catch(() => {
        /* page owns error UI */
      });
    };

    void ensureAdminHub().catch(() => {
      /* polling covers offline hub */
    });

    const unsubEvent = subscribeOrderChanged((payload) => {
      if (payload.assignedOrderId === orderId) run();
    });
    const unsubReconnect = onAdminHubReconnect(() => run());
    const poll = window.setInterval(() => {
      if (!isAdminHubConnected()) run();
    }, POLL_MS);

    return () => {
      unsubEvent();
      unsubReconnect();
      window.clearInterval(poll);
    };
  }, [load, orderId]);

  async function act(path: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/${path}`, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.status) {
        setError(res.message);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitCancel(e: FormEvent) {
    e.preventDefault();
    const reason = cancelReason.trim();
    if (!reason) {
      setError('Cancel reason is required');
      return;
    }
    await act('cancel', { reason });
    setShowCancel(false);
    setCancelReason('');
  }

  async function saveCashCorrection(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/cash-collected`, {
        method: 'PUT',
        body: JSON.stringify({ cashCollected: cash === '' ? null : Number(cash) }),
      });
      if (!res.status) {
        setError(res.message);
        return;
      }
      setOrder(res.Data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmHandover() {
    setError(null);
    setBusy(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `ho-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      // Omit amount → server hands over remaining collected balance.
      const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/cash-handover`, {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      });
      if (!res.status) {
        setError(res.message);
        return;
      }
      setOrder(res.Data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handover failed');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return <div>{error ? <div className="alert alert-danger">{error}</div> : 'Loading…'}</div>;
  }

  const address = [order.addressNo, order.street, order.city, order.postCode, order.secondaryAddress]
    .filter(Boolean)
    .join(', ');

  const ACTIVE_STATUSES = new Set([
    'Available',
    'Accepted',
    'NavigatingToPickup',
    'ArrivedAtPickup',
    'InProgress',
    'OnTheWay',
    'ArrivedAtCustomer',
    'Delivered',
  ]);
  const canCancel = ACTIVE_STATUSES.has(order.status);
  const canRequeue = order.status === 'Available' || order.status === 'Cancelled';
  const handedOver = !!order.cashHandedOverAt;
  const showLegacyNote = order.cashSemanticsNote === 'LegacyCashCollected_Ambiguous';
  const pay = (order.paymentMethod || '').toLowerCase();
  const isCodLike =
    pay.includes('cash') ||
    pay.includes('cod') ||
    order.expectedCash != null ||
    order.cashCollected != null ||
    order.cash != null;

  return (
    <div>
      <Link to="/operations" className="small text-muted text-decoration-none">← Live operations</Link>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mt-2">
        <div>
          <h1 className="page-title">Order #{order.orderId || order.orderNo}</h1>
          <p className="page-sub">{order.storeId} · <span className={`status-pill status-${order.status}`}>{statusLabel(order.status)}</span></p>
        </div>
        <div className="d-flex gap-2">
          {canCancel && (
            <button
              className="btn btn-outline-danger"
              type="button"
              disabled={busy}
              onClick={() => { setShowCancel(true); setError(null); }}
            >
              Cancel
            </button>
          )}
          {canRequeue && (
            <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={() => void act('requeue')}>
              Requeue
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {order.cancelReason && (
        <div className="alert alert-secondary">Cancel reason: {order.cancelReason}</div>
      )}

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="panel">
            <h2 className="h6">Customer</h2>
            <p className="mb-1 fw-semibold">{customerName(order)}</p>
            <p className="mb-1">{order.phone || '—'}</p>
            <p className="mb-0 text-muted">{address || 'No address'}</p>
            {order.lat != null && order.lng != null && (
              <p className="small mt-2 mb-0">{order.lat}, {order.lng}</p>
            )}
          </div>
          <div className="panel">
            <h2 className="h6">Items</h2>
            <table className="table mb-0">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Size</th></tr>
              </thead>
              <tbody>
                {(order.items || []).map((i, idx) => (
                  <tr key={`${i.itemId}-${idx}`}>
                    <td>{i.description || i.itemId}{i.comment ? <div className="small text-muted">{i.comment}</div> : null}</td>
                    <td>{i.quantity}</td>
                    <td>{i.size || '—'}</td>
                  </tr>
                ))}
                {(order.items || []).length === 0 && <tr><td colSpan={3} className="text-muted">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="panel">
            <h2 className="h6">Payment &amp; COD</h2>
            <p className="mb-1">Total <strong>{money(order.orderTotal)}</strong></p>
            <p className="mb-1">Method {order.paymentMethod || '—'}</p>
            <p className="mb-1">Cash on order {order.cash != null ? money(order.cash) : '—'}</p>
            <hr className="my-2" />
            <p className="mb-1">Expected cash <strong>{order.expectedCash != null ? money(order.expectedCash) : '—'}</strong></p>
            <p className="mb-1">Cash collected <strong>{order.cashCollected != null ? money(order.cashCollected) : '—'}</strong></p>
            <p className="mb-2">
              Cash handed over{' '}
              <strong>
                {handedOver
                  ? `${money(order.cashHandedOverAmount)} · ${dt(order.cashHandedOverAt)}`
                  : '—'}
              </strong>
            </p>
            {showLegacyNote && (
              <div className="alert alert-warning py-2 small mb-3">
                Legacy cash note: <code>{order.cashSemanticsNote}</code> — collected vs handed-over may be ambiguous for this order.
              </div>
            )}
            {isCodLike && !handedOver && (
              <button
                className="btn btn-maison mb-3"
                type="button"
                disabled={busy}
                onClick={() => void confirmHandover()}
              >
                Confirm COD handover
              </button>
            )}
            {isCodLike && (
              <form className="d-flex flex-column gap-2" onSubmit={saveCashCorrection}>
                <label className="form-label mb-0 small text-muted">Admin cash correction</label>
                <div className="d-flex gap-2">
                  <input
                    className="form-control"
                    type="number"
                    step="0.01"
                    placeholder="Corrected cash collected"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                  />
                  <button className="btn btn-outline-dark" type="submit" disabled={busy}>
                    Save correction
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="panel">
            <h2 className="h6">Rider &amp; timestamps</h2>
            <p className="mb-2">
              Rider {order.acceptedByWorkerId || 'Unassigned'}
              {order.acceptedByName ? ` · ${order.acceptedByName}` : ''}
            </p>
            <p className="mb-1 small">Created {dt(order.createdAt)}</p>
            {(order.statusHistory && order.statusHistory.length > 0
              ? order.statusHistory
              : fallbackHistory(order)
            ).map((ev, i) => (
              <p className="mb-1 small" key={`${ev.status}-${ev.at}-${i}`}>
                {statusLabel(ev.status)} {dt(ev.at)}
                {ev.reason ? <span className="text-muted"> · {ev.reason}</span> : null}
              </p>
            ))}
          </div>
        </div>
      </div>

      {showCancel && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <form className="modal-dialog" onSubmit={submitCancel}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Cancel order</h5>
                <button type="button" className="btn-close" onClick={() => setShowCancel(false)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Reason (required)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why is this order being cancelled?"
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCancel(false)}>
                  Back
                </button>
                <button className="btn btn-danger" type="submit" disabled={busy || !cancelReason.trim()}>
                  Confirm cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
