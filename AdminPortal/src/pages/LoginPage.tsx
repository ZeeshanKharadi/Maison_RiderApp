import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isAdminPortalUser } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const [userid, setUserid] = useState('HO-ADMIN');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (user && isAdminPortalUser(user)) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(userid.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">Maison</div>
            <div className="brand-sub" style={{ color: '#6b7280' }}>Rider admin portal</div>
          </div>
        </div>
        <h1 className="h4 mb-1">Sign in</h1>
        <p className="text-muted mb-4">Head office and store managers only. Riders use the mobile app.</p>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <div className="mb-3">
          <label className="form-label">Worker ID</label>
          <input className="form-control" value={userid} onChange={(e) => setUserid(e.target.value)} autoComplete="username" />
        </div>
        <div className="mb-4">
          <label className="form-label">Password</label>
          <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-maison w-100" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
