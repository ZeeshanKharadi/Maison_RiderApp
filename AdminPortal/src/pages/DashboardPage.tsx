import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import {
  DeliveryIssueReportPageDto,
  LiveSummary,
  money,
  OrderListDto,
} from '../api/types';
import { actionNeededQueryParams } from '../operations/boardStatuses';
import { isHandoverPending } from '../operations/cashHandover';
import { useLiveRefresh } from '../realtime/useLiveRefresh';

type LiveRiderRow = {
  hasLocation: boolean;
  isStale: boolean;
};

/** Successful count, failed refresh, or not loaded yet. */
type AttentionCount = number | 'unavailable' | null;

type AttentionCounts = {
  openIssues: AttentionCount;
  awaitingStore: AttentionCount;
  cashHandover: AttentionCount;
  outdatedLocation: AttentionCount;
};

const EMPTY_ATTENTION: AttentionCounts = {
  openIssues: null,
  awaitingStore: null,
  cashHandover: null,
  outdatedLocation: null,
};

const OVERVIEW_POLL_MS = 30_000;

function settledOk<T>(
  result: PromiseSettledResult<Awaited<ReturnType<typeof api<T>>>>,
): Awaited<ReturnType<typeof api<T>>> | null {
  if (result.status !== 'fulfilled') return null;
  return result.value.status ? result.value : null;
}

export default function DashboardPage() {
  const [data, setData] = useState<LiveSummary | null>(null);
  const [attention, setAttention] = useState<AttentionCounts>(EMPTY_ATTENTION);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const gen = ++loadGenRef.current;

    try {
      do {
        queuedRef.current = false;

        const [
          summaryResult,
          issuesResult,
          awaitingResult,
          completedResult,
          failedResult,
          liveMapResult,
        ] = await Promise.allSettled([
          api<LiveSummary>('/api/Admin/Orders/summary'),
          api<DeliveryIssueReportPageDto>(
            '/api/Admin/DeliveryIssueReports?status=Open&page=1&pageSize=1',
          ),
          api<OrderListDto[]>(
            `/api/Admin/Orders?${actionNeededQueryParams('', 'AwaitingStoreReceipt').toString()}`,
          ),
          api<OrderListDto[]>('/api/Admin/Orders?status=Completed'),
          api<OrderListDto[]>('/api/Admin/Orders?status=Failed'),
          api<LiveRiderRow[]>('/api/Admin/Riders/live-map'),
        ]);

        if (!mountedRef.current || gen !== loadGenRef.current) return;

        const summary = settledOk(summaryResult);
        if (summary?.Data) {
          setData(summary.Data);
          setError(null);
        } else if (summaryResult.status === 'fulfilled' && !summaryResult.value.status) {
          setError(summaryResult.value.message || 'Could not refresh overview totals');
        } else if (summaryResult.status === 'rejected') {
          setError('Could not refresh overview totals');
        }

        const issues = settledOk(issuesResult);
        const awaiting = settledOk(awaitingResult);
        const completed = settledOk(completedResult);
        const failed = settledOk(failedResult);
        const liveMap = settledOk(liveMapResult);

        const cashOk = !!completed && !!failed;
        const cashOrders = cashOk
          ? [...(completed.Data || []), ...(failed.Data || [])]
          : [];

        setAttention({
          openIssues:
            issues?.Data != null ? issues.Data.totalCount : 'unavailable',
          awaitingStore: awaiting
            ? (awaiting.Data || []).length
            : 'unavailable',
          cashHandover: cashOk
            ? cashOrders.filter(isHandoverPending).length
            : 'unavailable',
          outdatedLocation: liveMap
            ? (liveMap.Data || []).filter((r) => r.hasLocation && r.isStale)
                .length
            : 'unavailable',
        });
      } while (queuedRef.current && mountedRef.current && gen === loadGenRef.current);
    } finally {
      if (gen === loadGenRef.current) {
        inFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Always refresh while Overview is visible — even when SignalR is connected —
    // so location/attention counts stay current. Shared useLiveRefresh still handles events.
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, OVERVIEW_POLL_MS);

    return () => {
      mountedRef.current = false;
      loadGenRef.current += 1;
      queuedRef.current = false;
      inFlightRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(pollId);
    };
  }, [load]);

  useLiveRefresh(load);

  const attentionItems: AttentionItemProps[] = [
    {
      label: 'Open delivery issues',
      hint: 'Riders reported a problem that still needs a response',
      count: attention.openIssues,
      to: '/operations?issues=Open',
      action: 'Review issues',
    },
    {
      label: 'Returns awaiting store confirmation',
      hint: 'Rider is back — confirm the order was returned',
      count: attention.awaitingStore,
      to: '/operations?status=AwaitingStoreReceipt',
      action: 'Open returns',
    },
    {
      label: 'Cash awaiting handover',
      hint: 'Customer cash collected and not yet handed to the store',
      count: attention.cashHandover,
      to: '/payments',
      action: 'Open payments',
    },
    {
      label: 'Old rider location updates',
      hint: 'Active riders whose map location has not updated recently',
      count: attention.outdatedLocation,
      to: '/live-map?location=outdated',
      action: 'Open live map',
    },
  ];

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-sub">
        Live picture of deliveries, riders, and cash for your store.
      </p>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="kpi-grid">
        <Kpi label="Available" value={data?.available ?? '—'} />
        <Kpi label="Accepted" value={data?.accepted ?? '—'} />
        <Kpi label="In progress" value={data?.inProgress ?? '—'} />
        <Kpi label="Completed today" value={data?.completedToday ?? '—'} />
        <Kpi label="Cancelled today" value={data?.cancelledToday ?? '—'} />
        <Kpi label="Riders online" value={data?.onlineRiders ?? '—'} />
        <Kpi
          label="Cash to collect today"
          value={data ? money(data.cashToCollectToday) : '—'}
        />
      </div>

      <div className="panel">
        <h2 className="h5 mb-1">Needs attention</h2>
        <p className="small text-muted mb-3">
          Items that usually need a manager action. Counts follow your store access.
        </p>
        <div className="attention-list">
          {attentionItems.map((item) => (
            <AttentionItem key={item.to} {...item} />
          ))}
        </div>
      </div>

      <div className="panel">
        <h2 className="h5 mb-3">Shortcuts</h2>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-maison" to="/operations">
            Open live board
          </Link>
          <Link className="btn btn-outline-dark" to="/riders">
            Manage riders
          </Link>
          <Link className="btn btn-outline-dark" to="/payments">
            Payments &amp; settlements
          </Link>
          <Link className="btn btn-outline-dark" to="/reports">
            Reports
          </Link>
        </div>
      </div>
    </div>
  );
}

type AttentionItemProps = {
  label: string;
  hint: string;
  count: AttentionCount;
  to: string;
  action: string;
};

function formatAttentionCount(count: AttentionCount): string {
  if (count === 'unavailable') return 'Unavailable';
  if (count == null) return '—';
  return String(count);
}

function AttentionItem({ label, hint, count, to, action }: AttentionItemProps) {
  const display = formatAttentionCount(count);
  const raised = typeof count === 'number' && count > 0;
  const unavailable = count === 'unavailable';
  return (
    <Link
      to={to}
      className={`attention-item ${raised ? 'attention-item-raised' : ''}`}
    >
      <div className="attention-item-main">
        <div className="attention-item-label">{label}</div>
        <div className="attention-item-hint">{hint}</div>
      </div>
      <div className="attention-item-side">
        <div
          className={`attention-item-count ${raised ? 'is-raised' : ''} ${
            unavailable ? 'is-unavailable' : ''
          }`}
        >
          {display}
        </div>
        <div className="attention-item-action">{action}</div>
      </div>
    </Link>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
