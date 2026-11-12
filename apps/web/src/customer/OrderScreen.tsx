// /customer/order/:id — picks the right view for the order's status.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { C_STEPS, P_STEPS, ISSUES, TAGS, TIPS, fmt, fmtKm, isCancellable, stepIndex } from '@getme/core';
import { api } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { CallOverlay } from '../lib/phone';
import { Avatar, Body, Button, Chip, Header, Icon, IconButton, Map, Sheet, Stars, StatusChip } from '../ui';
import { statusLabel } from './Home';
import { PAY_LABEL, dayAt, itemsLabel, orderSummary, timeAt, useCustomer, useOrderEvent } from './state';

export function OrderScreen() {
  const { id } = useParams(); const nav = useNavigate();
  const { orders, patchOrder } = useCustomer();
  const o = orders[id!];
  useEffect(() => { if (!o && id) api(`/api/orders/${id}`).then(patchOrder).catch(() => nav('/customer/orders', { replace: true })); }, [id, o, patchOrder, nav]);
  if (!o) return <><Header title="Order" onBack={() => nav('/customer')} /><Body><div className="cap13">…</div></Body></>;
  if (o.status === 'delivered' && !o.rating) return <Delivered o={o} />;
  if (o.status === 'delivered' || o.status === 'cancelled' || o.status === 'expired') return <Detail o={o} />;
  if (o.status === 'scheduled') return <Scheduled o={o} />;
  if (o.courierId) return <Track o={o} />;
  if (o.mode === 'choose' && !o.chosenId) return <Choose o={o} />;
  return <Finding o={o} />;
}

function CancelSheet({ open, onClose, onCancel, title }: { open: boolean; onClose: () => void; onCancel: () => void; title?: string }) {
  const { t } = useT();
  return <Sheet open={open} onClose={onClose}><div className="h17">{title ?? t('Cancel this request?')}</div><div className="cap13">{t('No charge if the partner has not bought anything yet.')}</div><Button color="warn" size="tall" fullWidth onClick={onCancel}>{t('Cancel request')}</Button><Button variant="outlined" size="tall" fullWidth onClick={onClose}>{t('Keep waiting')}</Button></Sheet>;
}
function CancelButton({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return <button onClick={onClick} style={{ height: 32, padding: '0 10px', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', borderRadius: 4, color: '#fff', font: '400 13px/1 var(--font-sans)', cursor: 'pointer' }}>{t('Cancel')}</button>;
}
function useCancel(o: any) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { toast } = useStore(); const { t } = useT();
  const [open, setOpen] = useState(false);
  const cancel = async () => { try { const r = await ev(o.id, { type: 'cancel', reason: 'Changed my mind' }); if (r) toast(t('Order {id} cancelled', { id: o.id })); nav('/customer', { replace: true }); } catch (e) { errToast(e); } finally { setOpen(false); } };
  return { open, setOpen, sheet: <CancelSheet open={open} onClose={() => setOpen(false)} onCancel={cancel} />, can: isCancellable(o, 'customer') };
}

function Choose({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { session, setMe } = useStore(); const { t } = useT();
  const [partners, setPartners] = useState<any[]>([]);
  const c = useCancel(o);
  const favs = session?.me.favourites ?? [];
  useEffect(() => { api(`/api/orders/${o.id}/partners`).then(setPartners).catch(() => {}); const t = setInterval(() => api(`/api/orders/${o.id}/partners`).then(setPartners).catch(() => {}), 8000); return () => clearInterval(t); }, [o.id, o.declinedIds?.length]);
  const sorted = useMemo(() => [...partners].sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0)), [partners, favs]);
  const fav = async (pid: string) => { try { const r = await api(`/api/favourites/${pid}`, { method: 'POST', body: {} }); setMe({ favourites: r.favourites }); } catch (e) { errToast(e); } };
  const pick = async (pid: string) => { try { await ev(o.id, { type: 'choose_partner', partnerId: pid }); } catch (e) { errToast(e); } };
  const origin = o.shopPos ?? o.pickup ?? o.address;
  return (
    <>
      <Header title={t('Choose a partner')} onBack={() => nav('/customer')} right={<CancelButton onClick={() => c.setOpen(true)} />} />
      <Body tight>
        <Map a={o.shopPos ?? o.pickup} aIcon={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} b={o.address} bIcon={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} pool={partners.map(p => p.pos).filter(Boolean)} route={origin ? [origin, o.address] : null} />
        <div className="cap">{t('{n} partners nearby · favourites first, then by distance', { n: partners.length })}</div>
        {!partners.length && <div className="cap13" style={{ textAlign: 'center', padding: 16 }}>{t('No partners online nearby right now. Try again in a minute or cancel and broadcast instead.')}</div>}
        {sorted.map(p => (
          <div key={p.id} className="card row flat" style={{ padding: 12 }}>
            <Avatar initials={p.initials} src={p.photoUrl} size="lg" />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}><span className="b">{p.name}</span><Icon name="star" size={14} filled color="var(--severity-low)" /><span style={{ fontSize: 13 }}>{p.rating.toFixed(1)}</span></div>
              <div className="cap">{p.vehicle} · {t('{d} away', { d: fmtKm(p.km) })} · {t('{n} trips', { n: p.trips.toLocaleString('en-IN') })}</div>
              <div className="cap">{t('Can reach you in ~{n} min', { n: p.etaMin })}</div>
            </div>
            <button onClick={() => fav(p.id)} aria-label="Favourite" style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: p.fav || favs.includes(p.id) ? 'var(--brand-warn-rest)' : 'var(--text-disabled)' }}><Icon name="favorite" size={22} filled={p.fav || favs.includes(p.id)} /></button>
            {p.declined ? <StatusChip status="ended" label={t('Declined')} /> : <Button color="primary" size="small" onClick={() => pick(p.id)}>{t('Request')}</Button>}
          </div>))}
      </Body>
      {c.sheet}
    </>
  );
}

function Finding({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { t } = useT();
  const c = useCancel(o);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const el = Math.max(0, Math.floor((now - Date.parse(o.times.requesting ?? o.createdAt)) / 1000));
  const chosen = o.chosenId ? (o.counter?.partnerName ?? 'the partner') : '';
  const expired = o.status === 'expired';
  const title = expired ? t('No partner found') : o.mode === 'broadcast' ? t('Request sent to partners within {km} km', { km: o.searchRadiusKm }) : o.mode === 'offers' ? t('Collecting offers from partners nearby') : t('Waiting for {name} to respond', { name: chosen });
  const sub = expired ? t('Nobody accepted in time. Try again or widen your options.') : o.mode === 'broadcast' ? t('The first partner to accept takes it. Usually under a minute.') : o.mode === 'offers' ? t('Pick the offer you like. Offers stay open for 3 minutes.') : t('They can accept, ask for extra, or decline.');
  const seen = o.mode === 'choose' ? t('Sent to 1 partner') : t('Seen by {n} partners', { n: o.seenIds?.length ?? 0 });
  const act = (body: any) => ev(o.id, body).catch(errToast);
  const sched = o.when === 'schedule' && o.scheduledAt && Date.parse(o.scheduledAt) > now;
  return (
    <>
      <Header title={`${t('Order')} ${o.id}`} onBack={() => nav('/customer')} right={!expired && <CancelButton onClick={() => c.setOpen(true)} />} />
      <Body>
        <div className="card">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!expired && !sched && <><span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '2px solid var(--brand-primary-rest)', animation: 'gm-pulse 1.8s ease-out infinite' }} /><span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '2px solid var(--brand-primary-rest)', animation: 'gm-pulse 1.8s ease-out .9s infinite' }} /></>}
              <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--surface-info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={expired ? 'search_off' : sched ? 'schedule' : 'near_me'} size={22} color="var(--brand-primary-rest)" /></span>
            </div>
            <div className="grow col" style={{ gap: 4 }}><div className="h16">{sched ? `${t('Scheduled')} · ${o.slot}` : title}</div><div className="cap13">{sched ? t('Partners are asked about 20 minutes before the slot.') : sub}</div></div>
          </div>
          {!expired && !sched && <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}><Icon name="timer" size={16} /><span className="mono">{Math.floor(el / 60)}:{String(el % 60).padStart(2, '0')}</span><span>·</span><span>{seen}</span></div>}
          {expired && <div className="row" style={{ gap: 8 }}><Button color="primary" fullWidth style={{ flex: 1 }} onClick={() => nav(o.kind === 'parcel' ? '/customer/package' : o.kind === 'shop' ? `/customer/shop/${o.shopId}` : '/customer/list')}>{t('Try again')}</Button><Button variant="outlined" fullWidth style={{ flex: 1 }} onClick={() => nav('/customer')}>{t('Home')}</Button></div>}
        </div>
        {o.status === 'counter' && o.counter && (
          <div className="card flat" style={{ background: 'var(--surface-caution-light)', borderColor: 'var(--severity-low)' }}>
            <div className="row" style={{ gap: 8 }}><Icon name="currency_rupee" size={22} color="var(--text-caution)" /><div style={{ font: '600 15px/20px var(--font-sans)' }}>{t('{name} asks for {amount} extra', { name: o.counter.partnerName, amount: fmt(o.counter.amount) })}</div></div>
            <div style={{ fontSize: 13, lineHeight: '18px' }}>{t('Reason')}: {t(o.counter.reason)}. {t('New delivery fee {fee}.', { fee: fmt(o.fee.delivery + o.counter.amount) })}</div>
            <div className="row" style={{ gap: 8 }}><Button color="primary" fullWidth style={{ flex: 1 }} onClick={() => act({ type: 'approve_counter' })}>{t('Approve')}</Button><Button variant="outlined" fullWidth style={{ flex: 1 }} onClick={() => act({ type: 'decline_counter' })}>{t('Decline')}</Button></div>
          </div>)}
        {o.mode === 'offers' && !expired && (
          <div className="col">
            <div className="h16">{t('Offers')} · {o.offers.length}</div>
            {!o.offers.length && <div style={{ border: '1px dashed var(--surface-border-strong)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>{t('Offers arrive here as partners respond.')}</div>}
            {o.offers.map((of: any) => (
              <div key={of.partnerId} className="card row flat" style={{ padding: 12 }}>
                <Avatar initials={of.partnerName.split(' ').map((s: string) => s[0]).join('').slice(0, 2)} size="lg" />
                <div className="grow"><div className="b">{of.partnerName}</div><div style={{ fontSize: 13, lineHeight: '18px' }}><span className="mono b">{fmt(of.price)}</span> {t('delivery · reaches you in ~{n} min', { n: of.etaMin })}</div></div>
                <Button color="primary" size="small" onClick={() => act({ type: 'accept_offer', partnerId: of.partnerId })}>{t('Accept')}</Button>
              </div>))}
          </div>)}
        {o.mode === 'choose' && o.chosenId && !expired && <Button variant="text" color="primary" onClick={() => act({ type: 'choose_partner', partnerId: '' }).catch(() => {})} style={{ display: 'none' }}>Change partner</Button>}
        <div className="card flat" style={{ padding: '12px 16px', gap: 4, fontSize: 13, lineHeight: '18px' }}>
          <div className="b">{orderSummary(o)}</div>
          <div className="sec">{itemsLabel(o)}</div>
          <div className="sec">{t('Deliver to')} {o.address.label ? t(o.address.label) + ' · ' : ''}{fmtAddress(o.address)}</div>
          <div className="sec">{t(PAY_LABEL[o.pay])} · {o.bill.totalLabel}</div>
        </div>
      </Body>
      {c.sheet}
    </>
  );
}

/** Order attached to a partner's announced trip, waiting for departure. */
function Scheduled({ o }: { o: any }) {
  const nav = useNavigate(); const { t } = useT(); const { unread } = useCustomer();
  const c = useCancel(o);
  const [calling, setCalling] = useState(false);
  const run = o.run;
  return (
    <>
      <Header onBack={() => nav('/customer')} right={<CancelButton onClick={() => c.setOpen(true)} />}><div className="grow"><div className="title">{t('Order')} {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{t('Riding along on a trip')}</div></div></Header>
      <Body>
        <div className="card" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }}>
          <div className="row" style={{ gap: 12 }}><span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="event_upcoming" size={22} color="var(--brand-primary-rest)" /></span>
            <div className="grow"><div className="h16">{run ? t('Riding along on {run}', { run: run.label }) : t('Waiting for the trip to start')}</div><div className="cap13">{run ? t('Leaves {day} {time} to {place}. Your list is bought on the way and delivered after.', { day: dayAt(run.departAt), time: timeAt(run.departAt), place: run.destination }) : ''}</div></div></div>
          {run && <Button variant="text" color="primary" size="small" onClick={() => nav(`/customer/runs/${run.id}`)}>{t('Open the trip')}</Button>}
        </div>
        {o.courier && <div className="card row" style={{ padding: 12 }}>
          <Avatar initials={o.courier.initials} src={o.courier.photoUrl} size="lg" />
          <div className="grow"><div className="b">{o.courier.name}</div><div className="cap">{o.courier.vehicle} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {o.courier.rating} · {t('{n} trips', { n: o.courier.trips.toLocaleString('en-IN') })}</div></div>
          <IconButton icon="chat" label={t('Chat')} color="primary" onClick={() => nav(`/customer/order/${o.id}/chat`)} badge={unread[o.id] || undefined} />
          <IconButton icon="call" label={t('Call')} color="primary" onClick={() => setCalling(true)} />
        </div>}
        <div className="card flat" style={{ padding: '12px 16px', gap: 4, fontSize: 13, lineHeight: '18px' }}>
          <div className="b">{orderSummary(o)}</div>
          <div className="sec">{itemsLabel(o)}</div>
          <div className="sec">{t('Deliver to')} {t(o.address.label)} · {fmtAddress(o.address)}</div>
          <div className="sec">{t(PAY_LABEL[o.pay])} · {t('Trip fee')} {fmt(o.fee.delivery)} · {o.bill.totalLabel}</div>
        </div>
        <div className="cap13">{t('You can cancel until the trip starts. After that the partner is already buying for you.')}</div>
      </Body>
      {c.sheet}
      {calling && <CallOverlay name={o.courier?.name ?? 'Partner'} onEnd={() => setCalling(false)} />}
    </>
  );
}

function Track({ o }: { o: any }) {
  const nav = useNavigate(); const { toast, session } = useStore(); const errToast = useErrorToast(); const { t } = useT();
  const { unread } = useCustomer();
  const c = useCancel(o);
  const [sos, setSos] = useState(false);
  const [calling, setCalling] = useState(false);
  const parcel = o.kind === 'parcel';
  const steps = (parcel ? P_STEPS : C_STEPS).map(([label, key]) => ({ label, key }));
  const idx = stepIndex(o.status, parcel ? P_STEPS : C_STEPS);
  const eta = o.status === 'arrived' ? t('Partner is at your door') : o.status === 'shopping' ? (parcel ? t('Collecting the package') : t('Buying your items')) : o.etaMin != null ? t('Arriving in ~{n} min', { n: o.etaMin }) : t('On the way');
  const handoff = o.address.handoff ?? 'in_person';
  const showOtp = (o.status === 'to_customer' || o.status === 'arrived') && (parcel || handoff === 'in_person');
  const origin = o.shopPos ?? o.pickup;
  const share = async () => {
    try { const r = await api(`/api/orders/${o.id}/share`, { method: 'POST', body: {} }); const url = `${location.origin}/track/${r.token}`;
      if (navigator.share) await navigator.share({ title: `GetMe order ${o.id}`, url }); else { await navigator.clipboard.writeText(url); toast(t('Tracking link copied')); } } catch (e: any) { if (e?.name !== 'AbortError') errToast(e); }
  };
  const bill = o.bill;
  const rows = [...(parcel ? [] : [[t('Items'), bill.itemsLabel === 'Added after purchase' ? t('Added after purchase') : bill.itemsLabel]]), [o.runId ? t('Trip fee') : t('Delivery fee'), fmt(o.fee.delivery)], [t('Service fee'), fmt(o.fee.service)], ...(o.fee.extra ? [[`${t('Extra')} · ${t(o.fee.extraReason)}`, '+' + fmt(o.fee.extra)]] : []), ...(o.fee.insure ? [[t('Package protection'), fmt(o.fee.insure)]] : []), ...(o.promo ? [[`${t('Promo')} ${o.promoCode}`, '−' + fmt(o.promo)]] : [])];
  const sosRows = [
    { icon: 'support_agent', color: 'var(--brand-primary-rest)', label: t('Call GetMe safety line'), sub: t('24×7 · answered in under a minute'), run: () => { setSos(false); setCalling(true); } },
    { icon: 'share_location', color: 'var(--brand-primary-rest)', label: t('Share live trip with a contact'), sub: t('Sends a tracking link by SMS'), run: () => { setSos(false); share(); } },
    { icon: 'emergency', color: 'var(--brand-warn-rest)', label: t('Call 112'), sub: t('Police, ambulance, fire'), run: () => { setSos(false); toast(t('Dialling 112 · your location is attached')); location.href = 'tel:112'; } },
  ];
  return (
    <>
      <Header onBack={() => nav('/customer')} right={c.can && <CancelButton onClick={() => c.setOpen(true)} />}>
        <div className="grow"><div className="title">{t('Order')} {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{t(statusLabel(o))}</div></div>
      </Header>
      <Body pad style={{ padding: '0 0 24px' }}>
        <div style={{ position: 'relative' }}>
          <Map a={origin} aIcon={parcel ? 'inventory_2' : 'storefront'} b={o.address} bIcon={parcel ? 'person_pin_circle' : 'home'} courier={o.courierPos} route={origin ? [origin, o.address] : null} tall />
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 500, background: 'var(--gm-chrome)', color: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-menu)' }}><Icon name="schedule" size={16} color="var(--gm-accent)" />{eta}</div>
        </div>
        <div className="col" style={{ padding: '0 16px', gap: 16 }}>
          {o.courier && <div className="card row" style={{ padding: 12 }}>
            <Avatar initials={o.courier.initials} src={o.courier.photoUrl} size="lg" />
            <div className="grow"><div className="b">{o.courier.name}</div><div className="cap">{o.courier.vehicle}{o.courier.plate ? ' · ' + o.courier.plate : ''} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {o.courier.rating} · {t('{n} trips', { n: o.courier.trips.toLocaleString('en-IN') })}</div></div>
            <IconButton icon="chat" label={t('Chat')} color="primary" onClick={() => nav(`/customer/order/${o.id}/chat`)} badge={unread[o.id] || undefined} />
            <IconButton icon="call" label={t('Call')} color="primary" onClick={() => setCalling(true)} />
          </div>}
          <div className="row" style={{ gap: 8 }}><Button variant="outlined" icon="share" fullWidth style={{ flex: 1 }} onClick={share}>{t('Share trip')}</Button><Button variant="outlined" color="warn" icon="emergency" fullWidth style={{ flex: 1 }} onClick={() => setSos(true)}>{t('Safety')}</Button></div>
          {showOtp && <div className="card row flat" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }}>
            <div className="grow"><div className="b">{t('Handover code')}</div><div className="cap">{parcel ? t('Share this code with the receiver. They tell it to the partner at handover.') : t('Tell the partner this code when your items arrive')}</div></div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, color: 'var(--brand-primary-rest)' }}>{o.otp}</div>
          </div>}
          {!parcel && handoff !== 'in_person' && (o.status === 'to_customer' || o.status === 'arrived') && <div className="card row flat" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }}><Icon name="door_front" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{handoff === 'gate' ? t('Will be left at the gate') : t('Will be left at your door')}</div><div className="cap">{t('No code needed. The partner takes a photo as proof of delivery.')}</div></div></div>}
          {parcel && o.receiver && <div className="card row flat"><Icon name="person_pin_circle" size={22} color="var(--brand-fox-red)" /><div className="grow"><div className="b">{t('Receiver')} · {o.receiver.name}{o.receiver.phone ? ' · ' + o.receiver.phone : ''}</div><div className="cap">{t('Gets an SMS link with live tracking and the handover code')}</div></div></div>}
          <div className="card flat" style={{ padding: '12px 16px', gap: 10 }}>
            {steps.map((s, i) => <div key={s.key} className="row" style={{ gap: 10 }}><Icon name={i < idx ? 'check_circle' : i === idx ? 'radio_button_checked' : 'radio_button_unchecked'} size={20} color={i < idx ? 'var(--brand-confirm-rest)' : i === idx ? 'var(--brand-primary-rest)' : 'var(--text-disabled)'} /><span className="grow" style={{ fontWeight: i === idx ? 600 : 400, color: i > idx ? 'var(--text-secondary)' : 'var(--text)' }}>{t(s.label)}</span><span className="cap mono">{o.times[s.key] ? new Date(o.times[s.key]).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}</span></div>)}
          </div>
          <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
            <div className="b" style={{ fontSize: 14, marginBottom: 2 }}>{itemsLabel(o)}</div>
            {!parcel && o.items.some((i: any) => i.substitute || i.unavailable) && <div className="cap" style={{ color: 'var(--text-caution)' }}>{o.items.filter((i: any) => i.substitute).map((i: any) => `${i.name} → ${i.substitute}`).concat(o.items.filter((i: any) => i.unavailable && !i.substitute).map((i: any) => `${i.name} ${t('unavailable')}`)).join(' · ')}</div>}
            {rows.map(([k, v]) => <div key={k} className="between"><span>{k}</span><span className="mono">{v}</span></div>)}
            {(o.receiptUrl || o.pickupPhotoUrl) && <a href={o.receiptUrl ?? o.pickupPhotoUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, textDecoration: 'none', fontSize: 13 }}><Icon name="receipt_long" size={18} />{parcel ? t('Open pickup photo') : t('Open receipt photo')}</a>}
            <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>{t('Total')}</span><span className="mono">{bill.totalLabel}</span></div>
            <div className="cap">{t(PAY_LABEL[o.pay])}{o.pay === 'wallet' ? ` · ${t('balance')} ${fmt(session?.me.wallet ?? 0)}` : ''}</div>
          </div>
        </div>
      </Body>
      {c.sheet}
      <Sheet open={sos} onClose={() => setSos(false)} title={t('Safety')}>
        <div className="cap13">{t('Your trip details are already with GetMe safety. Pick what you need.')}</div>
        {sosRows.map(r => <button key={r.label} onClick={r.run} className="card row flat" style={{ cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--text)' }}><Icon name={r.icon} size={22} color={r.color} /><div className="grow"><div className="b">{r.label}</div><div className="cap">{r.sub}</div></div></button>)}
      </Sheet>
      {calling && <CallOverlay name={o.courier?.name ?? 'GetMe safety'} onEnd={() => setCalling(false)} />}
    </>
  );
}

function PodPhoto({ o }: { o: any }) {
  const { t } = useT();
  if (!o.podPhotoUrl) return null;
  const where = o.address?.handoff === 'gate' ? t('Left at the gate') : t('Left at the door');
  return <a href={o.podPhotoUrl} target="_blank" rel="noreferrer" className="card flat" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}><img className="photo" src={o.podPhotoUrl} alt="" /><div style={{ padding: '8px 12px' }} className="cap"><Icon name="photo_camera" size={14} /> {where} · {t('photo by {name}', { name: o.courierName })}</div></a>;
}

function Delivered({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { toast } = useStore(); const { t } = useT();
  const [tip, setTip] = useState(20); const [stars, setStars] = useState(5); const [tags, setTags] = useState<string[]>([]); const [issue, setIssue] = useState(''); const [busy, setBusy] = useState(false);
  const total = o.bill.total + tip;
  const submit = async () => { setBusy(true); try { if (tip !== o.tip) await ev(o.id, { type: 'tip', amount: tip }); await ev(o.id, { type: 'rate', stars, tags }); toast(t('Thanks for rating')); nav('/customer', { replace: true }); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const report = async () => { try { await ev(o.id, { type: 'report_issue', issue }); setIssue(''); } catch (e) { errToast(e); } };
  return (
    <>
      <Header title={t('Delivered')} />
      <Body>
        <div className="col" style={{ alignItems: 'center', gap: 6, padding: '12px 0 4px', textAlign: 'center' }}>
          <Icon name="check_circle" size={48} color="var(--brand-confirm-rest)" />
          <div style={{ font: '600 18px/24px var(--font-sans)' }}>{t('Delivered by {name} at {time}', { name: o.courierName, time: o.times.delivered ? timeAt(o.times.delivered) : '' })}</div>
          <div className="cap13">{o.pay === 'cod' ? t('{total} paid in cash to the partner', { total: o.bill.totalLabel }) : t('{total} charged to {method}', { total: o.bill.totalLabel, method: t(PAY_LABEL[o.pay]) })}</div>
        </div>
        <PodPhoto o={o} />
        <div className="card flat"><div className="b">{t('Add a tip for {name}', { name: o.courierName })}</div><div className="wrap">{TIPS.map(v => <Chip key={v} label={v ? fmt(v) : t('No tip')} selected={tip === v} onClick={() => setTip(v)} />)}</div><div className="cap">{t('100% of the tip goes to the partner.')}</div></div>
        <div className="card flat"><div className="b">{t('Rate the delivery')}</div><Stars value={stars} onChange={setStars} /><div className="wrap">{TAGS.map(v => <Chip key={v} label={t(v)} selected={tags.includes(v)} onClick={() => setTags(x => x.includes(v) ? x.filter(y => y !== v) : [...x, v])} />)}</div></div>
        <div className="card flat"><div className="b">{t('Something wrong?')}</div><div className="wrap">{ISSUES.map(i => <Chip key={i} label={t(i)} selected={issue === i} onClick={() => setIssue(issue === i ? '' : i)} />)}</div>{issue && <Button variant="outlined" color="warn" fullWidth onClick={report}>{t('Report and request a refund')}</Button>}{o.refund && <div className="cap" style={{ color: 'var(--text-caution)' }}>{t('Refund of {amount} {status} · reviewed within 24 h', { amount: fmt(o.refund.amount), status: t(o.refund.status) })}</div>}</div>
        <div className="between" style={{ fontWeight: 600, fontSize: 15, padding: '0 4px' }}><span>{t('Total paid')}</span><span className="mono">{fmt(total)}</span></div>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth onClick={submit} loading={busy}>{t('Submit rating')}</Button></div>
    </>
  );
}

/** Read-only detail for past orders. */
function Detail({ o }: { o: any }) {
  const nav = useNavigate(); const { t } = useT();
  const parcel = o.kind === 'parcel';
  const chip = o.status === 'delivered' ? { s: 'success' as const, l: t('Delivered') } : o.status === 'expired' ? { s: 'ended' as const, l: t('No partner') } : { s: 'ended' as const, l: t('Cancelled') };
  const rows = [...(parcel ? [] : [[t('Items'), o.bill.itemsLabel]]), [o.runId ? t('Trip fee') : t('Delivery fee'), fmt(o.fee.delivery)], [t('Service fee'), fmt(o.fee.service)], ...(o.fee.extra ? [[`${t('Extra')} · ${t(o.fee.extraReason)}`, '+' + fmt(o.fee.extra)]] : []), ...(o.fee.insure ? [[t('Package protection'), fmt(o.fee.insure)]] : []), ...(o.promo ? [[`${t('Promo')} ${o.promoCode}`, '−' + fmt(o.promo)]] : []), ...(o.tip ? [[t('Tip'), fmt(o.tip)]] : [])];
  return (
    <>
      <Header onBack={() => nav('/customer/orders')} right={<StatusChip status={chip.s} label={chip.l} />}><div className="grow"><div className="title">{t('Order')} {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {orderSummary(o)}</div></div></Header>
      <Body>
        <div className="card flat" style={{ gap: 4, fontSize: 13, lineHeight: '18px' }}><div className="b">{orderSummary(o)}</div><div className="sec">{itemsLabel(o)}</div><div className="sec">{t('Deliver to')} {fmtAddress(o.address)}</div>{o.courierName && <div className="sec">{t('Partner')} · {o.courierName}</div>}{o.run && <div className="sec">{t('Trip')} · {o.run.label}</div>}{o.cancelReason && <div className="sec">{t('Reason')} · {o.cancelReason}</div>}</div>
        <PodPhoto o={o} />
        {o.status === 'delivered' && <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
          {rows.map(([k, v]) => <div key={k} className="between"><span>{k}</span><span className="mono">{v}</span></div>)}
          {o.receiptUrl && <a href={o.receiptUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, textDecoration: 'none', fontSize: 13 }}><Icon name="receipt_long" size={18} />{t('Open receipt photo')}</a>}
          <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>{t('Total paid')}</span><span className="mono">{fmt(o.bill.total + o.tip)}</span></div>
          <div className="cap">{t(PAY_LABEL[o.pay])}{o.rating ? ` · ${t('rated {n} stars', { n: o.rating.stars })}` : ''}{o.refund ? ` · ${t('refund')} ${t(o.refund.status)}` : ''}</div>
        </div>}
        {o.status === 'delivered' && <div className="card flat" style={{ padding: '12px 16px', gap: 10 }}>{(parcel ? P_STEPS : C_STEPS).map(([label, key]) => <div key={key} className="row" style={{ gap: 10 }}><Icon name="check_circle" size={20} color="var(--brand-confirm-rest)" /><span className="grow">{t(label)}</span><span className="cap mono">{o.times[key] ? timeAt(o.times[key]) : ''}</span></div>)}</div>}
        {o.kind !== 'parcel' && <Button variant="outlined" color="primary" fullWidth icon="replay" onClick={() => nav(o.kind === 'shop' ? `/customer/shop/${o.shopId}` : '/customer/list')}>{t('Order again')}</Button>}
      </Body>
    </>
  );
}
