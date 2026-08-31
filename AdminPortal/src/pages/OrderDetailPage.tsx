import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { customerName, dt, money, OrderDetailDto } from '../api/types';

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cash, setCash] = useState('');

  async function load() {
    const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}`);
    if (!res.status) throw new Error(res.message);
    setOrder(res.Data);
    setCash(res.Data.cashCollected != null ? String(res.Data.cashCollected) : '');
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function act(path: string) {
    setError(null);
    const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/${path}`, { method: 'POST' });
    if (!res.status) {
      setError(res.message);
      return;
    }
    setOrder(res.Data);
  }

  async function saveCash(e: FormEvent) {
    e.preventDefault();
    const res = await api<OrderDetailDto>(`/api/Admin/Orders/${id}/cash-collected`, {
      method: 'PUT',
      body: JSON.stringify({ cashCollected: cash === '' ? null : Number(cash) }),
    });
    if (!res.status) {
      setError(res.message);
      return;
    }
    setOrder(res.Data);
  }

  if (!order) {
    return <div>{error ? <div className="alert alert-danger">{error}</div> : 'Loading…'}</div>;
  }

  const address = [order.addressNo, order.street, order.city, order.postCode, order.secondaryAddress]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <Link to="/operations" className="small text-muted text-decoration-none">← Live operations</Link>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mt-2">
        <div>
          <h1 className="page-title">Order #{order.orderNo || order.orderId}</h1>
          <p className="page-sub">{order.storeId} · <span className={`status-pill status-${order.status}`}>{order.status}</span></p>
        </div>
        <div className="d-flex gap-2">
          {(order.status === 'Available' || order.status === 'Accepted' || order.status === 'InProgress') && (
            <button className="btn btn-outline-danger" type="button" onClick={() => void act('cancel')}>Cancel</button>
          )}
          {(order.status === 'Available' || order.status === 'Cancelled') && (
            <button className="btn btn-outline-dark" type="button" onClick={() => void act('requeue')}>Requeue</button>
          )}
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

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
            <h2 className="h6">Payment</h2>
            <p className="mb-1">Total <strong>{money(order.orderTotal)}</strong></p>
            <p className="mb-1">Method {order.paymentMethod || '—'}</p>
            <p className="mb-3">Cash on order {order.cash != null ? money(order.cash) : '—'}</p>
            <form className="d-flex gap-2" onSubmit={saveCash}>
              <input className="form-control" type="number" step="0.01" placeholder="Cash collected" value={cash} onChange={(e) => setCash(e.target.value)} />
              <button className="btn btn-maison" type="submit">Save</button>
            </form>
          </div>
          <div className="panel">
            <h2 className="h6">Rider &amp; timestamps</h2>
            <p className="mb-1">Rider {order.acceptedByWorkerId || 'Unassigned'} {order.acceptedByName ? `· ${order.acceptedByName}` : ''}</p>
            <p className="mb-1 small">Created {dt(order.createdAt)}</p>
            <p className="mb-1 small">Accepted {dt(order.acceptedAt)}</p>
            <p className="mb-1 small">Picked up {dt(order.pickedUpAt)}</p>
            <p className="mb-0 small">Completed {dt(order.completedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
