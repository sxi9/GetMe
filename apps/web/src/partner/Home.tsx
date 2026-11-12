import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertBanner, Avatar, Body, Button, Header, Icon, IconButton, Map, Sheet, Toggle } from '../ui';
import { post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { RequestCard } from './RequestCard';
import { phaseLabel, usePartner } from './state';

export function Home() {
  const { session, setMe, toast } = useStore(); const err = useErrorToast();
  const p = session!.me.partner!;
  const { requests, active, earnings, myPos, gps, sim, setSim } = usePartner();
  const nav = useNavigate();
  const [notif, setNotif] = useState(false);
  const list = useMemo(() => Object.values(requests).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [requests]);
  const pool = useMemo(() => list.map(o => o.shopPos ?? o.pickup ?? o.address), [list]);
  const toggle = async (on: boolean) => { try { setMe({ partner: await post('/api/partner/online', { online: on }) }); toast(on ? `You are online in ${p.area}` : 'You are offline. New requests paused'); } catch (e) { err(e); } };
  const live = active && active.status !== 'delivered' ? active : null;
  const sub = p.online ? `Taking requests in ${p.area}${list.length ? ` · ${list.length} open nearby` : ''}` : 'Go online to see requests';
  return (
    <>
      <Header right={<IconButton icon="notifications" label="Notifications" color="reverse" onClick={() => setNotif(true)} />}>
        <Avatar initials={p.initials} size="md" />
        <div className="grow"><div className="title">{p.name}</div><div className="row" style={{ gap: 4, fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}><Icon name="star" size={14} filled color="var(--severity-low)" />{p.rating} · {p.vehicle} · {p.area}</div></div>
      </Header>
      <Body>
        {!p.verified && <AlertBanner type="caution" action={<Button size="small" variant="text" onClick={() => nav('/partner/profile')}>Upload</Button>}>Documents pending. Upload them to start receiving requests.</AlertBanner>}
        <div className="card row">
          <div className="grow"><div className="b">{p.online ? 'You are online' : 'You are offline'}</div><div className="cap">{sub}</div></div>
          <Toggle checked={p.online} onChange={toggle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['Today', `₹${earnings?.today ?? 0}`], ['Trips', String(earnings?.trips ?? 0)], ['Tips', `₹${earnings?.tips ?? 0}`]].map(([k, v]) => <div key={k} className="card flat" style={{ padding: '10px 12px', gap: 0 }}><div className="overline">{k}</div><div className="price">{v}</div></div>)}
        </div>
        {list.length >= 2 && <div className="card row flat"><Icon name="local_fire_department" size={22} color="var(--severity-medium)" /><div className="grow"><div className="b">Busy nearby</div><div className="cap">{list.length} open requests in {p.area} · accept quickly to keep your streak</div></div></div>}
        {live && (
          <div className="card row clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav('/partner/job')}>
            <Icon name="local_shipping" size={24} color="var(--brand-primary-rest)" />
            <div className="grow"><div className="b">Active job · {live.id}</div><div className="cap13">{phaseLabel(live)} · earn ₹{live.earn}</div></div>
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>
        )}
        {p.online && list.map(o => <RequestCard key={o.id} o={o} />)}
        {p.online && !list.length && !live && <div className="drop" style={{ padding: 20, cursor: 'default' }}><Icon name="radar" size={28} color="var(--icon)" />No requests right now. Stay online — new requests appear here.</div>}
        {!p.online && <AlertBanner type="neutral">You are offline. Requests are paused until you go online.</AlertBanner>}
        <div style={{ flexShrink: 0 }}><Map me={myPos} pool={pool} /></div>
        {gps === 'unavailable' && <div className="between cap"><span>No GPS on this device · position is simulated</span><Toggle checked={sim} onChange={setSim} label="Simulate" /></div>}
      </Body>
      <Sheet open={notif} onClose={() => setNotif(false)} title="Notifications"><Notifications /></Sheet>
    </>
  );
}
function Notifications() {
  const [items, setItems] = useState<any[] | null>(null);
  if (items === null) { import('../lib/api').then(m => m.api('/api/notifications').then((n: any[]) => { setItems(n); m.post('/api/notifications/read').catch(() => {}); }).catch(() => setItems([]))); return <div className="cap">Loading…</div>; }
  if (!items.length) return <div className="cap">Nothing yet.</div>;
  return <div className="list">{items.slice(0, 20).map(n => <div key={n.id} className="item"><Icon name="notifications" size={20} color={n.read ? 'var(--icon)' : 'var(--brand-primary-rest)'} /><div className="grow"><div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>{n.body && <div className="cap">{n.body}</div>}</div><div className="cap">{new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div></div>)}</div>;
}

/** /partner/request/:id — one request on its own screen (opened from a toast). */
export function RequestScreen() {
  const { id } = useParams(); const nav = useNavigate();
  const { requests, myPos } = usePartner();
  const o = id ? requests[id] : undefined;
  return (
    <>
      <Header title={o ? `Request ${o.id}` : 'Request'} onBack={() => nav('/partner')} />
      <Body>
        {o ? <><RequestCard o={o} /><div style={{ flexShrink: 0 }}><Map me={myPos} a={o.shopPos ?? o.pickup ?? null} aIcon={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} b={o.address} bIcon={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} route={[o.shopPos ?? o.pickup ?? myPos, o.address]} /></div></> : <AlertBanner type="neutral">This request is no longer open.</AlertBanner>}
      </Body>
    </>
  );
}
