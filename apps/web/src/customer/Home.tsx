import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABEL, PARCEL_STATUS_LABEL, fmtKm, initials, type OrderStatus } from '@getme/core';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { AlertBanner, Avatar, Body, Button, Icon, IconButton, Input, Sheet, StatusChip } from '../ui';
import { CustomerTabs } from './Tabs';
import { orderSummary, useCustomer } from './state';

export const statusLabel = (o: any) => (o.kind === 'parcel' && PARCEL_STATUS_LABEL[o.status as OrderStatus]) || STATUS_LABEL[o.status as OrderStatus];

export function Home() {
  const nav = useNavigate();
  const { session, toast } = useStore();
  const { activeOrders, setList, setCoKind, notifications, reloadNotifications } = useCustomer();
  const [shops, setShops] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [item, setItem] = useState('');
  const [bell, setBell] = useState(false);
  const home = session?.me.addresses?.[0];
  const user = session!.me.user;
  useEffect(() => { const t = setTimeout(() => api('/api/shops?q=' + encodeURIComponent(q)).then(setShops).catch(() => {}), q ? 200 : 0); return () => clearTimeout(t); }, [q]);
  const unreadN = notifications.filter(n => !n.read).length;

  const startList = () => {
    const t = item.trim();
    setList(d => ({ ...d, items: t ? [...d.items, { id: String(Date.now()), name: t, qty: 1 }] : d.items }));
    setCoKind('list'); setItem(''); nav('/customer/list');
  };
  const openBell = async () => { setBell(true); try { await reloadNotifications(); if (unreadN) { await api('/api/notifications/read', { method: 'POST', body: {} }); await reloadNotifications(); } } catch { /* ignore */ } };

  return (
    <>
      <div className="chrome">
        <div className="grow">
          <div style={{ fontSize: 11, lineHeight: '14px', letterSpacing: .5, textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>Deliver to</div>
          <div className="row" style={{ gap: 4, fontWeight: 600, fontSize: 15, lineHeight: '22px', cursor: 'pointer' }} onClick={() => nav('/customer/profile')}><Icon name="location_on" size={18} color="var(--gm-accent)" />{home ? `${home.label} · ${home.area ?? home.line}` : 'Add an address'}<Icon name="expand_more" size={18} /></div>
        </div>
        <IconButton icon="notifications" label="Notifications" color="reverse" onClick={openBell} badge={unreadN || undefined} />
        <Avatar initials={initials(user.name)} size="md" style={{ cursor: 'pointer' }} onClick={() => nav('/customer/profile')} />
      </div>
      <Body>
        <Input placeholder="Search shops or items" prefixIcon="search" value={q} onChange={e => setQ(e.target.value)} />
        {activeOrders.map(o => (
          <div key={o.id} className="card row clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav(`/customer/order/${o.id}`)}>
            <Icon name="local_shipping" size={24} color="var(--brand-primary-rest)" />
            <div className="grow"><div className="b">Order {o.id} · {orderSummary(o)}</div><div className="cap13">{statusLabel(o)}{o.courierName ? ' · ' + o.courierName : ''}</div></div>
            <StatusChip status="progress" label="Live" />
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>
        ))}
        <div className="card">
          <div className="h16">Need something from nearby?</div>
          <div className="cap13">Groceries, vegetables, medicines, anything. A partner nearby buys it and brings it to you.</div>
          <div className="row" style={{ gap: 8 }}>
            <Input placeholder="e.g. 2 kg onions" value={item} onChange={e => setItem(e.target.value)} onEnter={startList} style={{ flex: 1 }} />
            <Button color="primary" icon="checklist" onClick={startList}>Start list</Button>
          </div>
        </div>
        <div className="card row clickable" onClick={() => { setCoKind('parcel'); nav('/customer/package'); }}>
          <div className="tile"><Icon name="inventory_2" size={20} /></div>
          <div className="grow"><div className="b">Send a package</div><div className="cap">Keys, documents, a food box. Picked up from you, handed to anyone in the city.</div></div>
          <Icon name="chevron_right" size={22} color="var(--icon)" />
        </div>
        <div className="between"><div className="h16">Shops nearby</div><div className="cap">{shops.length} shop{shops.length === 1 ? '' : 's'} within 2 km</div></div>
        <div className="grid2">
          {shops.map(sh => (
            <div key={sh.id} className="card clickable" style={{ padding: 12, gap: 8 }} onClick={() => nav(`/customer/shop/${sh.id}`)}>
              <div className="tile"><Icon name={sh.cat === 'Pharmacy' ? 'medical_services' : sh.cat === 'Bakery' ? 'bakery_dining' : 'storefront'} size={20} /></div>
              <div style={{ minWidth: 0 }}><div className="b ellip">{sh.name}</div><div className="cap">{sh.cat}</div></div>
              <div className="cap">{fmtKm(sh.distKm)} · {sh.etaLabel}</div>
              <div className="between" style={{ gap: 6 }}><StatusChip status={sh.open ? 'success' : 'ended'} label={sh.open ? 'Open' : 'Closed'} /><span className="cap">{sh.itemCount} items</span></div>
            </div>
          ))}
        </div>
        {!shops.length && q && <div className="cap13" style={{ textAlign: 'center' }}>No shops match “{q}”. Try a list instead.</div>}
        <AlertBanner type="info" title="GETME20" icon="sell">₹20 off delivery on lists this week</AlertBanner>
      </Body>
      <CustomerTabs />
      <Sheet open={bell} onClose={() => setBell(false)} title="Notifications">
        {!notifications.length && <div className="cap13">Nothing yet. Order updates, offers and messages show up here.</div>}
        <div className="list">{notifications.slice(0, 30).map(n => (
          <div key={n.id} className={'item' + (n.orderId ? ' clickable' : '')} onClick={() => { if (n.orderId) { setBell(false); nav(`/customer/order/${n.orderId}`); } }}>
            <Icon name="notifications" size={20} color={n.read ? 'var(--icon)' : 'var(--brand-primary-rest)'} />
            <div className="grow"><div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>{n.body && <div className="cap">{n.body}</div>}</div>
            <span className="cap mono">{new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>))}</div>
        {!!notifications.length && <Button variant="text" color="primary" onClick={() => { toast('Notifications cleared'); setBell(false); }}>Done</Button>}
      </Sheet>
    </>
  );
}
