import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { RiderDto, StoreDto } from '../api/types';

const emptyForm = { workerId: '', name: '', phone: '', email: '', storeId: '', password: '' };

function buildCreateRiderBody(form: typeof emptyForm): Record<string, string> {
  const body: Record<string, string> = {
    workerId: form.workerId.trim(),
    name: form.name.trim(),
  };
  const phone = form.phone.trim();
  const email = form.email.trim();
  const storeId = form.storeId.trim();
  const password = form.password.trim();
  if (phone) body.phone = phone;
  if (email) body.email = email;
  if (storeId) body.storeId = storeId;
  if (password) body.password = password;
  return body;
}

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<RiderDto | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  async function load() {
    const [r, s] = await Promise.all([
      api<RiderDto[]>('/api/Admin/Riders'),
      api<StoreDto[]>('/api/Admin/Stores'),
    ]);
    setRiders(r.Data || []);
    setStores(s.Data || []);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function createRider(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await api<RiderDto>('/api/Admin/Riders', {
        method: 'POST',
        body: JSON.stringify(buildCreateRiderBody(form)),
      });
      setNotice(res.message || 'Rider created');
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await api<RiderDto>(`/api/Admin/Riders/${editing.userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editing.name,
          phone: editing.phone,
          storeId: editing.storeId,
          isActive: editing.isActive,
        }),
      });
      if (!res.status) throw new Error(res.message);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function toggleActive(rider: RiderDto) {
    const path = rider.isActive ? 'deactivate' : 'activate';
    const res = await api(`/api/Admin/Riders/${rider.userId}/${path}`, { method: 'POST' });
    if (!res.status) {
      setError(res.message);
      return;
    }
    await load();
  }

  async function resetPwd(e: FormEvent) {
    e.preventDefault();
    if (!resetId) return;
    const res = await api(`/api/Admin/Riders/${resetId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: resetPassword }),
    });
    if (!res.status) {
      setError(res.message);
      return;
    }
    setResetId(null);
    setResetPassword('');
    setNotice('Password reset');
  }

  return (
    <div>
      <h1 className="page-title">Riders</h1>
      <p className="page-sub">Create and manage delivery riders. Riders log in on the mobile app, not this portal.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="panel">
        <h2 className="h5 mb-3">Create rider</h2>
        <form className="row g-2 align-items-end" onSubmit={createRider}>
          <div className="col-md-2">
            <label className="form-label">Worker ID</label>
            <input className="form-control" required value={form.workerId} onChange={(e) => setForm({ ...form, workerId: e.target.value })} placeholder="RD-1001" />
          </div>
          <div className="col-md-3">
            <label className="form-label">Name</label>
            <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-md-2">
            <label className="form-label">Phone</label>
            <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="col-md-2">
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" />
          </div>
          <div className="col-md-2">
            <label className="form-label">Store</label>
            <input className="form-control" list="store-list" required value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} placeholder="e.g. 10007" />
            <datalist id="store-list">
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>{s.name}</option>
              ))}
            </datalist>
          </div>
          <div className="col-md-2">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 chars" />
          </div>
          <div className="col-md-1">
            <button className="btn btn-maison w-100" type="submit">Add</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Store</th>
                <th>Status</th>
                <th>Presence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.userId}>
                  <td><code>{r.workerId}</code></td>
                  <td>{r.name}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.storeName || r.storeId || '—'}</td>
                  <td>{r.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <span className={`dot ${r.isOnline ? 'dot-online' : 'dot-offline'}`} />
                    {r.isOnline ? 'Online' : 'Offline'}
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(r)}>Edit</button>
                      <button className="btn btn-outline-secondary" type="button" onClick={() => { setResetId(r.userId); setResetPassword(''); }}>Reset PW</button>
                      <button className="btn btn-outline-secondary" type="button" onClick={() => void toggleActive(r)}>
                        {r.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {riders.length === 0 && (
                <tr><td colSpan={7} className="text-muted">No riders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <form className="modal-dialog" onSubmit={saveEdit}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit {editing.workerId}</h5>
                <button type="button" className="btn-close" onClick={() => setEditing(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Name</label>
                <input className="form-control mb-2" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <label className="form-label">Phone</label>
                <input className="form-control mb-2" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                <label className="form-label">Store</label>
                <input className="form-control mb-2" value={editing.storeId || ''} onChange={(e) => setEditing({ ...editing, storeId: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-maison" type="submit">Save</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {resetId && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <form className="modal-dialog" onSubmit={resetPwd}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Reset password</h5>
                <button type="button" className="btn-close" onClick={() => setResetId(null)} />
              </div>
              <div className="modal-body">
                <input className="form-control" type="password" minLength={6} required value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="New password (min 6)" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setResetId(null)}>Cancel</button>
                <button className="btn btn-maison" type="submit">Reset</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
