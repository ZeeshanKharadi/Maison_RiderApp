import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { LiveSummary, money } from '../api/types';

export default function DashboardPage() {
  const [data, setData] = useState<LiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LiveSummary>('/api/Admin/Orders/summary')
      .then((r) => {
        if (!r.status) throw new Error(r.message);
        setData(r.Data);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-sub">Live rider operations. Jobs appear when KDS FOH-bumps a delivery order into AssignOrder.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="kpi-grid">
        <Kpi label="Available" value={data?.available ?? '—'} />
        <Kpi label="Accepted" value={data?.accepted ?? '—'} />
        <Kpi label="In progress" value={data?.inProgress ?? '—'} />
        <Kpi label="Completed today" value={data?.completedToday ?? '—'} />
        <Kpi label="Cancelled today" value={data?.cancelledToday ?? '—'} />
        <Kpi label="Riders online" value={data?.onlineRiders ?? '—'} />
        <Kpi label="Cash to collect today" value={data ? money(data.cashToCollectToday) : '—'} />
      </div>
      <div className="panel">
        <h2 className="h5 mb-3">Shortcuts</h2>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-maison" to="/operations">Open live board</Link>
          <Link className="btn btn-outline-dark" to="/riders">Manage riders</Link>
          <Link className="btn btn-outline-dark" to="/payments">Payments &amp; settlements</Link>
          <Link className="btn btn-outline-dark" to="/reports">Reports</Link>
        </div>
      </div>
    </div>
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
