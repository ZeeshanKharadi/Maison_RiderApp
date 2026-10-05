import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  customerName,
  DeliveryIssueReportDto,
  dt,
  money,
  OrderDetailDto,
  OrderLifecycleEventDto,
} from '../api/types';
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
  IssueReported: 'Issue reported',
  ReturningToStore: 'Returning to store',
  AwaitingStoreReceipt: 'Awaiting store receipt',
  Failed: 'Failed',
  FailureRequested: 'Failure requested',
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
  const [issueNote, setIssueNote] = useState<Record<number, string>>({});
  const [issueBusyId, setIssueBusyId] = useState<number | null>(null);
  const [issueDetails, setIssueDetails] = useState<Record<number, DeliveryIssueReportDto>>({});

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

  async function triageIssue(
    issue: DeliveryIssueReportDto,
    action: 'acknowledge' | 'note' | 'close',
  ) {
    setError(null);
    setIssueBusyId(issue.id);
    try {
      let rowVersion = issueDetails[issue.id]?.rowVersion || issue.rowVersion;
      let working = issueDetails[issue.id] || issue;
      if (!rowVersion) {
        const fetched = await api<DeliveryIssueReportDto>(
          `/api/Admin/DeliveryIssueReports/${issue.id}`,
        );
        if (!fetched.status) {
          setError(fetched.message);
          return;
        }
        working = fetched.Data;
        rowVersion = fetched.Data.rowVersion;
        setIssueDetails((prev) => ({ ...prev, [issue.id]: fetched.Data }));
      }
      if (!rowVersion) {
        setError('Missing concurrency token; refresh the page and try again');
        return;
      }
      const note = (issueNote[issue.id] ?? working.internalNote ?? '').trim();
      const body: { rowVersion: string; internalNote?: string } = { rowVersion };
      if (action === 'note') {
        if (!note) {
          setError('Internal note is required');
          return;
        }
        body.internalNote = note;
      } else if (note) {
        body.internalNote = note;
      }
      const res = await api<DeliveryIssueReportDto>(
        `/api/Admin/DeliveryIssueReports/${issue.id}/${action}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (!res.status) {
        setError(res.message);
        return;
      }
      setIssueDetails((prev) => ({ ...prev, [issue.id]: res.Data }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Triage failed');
    } finally {
      setIssueBusyId(null);
    }
  }

  async function loadIssueHistory(issueId: number) {
    const res = await api<DeliveryIssueReportDto>(`/api/Admin/DeliveryIssueReports/${issueId}`);
    if (!res.status) {
      setError(res.message);
      return;
    }
    setIssueDetails((prev) => ({ ...prev, [issueId]: res.Data }));
    setIssueNote((prev) => ({
      ...prev,
      [issueId]: prev[issueId] ?? res.Data.internalNote ?? '',
    }));
  }

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

  async function failureAct(path: string, note?: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/failure/${path}`, {
        method: 'POST',
        body: JSON.stringify({ note: note || undefined }),
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
    'Failed',
  ]);
  const failureStatus = order.failure?.requestStatus || '';
  const canCancel =
    ACTIVE_STATUSES.has(order.status)
    && failureStatus !== 'Pending'
    && order.status !== 'ReturningToStore'
    && order.status !== 'AwaitingStoreReceipt';
  const canRequeueStatus =
    order.status === 'Available' || order.status === 'Cancelled' || order.status === 'Failed';
  const cashCollectedAmt = Number(order.cashCollected ?? 0);
  const cashOutstanding =
    order.cashOutstandingToStore != null
      ? Number(order.cashOutstandingToStore)
      : Math.max(0, cashCollectedAmt - Number(order.cashHandedOverAmount ?? 0));
  const requeueBlockedByCash =
    order.requeueBlockedByUnreconciledCash === true
    || (order.status === 'Failed' && cashCollectedAmt > 0);
  const canRequeue = canRequeueStatus && !requeueBlockedByCash;
  const handedOver = !!order.cashHandedOverAt;
  const showLegacyNote = order.cashSemanticsNote === 'LegacyCashCollected_Ambiguous';
  const pay = (order.paymentMethod || '').toLowerCase();
  const isCodLike =
    pay.includes('cash') ||
    pay.includes('cod') ||
    order.expectedCash != null ||
    order.cashCollected != null ||
    order.cash != null;
  const handoverComplete =
    isCodLike
    && cashCollectedAmt > 0
    && cashOutstanding <= 0.0001
    && (handedOver || Number(order.cashHandedOverAmount ?? 0) >= cashCollectedAmt);
  const handoverPending =
    isCodLike
    && cashCollectedAmt > 0
    && cashOutstanding > 0.0001;
  const failurePending = failureStatus === 'Pending';
  const canApproveReturn = failurePending;
  const canRejectFailure = failurePending;
  const canConfirmReceipt =
    order.status === 'AwaitingStoreReceipt' && failureStatus === 'RiderReturned';

  return (
    <div>
      <Link to="/operations" className="small text-muted text-decoration-none">← Live operations</Link>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mt-2">
        <div>
          <h1 className="page-title">Order #{order.orderId || order.orderNo}</h1>
          <p className="page-sub">
            {order.storeId} ·{' '}
            <span className={`status-pill status-${order.status}`}>{statusLabel(order.status)}</span>
            {handoverPending && (
              <>
                {' · '}
                <span className="status-pill status-Failed">COD handover pending</span>
              </>
            )}
            {handoverComplete && (
              <>
                {' · '}
                <span className="status-pill status-Completed">COD handed over</span>
              </>
            )}
          </p>
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
          {canRequeueStatus && requeueBlockedByCash && (
            <button className="btn btn-outline-secondary" type="button" disabled title="Cash collected — requeue blocked">
              Requeue blocked
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {requeueBlockedByCash && (
        <div className="alert alert-warning">
          <strong>Requeue blocked — cash was collected on this Failed order</strong>
          <div className="mt-1">
            Cash collected: <strong>{money(order.cashCollected)}</strong>
            {' · '}handed over: <strong>{money(order.cashHandedOverAmount)}</strong>
            {' · '}outstanding: <strong>{money(cashOutstanding)}</strong>
          </div>
          <div className="small mt-1 mb-0">
            {order.requeueBlockReason
              || 'Requeue stays blocked even after full COD handover. A later rider must not inherit or overwrite this order’s cash fields. Cancel the order, or wait for a per-rider cash ledger. Amounts are preserved.'}
          </div>
        </div>
      )}
      {order.cancelReason && (
        <div className="alert alert-secondary">Cancel reason: {order.cancelReason}</div>
      )}
      {order.failure?.requestStatus && (
        <div className={`alert ${order.failure.cashCollectedWarning ? 'alert-warning' : 'alert-info'}`}>
          <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start">
            <div>
              <strong>Failed delivery · {order.failure.requestStatus}</strong>
              <div className="small mt-1">
                {order.failure.reasonLabel || order.failure.reasonCode || '—'}
                {order.failure.note ? ` — ${order.failure.note}` : ''}
              </div>
              {order.failure.decisionNote && (
                <div className="small">Decision: {order.failure.decisionNote}</div>
              )}
              {order.failure.cashCollectedWarning && (
                <div className="fw-semibold mt-2">
                  Cash collected {money(order.failure.cashCollected)} — not rider earnings.
                  Use COD handover below; do not zero collected amounts.
                </div>
              )}
              <div className="small text-muted mt-1">
                Closing an issue report does not resolve this failure. Cancel/requeue only after store receipt (Failed).
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {canRejectFailure && (
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void failureAct('reject', 'Continue delivery')}
                >
                  Reject request
                </button>
              )}
              {canApproveReturn && (
                <button
                  className="btn btn-maison btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void failureAct('approve-return', 'Return to store')}
                >
                  Approve return to store
                </button>
              )}
              {canConfirmReceipt && (
                <button
                  className="btn btn-dark btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void failureAct('confirm-store-receipt')}
                >
                  Confirm store receipt
                </button>
              )}
            </div>
          </div>
        </div>
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
            <p className="mb-1">
              COD handover status{' '}
              <strong>
                {handoverComplete
                  ? 'Handed over successfully'
                  : handoverPending
                    ? 'Pending'
                    : isCodLike
                      ? 'Awaiting collection'
                      : '—'}
              </strong>
            </p>
            <p className="mb-2">
              Cash handed over{' '}
              <strong>
                {handedOver || Number(order.cashHandedOverAmount ?? 0) > 0
                  ? `${money(order.cashHandedOverAmount)} · ${dt(order.cashHandedOverAt) || '—'}`
                  : '—'}
              </strong>
              {handoverPending ? (
                <span className="text-muted"> · outstanding {money(cashOutstanding)}</span>
              ) : null}
            </p>
            {showLegacyNote && (
              <div className="alert alert-warning py-2 small mb-3">
                Legacy cash note: <code>{order.cashSemanticsNote}</code> — collected vs handed-over may be ambiguous for this order.
              </div>
            )}
            {handoverPending && (
              <button
                className="btn btn-maison mb-3"
                type="button"
                disabled={busy}
                onClick={() => void confirmHandover()}
              >
                Confirm COD handover
              </button>
            )}
            {handoverComplete && (
              <div className="alert alert-success py-2 small mb-3">
                COD handover accepted — cash handed over successfully for this order.
              </div>
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
          <div className="panel">
            <h2 className="h6">Delivery issues</h2>
            <p className="small text-muted">
              Triage does not cancel, complete, requeue, or change COD/cash.
            </p>
            {(order.issueReports && order.issueReports.length > 0) ? (
              order.issueReports.map((iss) => {
                const detail = issueDetails[iss.id] || iss;
                const st = detail.status || 'New';
                const busyIssue = issueBusyId === iss.id;
                return (
                  <div className="border rounded p-2 mb-2" key={iss.id}>
                    <div className="d-flex justify-content-between gap-2 flex-wrap">
                      <div>
                        <div className="fw-semibold">
                          {iss.reasonLabel || iss.reasonCode}{' '}
                          <span className="badge text-bg-secondary">{detail.statusLabel || st}</span>
                        </div>
                        {iss.note ? <div className="small">{iss.note}</div> : null}
                        <div className="small text-muted">
                          {iss.riderWorkerId || iss.riderName || 'Rider'} · {dt(iss.createdAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void loadIssueHistory(iss.id)}
                      >
                        History
                      </button>
                    </div>
                    <label className="form-label small mt-2 mb-0">Internal note (admins only)</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={issueNote[iss.id] ?? detail.internalNote ?? ''}
                      onChange={(e) =>
                        setIssueNote((prev) => ({ ...prev, [iss.id]: e.target.value }))
                      }
                      disabled={st === 'Closed' || busyIssue}
                    />
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      {st === 'New' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-maison"
                          disabled={busyIssue}
                          onClick={() => void triageIssue(detail, 'acknowledge')}
                        >
                          Acknowledge
                        </button>
                      )}
                      {(st === 'New' || st === 'Acknowledged') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark"
                          disabled={busyIssue}
                          onClick={() => void triageIssue(detail, 'note')}
                        >
                          Save note
                        </button>
                      )}
                      {st === 'Acknowledged' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busyIssue}
                          onClick={() => void triageIssue(detail, 'close')}
                        >
                          Close issue
                        </button>
                      )}
                    </div>
                    {detail.history && detail.history.length > 0 && (
                      <div className="mt-2 small">
                        <div className="fw-semibold">History</div>
                        {detail.history.map((h) => (
                          <div key={h.id} className="text-muted">
                            {h.action} {h.newStatus ? `→ ${h.newStatus}` : ''} ·{' '}
                            {h.actorWorkerId || h.actorName || h.actorType} · {dt(h.at)}
                            {h.internalNote ? ` · ${h.internalNote}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="mb-0 small text-muted">No rider issue reports on this order.</p>
            )}
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
