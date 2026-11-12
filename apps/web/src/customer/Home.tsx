import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_LABEL, PARCEL_STATUS_LABEL, fmtKm, initials, type OrderStatus } from '@getme/core';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { fmtAddress, currentLocationAddress, type GpsState } from '../lib/geo';
import { NotificationBell } from '../lib/notifications';
import { AlertBanner, Avatar, Body, Button, Chip, Icon, Input, StatusChip } from '../ui';
import { CustomerTabs } from './Tabs';
import { DeliverToSheet, useGpsHint } from './DeliverTo';
import { ShopsMap } from './ShopsMap';
import { orderSummary, timeAt, useCustomer } from './state';

export const statusLabel = (o: any) => (o.kind === 'parcel' && PARCEL_STATUS_LABEL[o.status as OrderStatus]) || STATUS_LABEL[o.status as OrderStatus];

export function Home() {
  const nav = useNavigate(); const { t } = useT();
  const { session } = useStore();
  const { activeOrders, setList, setCoKind, address, setAddress, runs, board } = useCustomer();
  const [shops, setShops] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [item, setItem] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [deliver, setDeliver] = useState(false);
  const [gps, setGps] = useState<GpsState>('idle');
  const hint = useGpsHint();
  const user = session!.me.user;
  const saved = session?.me.addresses ?? [];
  const at = address ? `lat=${address.lat}&lng=${address.lng}` : '';
  useEffect(() => { const h = setTimeout(() => api(`/api/shops?q=${encodeURIComponent(q)}${at ? '&' + at : ''}`).then(setShops).catch(() => {}), q ? 200 : 0); return () => clearTimeout(h); }, [q, at]);
  // no saved address and nothing chosen yet → try the GPS once
  useEffect(() => {
    if (address || saved.length || gps !== 'idle') return;
    setGps('asking');
    currentLocationAddress().then(r => { if ('error' in r) setGps(r.error); else { setGps('ok'); setAddress(r.address); } });
  }, [address, saved.length, gps, setAddress]);

  const startList = () => {
    const v = item.trim();
    setList(d => ({ ...d, items: v ? [...d.items, { id: String(Date.now()), name: v, qty: 1 }] : d.items }));
    setCoKind('list'); setItem(''); nav('/customer/list');
  };
  const headerLine = address ? (address.source === 'gps' ? `${t('Current location')} · ${address.line}` : `${t(address.label)} · ${address.area ?? address.line}`) : gps === 'asking' ? t('Finding your location…') : t('Set a delivery address');
  const liveLabel = (o: any) => o.status === 'scheduled' && o.run ? t('Riding along on {run} · leaves {time}', { run: o.run.label, time: timeAt(o.run.departAt) }) : statusLabel(o) + (o.courierName ? ' · ' + o.courierName : '');
  const shopIcon = (c: string) => c === 'Pharmacy' ? 'medical_services' : c === 'Bakery' ? 'bakery_dining' : 'storefront';
  const nextRun = runs[0];

  return (
    <>
      <div className="chrome">
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, lineHeight: '14px', letterSpacing: .5, textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>{t('Deliver to')}</div>
          <div className="row" style={{ gap: 4, fontWeight: 600, fontSize: 15, lineHeight: '22px', cursor: 'pointer' }} onClick={() => setDeliver(true)} role="button" aria-label={t('Change delivery address')}><Icon name={address?.source === 'gps' ? 'my_location' : 'location_on'} size={18} color="var(--gm-accent)" /><span className="ellip">{headerLine}</span><Icon name="expand_more" size={18} /></div>
        </div>
        <NotificationBell onOpen={n => { if (n.orderId) nav(`/customer/order/${n.orderId}`); }} />
        <Avatar initials={initials(user.name)} src={user.photoUrl} size="md" onClick={() => nav('/customer/profile')} />
      </div>
      <Body>
        {(gps === 'denied' || gps === 'unavailable') && !address && <AlertBanner type="caution" action={<Button variant="text" color="primary" size="small" onClick={() => setDeliver(true)}>{t('Pick')}</Button>}>{hint(gps)}</AlertBanner>}
        {address && address.handoff && address.handoff !== 'in_person' && <div className="cap" style={{ marginTop: -8 }}><Icon name="door_front" size={14} /> {address.handoff === 'gate' ? t('Orders are left at the gate with a photo') : t('Orders are left at your door with a photo')}</div>}
        <Input placeholder={t('Search shops or items')} prefixIcon="search" value={q} onChange={e => setQ(e.target.value)} />
        {activeOrders.map(o => (
          <div key={o.id} className="card row clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav(`/customer/order/${o.id}`)}>
            <Icon name={o.status === 'scheduled' ? 'event_upcoming' : 'local_shipping'} size={24} color="var(--brand-primary-rest)" />
            <div className="grow"><div className="b">{t('Order')} {o.id} · {orderSummary(o)}</div><div className="cap13">{liveLabel(o)}</div></div>
            <StatusChip status="progress" label={o.status === 'scheduled' ? t('Trip') : t('Live')} />
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>
        ))}
        <div className="card">
          <div className="h16">{t('Need something from nearby?')}</div>
          <div className="cap13">{t('Groceries, vegetables, medicines, anything. A partner nearby buys it and brings it to you.')}</div>
          <div className="row" style={{ gap: 8 }}>
            <Input placeholder={t('e.g. 2 kg onions')} value={item} onChange={e => setItem(e.target.value)} onEnter={startList} style={{ flex: 1 }} />
            <Button color="primary" icon="checklist" onClick={startList}>{t('Start list')}</Button>
          </div>
        </div>
        {nextRun && <div className="card row clickable" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav(`/customer/runs/${nextRun.id}`)}>
          <Avatar initials={nextRun.partner?.initials ?? 'P'} src={nextRun.partner?.photoUrl} size="lg" />
          <div className="grow"><div className="b">{t('{name} is going to {place}', { name: nextRun.partnerName.split(' ')[0], place: nextRun.destination })}</div><div className="cap">{t('Leaves {time} · ₹{fee} per order · {seats} seats left', { time: timeAt(nextRun.departAt), fee: nextRun.feePerOrder, seats: nextRun.seats })}{runs.length > 1 ? ` · ${t('{n} more trips', { n: runs.length - 1 })}` : ''}</div></div>
          <Icon name="chevron_right" size={22} color="var(--icon)" />
        </div>}
        <div className="card row clickable" onClick={() => { setCoKind('parcel'); nav('/customer/package'); }}>
          <div className="tile"><Icon name="inventory_2" size={20} /></div>
          <div className="grow"><div className="b">{t('Send a package')}</div><div className="cap">{t('Keys, documents, a food box. Picked up from you, handed to anyone in the city.')}</div></div>
          <Icon name="chevron_right" size={22} color="var(--icon)" />
        </div>
        {board && <div className="card row clickable" onClick={() => nav('/customer/community')}>
          <div className="tile"><Icon name="groups" size={20} /></div>
          <div className="grow"><div className="b">{board.community.name}</div><div className="cap">{board.announcements[0]?.text ?? t('Notice board and trips for your community')}</div></div>
          <Icon name="chevron_right" size={22} color="var(--icon)" />
        </div>}
        <div className="between">
          <div className="h16">{t('Shops nearby')}</div>
          <div className="row" style={{ gap: 6 }}><Chip label={t('List')} leftIcon="view_list" selected={view === 'list'} onClick={() => setView('list')} /><Chip label={t('Map')} leftIcon="map" selected={view === 'map'} onClick={() => setView('map')} /></div>
        </div>
        {view === 'map' && <>
          <ShopsMap shops={shops} home={address ? { lat: address.lat, lng: address.lng } : null} onPick={id => nav(`/customer/shop/${id}`)} />
          <div className="list">{shops.map(sh => <div key={sh.id} className="item clickable" onClick={() => nav(`/customer/shop/${sh.id}`)}>{sh.photoUrl ? <img className="thumb" src={sh.photoUrl} alt="" /> : <div className="tile"><Icon name={shopIcon(sh.cat)} size={20} /></div>}<div className="grow"><div className="b ellip">{sh.name}</div><div className="cap">{sh.cat} · {fmtKm(sh.distKm)} · {sh.etaLabel}</div></div><StatusChip status={sh.open ? 'success' : 'ended'} label={sh.open ? t('Open') : t('Closed')} /></div>)}</div>
        </>}
        {view === 'list' && <div className="grid2">
          {shops.map(sh => (
            <div key={sh.id} className="card clickable" style={{ padding: sh.photoUrl ? 0 : 12, gap: 8, overflow: 'hidden' }} onClick={() => nav(`/customer/shop/${sh.id}`)}>
              {sh.photoUrl ? <img className="photo" src={sh.photoUrl} alt="" style={{ height: 90 }} /> : <div className="tile"><Icon name={shopIcon(sh.cat)} size={20} /></div>}
              <div className="col" style={{ gap: 8, padding: sh.photoUrl ? '0 12px 12px' : 0 }}>
                <div style={{ minWidth: 0 }}><div className="b ellip">{sh.name}</div><div className="cap">{sh.cat}</div></div>
                <div className="cap">{fmtKm(sh.distKm)} · {sh.etaLabel}</div>
                <div className="between" style={{ gap: 6 }}><StatusChip status={sh.open ? 'success' : 'ended'} label={sh.open ? t('Open') : t('Closed')} /><span className="cap">{t('{n} items', { n: sh.itemCount })}</span></div>
              </div>
            </div>
          ))}
        </div>}
        {!shops.length && q && <div className="cap13" style={{ textAlign: 'center' }}>{t('No shops match “{q}”. Try a list instead.', { q })}</div>}
        {!shops.length && !q && <div className="cap13" style={{ textAlign: 'center' }}>{t('No shops listed near here yet. Make a list, or join a trip to town.')}</div>}
        <AlertBanner type="info" title="GETME20" icon="sell">{t('₹20 off delivery on lists this week')}</AlertBanner>
      </Body>
      <CustomerTabs />
      <DeliverToSheet open={deliver} onClose={() => setDeliver(false)} />
    </>
  );
}
