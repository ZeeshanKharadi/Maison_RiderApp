import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAdminPortalUser, isHeadOffice } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Overview', icon: 'bi-grid-1x2', end: true },
  { to: '/operations', label: 'Live operations', icon: 'bi-broadcast', end: false },
  { to: '/riders', label: 'Riders', icon: 'bi-people', end: false },
  { to: '/payments', label: 'Payments', icon: 'bi-cash-stack', end: false },
  { to: '/reports', label: 'Reports', icon: 'bi-graph-up', end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user || !isAdminPortalUser(user)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const ho = isHeadOffice(user);
  const links = ho
    ? [...NAV, { to: '/settings', label: 'Settings', icon: 'bi-sliders', end: false }]
    : NAV;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">Maison</div>
            <div className="brand-sub">Rider Ops</div>
          </div>
        </div>
        <nav className="side-nav">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <i className={`bi ${item.icon}`} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="user-chip">
            <div className="user-chip-name">{user.name || user.employeeId}</div>
            <div className="user-chip-meta">
              {user.roles.join(' · ')}
              {user.storeId ? ` · ${user.storeId}` : ' · All stores'}
            </div>
          </div>
          <button type="button" className="btn btn-outline-light btn-sm w-100" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
