import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, isAdminPortalUser, isHeadOffice } from '../api/client';
import { AdminNotificationDto, dt } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  ensureAdminHub,
  stopAdminHub,
  subscribeAdminNotificationCreated,
} from '../realtime/adminHub';

const NAV = [
  { to: '/', label: 'Overview', icon: 'bi-grid-1x2', end: true },
  { to: '/operations', label: 'Live operations', icon: 'bi-broadcast', end: false },
  { to: '/live-map', label: 'Live map', icon: 'bi-geo-alt', end: false },
  { to: '/riders', label: 'Riders', icon: 'bi-people', end: false },
  { to: '/payments', label: 'Payments', icon: 'bi-cash-stack', end: false },
  { to: '/reports', label: 'Reports', icon: 'bi-graph-up', end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AdminNotificationDto[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    const qs = new URLSearchParams({ take: '30' });
    if (user?.storeId) qs.set('storeId', user.storeId);
    const res = await api<AdminNotificationDto[]>(`/api/Admin/Notifications?${qs.toString()}`);
    if (!res.status) return;
    setNotifications(res.Data || []);
  }, [user?.storeId]);

  useEffect(() => {
    if (!user || !isAdminPortalUser(user)) {
      void stopAdminHub();
      setNotifications([]);
      setOpen(false);
      setToast(null);
      return;
    }

    void ensureAdminHub().catch(() => {
      /* pages poll when disconnected */
    });
    void loadNotifications().catch(() => {
      /* ignore inbox errors in shell */
    });

    const unsub = subscribeAdminNotificationCreated((payload) => {
      setToast(payload.title || 'New notification');
      void loadNotifications().catch(() => {});
      window.setTimeout(() => setToast(null), 4500);
    });

    return () => {
      unsub();
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    return () => {
      void stopAdminHub();
    };
  }, []);

  async function markRead(id: number) {
    try {
      await api(`/api/Admin/Notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      /* ignore */
    }
  }

  async function openNotification(n: AdminNotificationDto) {
    if (!n.isRead) await markRead(n.id);
    setOpen(false);
    if (n.assignedOrderId) navigate(`/operations/${n.assignedOrderId}`);
  }

  if (!user || !isAdminPortalUser(user)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const ho = isHeadOffice(user);
  const links = ho
    ? [...NAV, { to: '/settings', label: 'Settings', icon: 'bi-sliders', end: false }]
    : NAV;

  const unread = notifications.filter((n) => !n.isRead).length;

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
        <div className="content-top">
          <div className="notif-wrap">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm notif-bell"
              aria-label="Notifications"
              onClick={() => {
                setOpen((v) => !v);
                if (!open) void loadNotifications().catch(() => {});
              }}
            >
              <i className="bi bi-bell" />
              {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {open && (
              <div className="notif-panel">
                <div className="notif-panel-head">
                  <strong>Notifications</strong>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="notif-list">
                  {notifications.length === 0 && (
                    <div className="text-muted small p-3">No notifications yet.</div>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`notif-item ${n.isRead ? '' : 'unread'}`}
                      onClick={() => void openNotification(n)}
                    >
                      <div className="fw-semibold">{n.title}</div>
                      {n.body && <div className="small text-muted">{n.body}</div>}
                      <div className="small text-muted">{dt(n.createdAt)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {toast && (
          <div className="toast-live alert alert-info py-2 px-3" role="status">
            {toast}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
