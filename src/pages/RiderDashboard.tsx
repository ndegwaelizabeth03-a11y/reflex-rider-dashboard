import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../lib/api';
import './RiderDashboard.css';

interface Order {
  id: number;
  retailer_id: number | null;
  customer_name: string;
  phone_number: string;
  pickup_address: string | null;
  delivery_address: string;
  order_details: string;
  status: string;
  created_at: string;
  order_id: string;
  assigned_rider_id: number | null;
}

interface OrdersResponse {
  success: boolean;
  data: Order[];
}

const MOCK_RIDERS = [
  { id: 101, name: 'Asha Kones' },
  { id: 102, name: 'Peter Mwangi' },
  { id: 103, name: 'Dennis Mutua' },
];
type UpdatePayload = { status?: string; assigned_rider_id?: number };
async function updateOrderOnServer(
  orderId: string,
  updates: { status?: string; assigned_rider_id?: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
await api.post(`/api/orders/${orderId}/scan`, {      rider_id: updates.assigned_rider_id ?? 'RIDER-01',
      action: updates.status,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
error: err instanceof Error ? `Update failed: ${err.message}` : 'Update failed'    };
  }
}

function StatusBadge(props: { status: string }) {
  var cls = props.status ? props.status.toLowerCase() : 'default';
  return <span className={'rd-badge ' + cls}>{props.status}</span>;
}

function OrderQR(props: { orderId: string }) {
  var showState = useState(false);
  var show = showState[0];
  var setShow = showState[1];

  return (
    <div className="rd-qr-block">
      <button className="rd-btn-ghost" onClick={() => setShow(!show)}>
        {show ? 'Hide QR' : 'Show QR'}
      </button>
      {show && (
        <div className="rd-qr-wrap">
          <QRCodeSVG value={props.orderId} size={128} bgColor="#ffffff" fgColor="#0b1220" />
          <div className="rd-qr-caption">{props.orderId}</div>
        </div>
      )}
    </div>
  );
}

export default function RiderDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number>(MOCK_RIDERS[0].id);
  const [openScan, setOpenScan] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState<string>('');
  const [cardMsg, setCardMsg] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<OrdersResponse | Order[]>('/api/orders');
      const ordersData: Order[] = Array.isArray(res.data)
        ? res.data
        : Array.isArray((res.data as OrdersResponse) && (res.data as OrdersResponse).data)
          ? (res.data as OrdersResponse).data
          : [];
      setOrders(ordersData);
      setIsOnline(true);
      setFetchError(null);
    } catch (err) {
      setIsOnline(false);
      setFetchError(err instanceof Error ? err.message : 'Unknown error fetching orders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (isLoading) {
    return <div className="rd-page"><p style={{ color: '#8891a7' }}>Loading your route…</p></div>;
  }

  if (!isOnline) {
    return (
      <div className="rd-page">
        <div className="rd-offline">
          <p>Offline — couldn't reach the orders API.</p>
          {fetchError && <p style={{ color: '#8891a7', fontSize: 13 }}>{fetchError}</p>}
          <button onClick={fetchOrders}>Retry</button>
        </div>
      </div>
    );
  }

  const unclaimed = orders.filter((o) => o.assigned_rider_id === null && o.status === 'REQUESTED');
  const mine = orders.filter((o) => o.assigned_rider_id === riderId && o.status !== 'DELIVERED');

  const handleVerify = async (order: Order, mode: 'claim' | 'deliver') => {
    const scanned = scanInput.trim();

    if (!scanned) {
      setCardMsg((m) => Object.assign({}, m, {
        [order.order_id]: { type: 'error' as const, text: 'Scan rejected: QR code is invalid.' }
      }));
      return;
    }

    if (scanned.toUpperCase() !== order.order_id.toUpperCase()) {
      setCardMsg((m) => Object.assign({}, m, {
        [order.order_id]: { type: 'error' as const, text: 'Scan rejected: this code belongs to a different order.' }
      }));
      setScanInput('');
      return;
    }

const updates: UpdatePayload = mode === 'claim'      ? { status: 'PICKED_UP', assigned_rider_id: riderId }
      : { status: 'DELIVERED' };

    const result = await updateOrderOnServer(order.order_id, updates);

    if (result.ok) {
      const successText = mode === 'claim' ? 'Pickup verified successfully.' : 'Delivery verified successfully.';
      setCardMsg((m) => Object.assign({}, m, {
        [order.order_id]: { type: 'success' as const, text: successText }
      }));
      fetchOrders();
    } else {
      setCardMsg((m) => Object.assign({}, m, {
        [order.order_id]: { type: 'error' as const, text: result.error }
      }));
    }
    setScanInput('');
    setOpenScan(null);
  };

  const renderCard = (o: Order, mode: 'claim' | 'deliver') => (
    <div className="rd-card" key={o.order_id}>
      <div className="rd-card-top">
        <div>
          <div className="rd-order-id">{o.order_id}</div>
          <div className="rd-customer">{o.customer_name}</div>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="rd-meta">
        {o.phone_number} · {o.delivery_address.trim()}<br />
        {o.order_details.trim()}
      </div>

      <OrderQR orderId={o.order_id} />

      <div className="rd-actions">
        {mode === 'deliver' && o.status !== 'PICKED_UP' ? (
          <button className="rd-btn" disabled>Waiting</button>
        ) : (
          <button className="rd-btn" onClick={() => setOpenScan(o.order_id)}>
            {mode === 'claim' ? 'Scan at shop to claim' : "Scan at customer's door"}
          </button>
        )}
      </div>

      {openScan === o.order_id && (
        <div className="rd-scan-panel">
          <p>Scan the QR above (or type its code) to verify.</p>
          <div className="rd-scan-row">
            <input
              type="text"
              placeholder="Scanned QR value"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              autoFocus
            />
            <button className="rd-btn" onClick={() => handleVerify(o, mode)}>Verify</button>
          </div>
        </div>
      )}

      {cardMsg[o.order_id] && (
        <div className={'rd-msg ' + cardMsg[o.order_id].type}>{cardMsg[o.order_id].text}</div>
      )}
    </div>
  );

  return (
    <div className="rd-page">
      <div className="rd-header">
        <h1 className="rd-title">Today's Route</h1>
        <p className="rd-subtitle">Scan at the shop to claim &amp; pick up, scan at the door to confirm delivery.</p>
      </div>

      <div className="rd-rider-picker">
        <label htmlFor="rider-select">Riding as:</label>
        <select id="rider-select" value={riderId} onChange={(e) => setRiderId(Number(e.target.value))}>
          {MOCK_RIDERS.map((r) => (
            <option key={r.id} value={r.id}>{r.name} (#{r.id})</option>
          ))}
        </select>
        <span style={{ color: '#64708a', fontSize: 12 }}>No login system yet — placeholder rider picker</span>
      </div>

      <div className="rd-section">
        <div className="rd-section-title">My Active Deliveries <span className="rd-count">{mine.length}</span></div>
        {mine.length === 0 ? (
          <div className="rd-empty">Nothing claimed yet — grab one from the pool below.</div>
        ) : (
          mine.map((o) => renderCard(o, 'deliver'))
        )}
      </div>

      <div className="rd-section">
        <div className="rd-section-title">Available for Pickup <span className="rd-count">{unclaimed.length}</span></div>
        {unclaimed.length === 0 ? (
          <div className="rd-empty">No unclaimed orders right now.</div>
        ) : (
          unclaimed.map((o) => renderCard(o, 'claim'))
        )}
      </div>
    </div>
  );
}