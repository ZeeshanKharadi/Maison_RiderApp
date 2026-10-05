import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, daysAgoInput, money, DeliveryIssueReportDto, DeliveryIssueReportPageDto, OrderListDto, OrderRejectionDto, RiderDto, StoreDto, todayInput } from '../api/types';
import {
  actionNeededCountLabel,
  actionNeededCounts,
  actionNeededQueryParams,
  groupOrdersByBoardStatus,
  isActionNeededStatus,
  OPS_BOARD_STATUSES,
  statusLabel,
  toActionNeededSnapshot,
  type ActionNeededSnapshot,
} from '../operations/boardStatuses';
import { useLiveRefresh } from '../realtime/useLiveRefresh';
import { mergeIssuePages } from '../operations/issuePages';

const ISSUE_PAGE_SIZE = 50;

const EMPTY_ACTION: ActionNeededSnapshot = {
  ReturningToStore: 0,
  AwaitingStoreReceipt: 0,
  total: 0,
  isComplete: true,
};

function isOpenIssueStatus(status: string): boolean {
  return status === 'Open' || status === 'New' || status === 'Acknowledged';
}

export default function OperationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListDto[]>([]);
  const [rejections, setRejections] = useState<OrderRejectionDto[]>([]);
  const [issues, setIssues] = useState<DeliveryIssueReportDto[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [issuesPage, setIssuesPage] = useState(1);
  const [issuesTotalCount, setIssuesTotalCount] = useState(0);
  const [issuesHasMore, setIssuesHasMore] = useState(false);
  const [issuesDateFiltered, setIssuesDateFiltered] = useState(false);
  const [issuesLoadingMore, setIssuesLoadingMore] = useState(false);
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
  const [needsAction, setNeedsAction] = useState<ActionNeededSnapshot>(EMPTY_ACTION);

  const filtersRef = useRef({ storeId, status, riderId, from, to, issueStatus, issueQuery });
  filtersRef.current = { storeId, status, riderId, from, to, issueStatus, issueQuery };

  const issuesPageRef = useRef(1);
  issuesPageRef.current = issuesPage;
  const issuesLoadingMoreRef = useRef(false);
  issuesLoadingMoreRef.current = issuesLoadingMore;

  const buildIssueQuery = useCallback((page: number) => {
    const f = filtersRef.current;
    const issQs = new URLSearchParams();
    if (f.storeId) issQs.set('storeId', f.storeId);
    if (f.issueStatus) issQs.set('status', f.issueStatus);
    if (f.issueQuery.trim()) issQs.set('q', f.issueQuery.trim());
    // Open queue: no date filter (all New/Acknowledged for the store).
    // Closed / historical: use board date range.
    if (!isOpenIssueStatus(f.issueStatus)) {
      if (f.from) issQs.set('from', f.from);
      if (f.to) issQs.set('to', f.to);
      if (f.issueStatus === 'Closed') issQs.set('includeClosed', 'true');
    }
    issQs.set('page', String(page));
    issQs.set('pageSize', String(ISSUE_PAGE_SIZE));
    return issQs;
  }, []);

  const loadActionNeeded = useCallback(async (scopedStoreId: string) => {
    try {
      const [ret, awaitReceipt] = await Promise.all(
        (['ReturningToStore', 'AwaitingStoreReceipt'] as const).map((st) =>
          api<OrderListDto[]>(
            `/api/Admin/Orders?${actionNeededQueryParams(scopedStoreId, st).toString()}`,
          ),
        ),
      );
      if (!ret.status || !awaitReceipt.status) {
        return null;
      }
      return toActionNeededSnapshot(
        {
          ReturningToStore: (ret.Data || []).length,
          AwaitingStoreReceipt: (awaitReceipt.Data || []).length,
          total: (ret.Data || []).length + (awaitReceipt.Data || []).length,
        },
        true,
      );
    } catch {
      return null;
    }
  }, []);

  const applyIssuePage = useCallback(
    (pageData: DeliveryIssueReportPageDto, append: boolean) => {
      const items = pageData.items || [];
      setIssues((prev) => {
        if (!append) return items;
        return mergeIssuePages([prev, items]);
      });
      setIssuesPage(pageData.page);
      setIssuesTotalCount(pageData.totalCount);
      setIssuesHasMore(pageData.hasMore);
      setIssuesDateFiltered(pageData.dateFilterApplied);
      setIssuesError(null);
    },
    [],
  );

  /** Replace issues with page 1 only (filters / store Apply / explicit refresh). */
  const reloadIssuesFromStart = useCallback(async () => {
    const iss = await api<DeliveryIssueReportPageDto>(
      `/api/Admin/DeliveryIssueReports?${buildIssueQuery(1).toString()}`,
    );
    if (!iss.status || !iss.Data) {
      setIssues([]);
      setIssuesTotalCount(0);
      setIssuesHasMore(false);
      setIssuesPage(1);
      setIssuesError(iss.message || 'Failed to load delivery issue reports');
      return;
    }
    applyIssuePage(iss.Data, false);
  }, [buildIssueQuery, applyIssuePage]);

  /**
   * Live refresh: re-fetch pages 1..N already loaded so the manager keeps their
   * scroll/paging window. While Load more is in flight, only refresh totalCount.
   */
  const refreshIssuesPreservingPages = useCallback(async () => {
    const pagesLoaded = Math.max(1, issuesPageRef.current);

    if (issuesLoadingMoreRef.current) {
      const meta = await api<DeliveryIssueReportPageDto>(
        `/api/Admin/DeliveryIssueReports?${buildIssueQuery(1).toString()}`,
      );
      if (meta.status && meta.Data) {
        setIssuesTotalCount(meta.Data.totalCount);
        setIssuesDateFiltered(meta.Data.dateFilterApplied);
        setIssuesHasMore(
          pagesLoaded * ISSUE_PAGE_SIZE < meta.Data.totalCount,
        );
      }
      return;
    }

    const results = await Promise.all(
      Array.from({ length: pagesLoaded }, (_, i) =>
        api<DeliveryIssueReportPageDto>(
          `/api/Admin/DeliveryIssueReports?${buildIssueQuery(i + 1).toString()}`,
        ),
      ),
    );

    const failed = results.find((r) => !r.status || !r.Data);
    if (failed) {
      // Keep existing rows rather than partially replacing the paging window.
      const anyOk = results.find((r) => r.status && r.Data);
      if (anyOk?.Data) {
        setIssuesTotalCount(anyOk.Data.totalCount);
        setIssuesDateFiltered(anyOk.Data.dateFilterApplied);
        setIssuesHasMore(pagesLoaded * ISSUE_PAGE_SIZE < anyOk.Data.totalCount);
      }
      if (issuesPageRef.current <= 1) {
        setIssuesError(
          failed.message || 'Failed to refresh delivery issue reports',
        );
      }
      return;
    }

    const pageDatas = results.map((r) => r.Data!);
    const merged = mergeIssuePages(pageDatas.map((p) => p.items));
    const last = pageDatas[pageDatas.length - 1]!;
    const totalCount = last.totalCount;
    setIssues(merged);
    setIssuesTotalCount(totalCount);
    setIssuesDateFiltered(last.dateFilterApplied);
    setIssuesHasMore(pagesLoaded * ISSUE_PAGE_SIZE < totalCount);
    setIssuesPage(pagesLoaded);
    setIssuesError(null);
  }, [buildIssueQuery]);

  const loadBoard = useCallback(async () => {
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

    const [o, s, r, rej, actionSnap] = await Promise.all([
      api<OrderListDto[]>(`/api/Admin/Orders?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
      api<RiderDto[]>('/api/Admin/Riders'),
      api<OrderRejectionDto[]>(`/api/Admin/OrderRejections?${rejQs.toString()}`),
      loadActionNeeded(f.storeId),
    ]);
    if (!o.status) throw new Error(o.message);
    const boardOrders = o.Data || [];
    setOrders(boardOrders);
    setStores(s.Data || []);
    setRiders(r.Data || []);
    setRejections(rej.status ? rej.Data || [] : []);
    setNeedsAction(
      actionSnap ?? toActionNeededSnapshot(actionNeededCounts(boardOrders), false),
    );
    setError(null);
  }, [loadActionNeeded]);

  /** Full reload; resetIssues=true for Apply / store-filter changes. */
  const load = useCallback(
    async (opts?: { resetIssues?: boolean }) => {
      const resetIssues = opts?.resetIssues !== false;
      await loadBoard();
      if (resetIssues) {
        await reloadIssuesFromStart();
      } else {
        await refreshIssuesPreservingPages();
      }
      setIssuesLoaded(true);
    },
    [loadBoard, reloadIssuesFromStart, refreshIssuesPreservingPages],
  );

  const loadMoreIssues = useCallback(async () => {
    if (issuesLoadingMore || !issuesHasMore) return;
    setIssuesLoadingMore(true);
    try {
      const nextPage = issuesPage + 1;
      const iss = await api<DeliveryIssueReportPageDto>(
        `/api/Admin/DeliveryIssueReports?${buildIssueQuery(nextPage).toString()}`,
      );
      if (!iss.status || !iss.Data) {
        setIssuesError(iss.message || 'Failed to load more issue reports');
        return;
      }
      applyIssuePage(iss.Data, true);
    } finally {
      setIssuesLoadingMore(false);
    }
  }, [
    issuesLoadingMore,
    issuesHasMore,
    issuesPage,
    buildIssueQuery,
    applyIssuePage,
  ]);

  useEffect(() => {
    void load({ resetIssues: true }).catch((e: Error) => setError(e.message));
    // Mount only — live refresh uses resetIssues:false; Apply handlers reset explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto SignalR / poll: refresh board + preserve loaded issue pages.
  useLiveRefresh(() => load({ resetIssues: false }));

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

  const issuesCountLabel = useMemo(() => {
    if (issuesError) return '';
    const loaded = filteredIssues.length;
    const total = issuesTotalCount;
    if (riderId && loaded !== total) {
      return ` · ${loaded} loaded (rider filter) of ${total} matching`;
    }
    if (issuesHasMore || loaded < total) {
      return ` · ${loaded} of ${total} loaded`;
    }
    return ` · ${total}`;
  }, [issuesError, filteredIssues.length, issuesTotalCount, issuesHasMore, riderId]);

  const grouped = useMemo(
    () => groupOrdersByBoardStatus(orders, status),
    [orders, status],
  );

  const applyStatusFilter = useCallback((nextStatus: string) => {
    setStatus(nextStatus);
    filtersRef.current = { ...filtersRef.current, status: nextStatus };
    // Board status filter only — keep issue paging window.
    void load({ resetIssues: false }).catch((e: Error) => setError(e.message));
  }, [load]);

  const applyIssueFilters = useCallback(() => {
    void load({ resetIssues: true }).catch((e: Error) => setError(e.message));
  }, [load]);

  const applyBoardFilters = useCallback(() => {
    // Store / date / rider Apply — reset issue list to page 1 under new scope.
    void load({ resetIssues: true }).catch((e: Error) => setError(e.message));
  }, [load]);

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
                {issuesCountLabel}
                {!issuesError && isOpenIssueStatus(issueStatus)
                  ? ` · open on screen ${openIssueCount}`
                  : ''}
              </h2>
              <p className="small text-muted mb-0">
                Open queue shows all New and Acknowledged issues for your store (any report date).
                Closing an issue does not change delivery, COD, or cash.
                {issuesDateFiltered
                  ? ` Closed/history uses date range ${from || '…'} → ${to || '…'}.`
                  : ' Date filters apply only to Closed / historical views.'}
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
                onClick={applyIssueFilters}
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
          {!issuesError && (
            <div className="d-flex flex-wrap gap-2 align-items-center mt-2">
              <span className="small text-muted">
                Loaded {filteredIssues.length}
                {issuesTotalCount > 0 ? ` of ${issuesTotalCount}` : ''} matching
                {issuesDateFiltered ? ' (date-filtered)' : ' (open queue, all dates)'}
              </span>
              {issuesHasMore ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-dark"
                  disabled={issuesLoadingMore}
                  onClick={() => void loadMoreIssues()}
                >
                  {issuesLoadingMore ? 'Loading…' : 'Load more issues'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {needsAction.total > 0 && (
        <div className="alert alert-warning d-flex flex-wrap gap-3 align-items-center mb-3">
          <strong>
            Needs action · {actionNeededCountLabel(needsAction.total, needsAction.isComplete)}
          </strong>
          <button
            type="button"
            className={`btn btn-sm ${status === 'ReturningToStore' ? 'btn-maison' : 'btn-outline-dark'}`}
            onClick={() => applyStatusFilter('ReturningToStore')}
          >
            Returning to store ·{' '}
            {actionNeededCountLabel(needsAction.ReturningToStore, needsAction.isComplete)}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${status === 'AwaitingStoreReceipt' ? 'btn-maison' : 'btn-outline-dark'}`}
            onClick={() => applyStatusFilter('AwaitingStoreReceipt')}
          >
            Awaiting store receipt ·{' '}
            {actionNeededCountLabel(needsAction.AwaitingStoreReceipt, needsAction.isComplete)}
          </button>
          {!needsAction.isComplete ? (
            <span className="small mb-0 text-muted">
              Counts are from the current board filters — a full store-scoped total was unavailable.
            </span>
          ) : (
            <span className="small mb-0">
              Store-scoped live totals (ignore board status / date / rider filters). Open a card to
              confirm store receipt or handle a Failed order.
            </span>
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
            {OPS_BOARD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
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
        <button className="btn btn-sm btn-maison" type="button" onClick={applyBoardFilters}>Apply</button>
      </div>

      {view === 'board' ? (
        <div className="board">
          {OPS_BOARD_STATUSES.map((st) => {
            const boardCount = st === 'Rejected' ? filteredRejections.length : grouped[st]?.length ?? 0;
            const completeForAction =
              st === 'ReturningToStore'
                ? needsAction.ReturningToStore
                : st === 'AwaitingStoreReceipt'
                  ? needsAction.AwaitingStoreReceipt
                  : null;
            const columnFiltered =
              completeForAction != null
              && (needsAction.isComplete
                ? boardCount !== completeForAction
                : true);
            return (
              <div
                className={`board-col${isActionNeededStatus(st) ? ' board-col-action' : ''}`}
                key={st}
              >
                <h6>
                  {statusLabel(st)} ·{' '}
                  {columnFiltered
                    ? actionNeededCountLabel(boardCount, false)
                    : boardCount}
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
            );
          })}
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
                      <td><span className={`status-pill status-${o.status}`}>{statusLabel(o.status)}</span></td>
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
