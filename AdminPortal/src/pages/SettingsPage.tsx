import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, isHeadOffice } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PayoutSettings } from '../api/types';

export default function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<PayoutSettings>({ mode: 'fixed', fixedFee: 50, percent: 10 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<PayoutSettings>('/api/Admin/Settings/payout')
      .then((r) => {
        if (!r.status) throw new Error(r.message);
        setForm(r.Data);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!isHeadOffice(user)) {
    return <Navigate to="/" replace />;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await api<PayoutSettings>('/api/Admin/Settings/payout', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      if (!res.status) throw new Error(res.message);
      setForm(res.Data);
      setNotice('Payout settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Rider payout is stored as a setting, not hardcoded. Head office only.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <form className="panel" style={{ maxWidth: 520 }} onSubmit={save}>
        <div className="mb-3">
          <label className="form-label">Payout mode</label>
          <select className="form-select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="fixed">Fixed fee per completed delivery</option>
            <option value="percent">Percent of completed order totals</option>
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Fixed fee</label>
          <input className="form-control" type="number" step="0.01" value={form.fixedFee} onChange={(e) => setForm({ ...form, fixedFee: Number(e.target.value) })} />
        </div>
        <div className="mb-3">
          <label className="form-label">Percent</label>
          <input className="form-control" type="number" step="0.01" value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} />
        </div>
        <button className="btn btn-maison" type="submit">Save</button>
      </form>
    </div>
  );
}
