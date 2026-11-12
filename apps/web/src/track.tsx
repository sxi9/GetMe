// Public "share trip" page: no sign-in, read-only, no handover code.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PARCEL_STATUS_LABEL, STATUS_LABEL, type OrderStatus } from '@getme/core';
import { api, wsUrl } from './lib/api';
import { Avatar, Body, Header, Icon, Map } from './ui';

export function TrackPage() {
  const { token } = useParams();
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let ws: WebSocket | null = null;
    api(`/api/track/${token}`).then(setO).catch(e => setErr(e.message));
    const poll = window.setInterval(() => api(`/api/track/${token}`).then(setO).catch(() => {}), 5000);
    ws = new WebSocket(wsUrl('track=' + token)); ws.onmessage = m => { const ev = JSON.parse(m.data); if (ev.type === 'location.updated') setO((x: any) => x ? { ...x, courierPos: ev.pos } : x); };
    return () => { window.clearInterval(poll); ws?.close(); };
  }, [token]);
  const label = o ? ((o.kind === 'parcel' && PARCEL_STATUS_LABEL[o.status as OrderStatus]) || STATUS_LABEL[o.status as OrderStatus]) : '';
  return (
    <div className="phone-wrap"><div className="phone">
      <Header><div className="grow"><div className="overline" style={{ color: 'rgba(255,255,255,.7)' }}>Live trip</div><div className="title">{o ? `Order ${o.id}` : 'GetMe'}</div></div><Icon name="near_me" size={24} color="var(--gm-accent)" /></Header>
      <Body>
        {err && <div className="card">{err}</div>}
        {o && <>
          <Map a={o.shopPos} aIcon={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} b={o.address} bIcon={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} courier={o.courierPos} route={o.shopPos ? [o.shopPos, o.address] : null} eta={o.etaMin != null ? `${o.etaMin} min` : null} tall />
          <div className="card"><div className="h16">{label}</div><div className="cap13">{o.shopName} → {o.address.line}</div></div>
          {o.courier && <div className="card row"><Avatar initials={o.courier.initials} size="lg" /><div className="grow"><div className="b">{o.courier.name}</div><div className="cap">{o.courier.vehicle} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {o.courier.rating} · {o.courier.trips.toLocaleString('en-IN')} trips</div></div></div>}
          <div className="cap" style={{ textAlign: 'center' }}>Shared from GetMe. The handover code is only on the customer's phone.</div>
        </>}
      </Body>
    </div></div>
  );
}
