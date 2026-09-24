import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, isHeadOffice } from '../api/client';
import { StoreDto } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  ensureAdminHub,
  isAdminHubConnected,
  onAdminHubReconnect,
  subscribeRiderLocationChanged,
  RiderLocationChangedPayload,
} from '../realtime/adminHub';
import { useLiveRefresh } from '../realtime/useLiveRefresh';

export type LiveRiderDto = {
  riderUserId: string;
  workerId: string;
  name: string;
  storeId: string;
  storeName: string;
  isOnline: boolean;
  activeOrderCount: number;
  deliveryStatus: string;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  hasLocation: boolean;
  isStale: boolean;
  staleAfterSeconds: number;
};

const STATUS_LABELS: Record<string, string> = {
  Accepted: 'Accepted',
  NavigatingToPickup: 'To pickup',
  ArrivedAtPickup: 'At pickup',
  InProgress: 'Picked up',
  OnTheWay: 'On the way',
  ArrivedAtCustomer: 'At customer',
  Delivered: 'Delivered',
};

function statusLabel(s?: string | null) {
  if (!s) return '—';
  return STATUS_LABELS[s] || s;
}

function markerColor(r: LiveRiderDto): string {
  if (!r.hasLocation) return '#9ca3af';
  if (r.isStale) return '#d97706';
  return '#059669';
}

export default function LiveMapPage() {
  const { user } = useAuth();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const [riders, setRiders] = useState<LiveRiderDto[]>([]);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storeId, setStoreId] = useState(user?.storeId || '');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (storeId) qs.set('storeId', storeId);
    const [live, s] = await Promise.all([
      api<LiveRiderDto[]>(`/api/Admin/Riders/live-map?${qs.toString()}`),
      api<StoreDto[]>('/api/Admin/Stores'),
    ]);
    if (!live.status) throw new Error(live.message);
    setRiders(live.Data || []);
    setStores(s.Data || []);
    setError(null);
  }, [storeId]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  useLiveRefresh(load);

  useEffect(() => {
    void ensureAdminHub().catch(() => {});
    const unsub = subscribeRiderLocationChanged((payload: RiderLocationChangedPayload) => {
      setRiders((prev) => {
        const id = String(payload.riderUserId || '').toLowerCase();
        if (payload.cleared) {
          return prev.filter((r) => r.riderUserId.toLowerCase() !== id);
        }
        const idx = prev.findIndex((r) => r.riderUserId.toLowerCase() === id);
        if (idx < 0) {
          // New rider with location — refresh list for full metadata
          void load().catch(() => {});
          return prev;
        }
        const next = [...prev];
        const cur = next[idx];
        next[idx] = {
          ...cur,
          latitude: payload.latitude ?? cur.latitude,
          longitude: payload.longitude ?? cur.longitude,
          locationUpdatedAt: payload.locationUpdatedAt ?? payload.at ?? cur.locationUpdatedAt,
          activeOrderCount: payload.activeOrderCount ?? cur.activeOrderCount,
          deliveryStatus: payload.deliveryStatus ?? cur.deliveryStatus,
          hasLocation: payload.latitude != null && payload.longitude != null,
          isStale: false,
        };
        return next;
      });
    });
    const unsubReconnect = onAdminHubReconnect(() => {
      void load().catch(() => {});
    });
    return () => {
      unsub();
      unsubReconnect();
    };
  }, [load]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current).setView([24.8607, 67.0011], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    const withCoords = riders.filter(
      (r) => r.hasLocation && r.latitude != null && r.longitude != null,
    );

    for (const r of withCoords) {
      seen.add(r.riderUserId);
      const latlng: L.LatLngExpression = [r.latitude!, r.longitude!];
      let marker = markersRef.current.get(r.riderUserId);
      const color = markerColor(r);
      const popup = `<strong>${r.workerId}</strong> · ${r.name}<br/>${statusLabel(r.deliveryStatus)} · ${r.activeOrderCount} active<br/>${r.isStale ? '<em>Stale location</em><br/>' : ''}Updated ${r.locationUpdatedAt ? new Date(r.locationUpdatedAt).toLocaleString() : '—'}`;
      if (!marker) {
        marker = L.circleMarker(latlng, {
          radius: 10,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        }).addTo(map);
        marker.bindPopup(popup);
        marker.on('click', () => setSelectedId(r.riderUserId));
        markersRef.current.set(r.riderUserId, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setStyle({ fillColor: color });
        marker.setPopupContent(popup);
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map((r) => [r.latitude!, r.longitude!] as [number, number]));
      map.fitBounds(bounds.pad(0.2));
    }
  }, [riders]);

  const hubOk = isAdminHubConnected();
  const summary = useMemo(() => {
    const live = riders.filter((r) => r.hasLocation && !r.isStale).length;
    const stale = riders.filter((r) => r.hasLocation && r.isStale).length;
    const missing = riders.filter((r) => !r.hasLocation).length;
    return { live, stale, missing, total: riders.length };
  }, [riders]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h1 className="page-title">Live map</h1>
          <p className="page-sub">
            Riders with active deliveries. Green = fresh GPS, amber = stale, grey = no location yet.
            Hub {hubOk ? 'connected' : 'polling'}.
          </p>
        </div>
        <div className="d-flex gap-2 align-items-end">
          <div>
            <label className="form-label">Store</label>
            <select
              className="form-select form-select-sm"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={!isHeadOffice(user)}
            >
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>{s.name}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm btn-maison" type="button" onClick={() => load().catch((e: Error) => setError(e.message))}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="d-flex flex-wrap gap-3 mb-3 small">
        <span><span className="dot" style={{ background: '#059669' }} /> Fresh {summary.live}</span>
        <span><span className="dot" style={{ background: '#d97706' }} /> Stale {summary.stale}</span>
        <span><span className="dot" style={{ background: '#9ca3af' }} /> No GPS {summary.missing}</span>
        <span>Active riders {summary.total}</span>
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="panel p-0 overflow-hidden" style={{ minHeight: 480 }}>
            <div ref={mapEl} style={{ height: 480, width: '100%' }} />
          </div>
        </div>
        <div className="col-lg-4">
          <div className="panel" style={{ maxHeight: 480, overflow: 'auto' }}>
            <h2 className="h6">Active riders</h2>
            {riders.length === 0 && <p className="small text-muted mb-0">No riders with active deliveries.</p>}
            {riders.map((r) => (
              <button
                key={r.riderUserId}
                type="button"
                className={`w-100 text-start border-0 bg-transparent py-2 px-1 ${selectedId === r.riderUserId ? 'border-start border-3 border-danger' : ''}`}
                onClick={() => {
                  setSelectedId(r.riderUserId);
                  if (r.latitude != null && r.longitude != null) {
                    mapRef.current?.setView([r.latitude, r.longitude], 15);
                    markersRef.current.get(r.riderUserId)?.openPopup();
                  }
                }}
              >
                <div className="fw-semibold">{r.workerId} · {r.name}</div>
                <div className="small text-muted">
                  {statusLabel(r.deliveryStatus)} · {r.activeOrderCount} order(s) · {r.storeId}
                </div>
                <div className="small">
                  {!r.hasLocation && <span className="text-muted">Location unavailable</span>}
                  {r.hasLocation && r.isStale && <span className="text-warning">Stale · {r.locationUpdatedAt ? new Date(r.locationUpdatedAt).toLocaleTimeString() : '—'}</span>}
                  {r.hasLocation && !r.isStale && <span className="text-success">Live · {r.locationUpdatedAt ? new Date(r.locationUpdatedAt).toLocaleTimeString() : '—'}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
