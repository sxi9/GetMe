// /customer/order/:id — picks the right view for the order's status.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { C_STEPS, P_STEPS, ISSUES, TAGS, TIPS, fmt, fmtKm, isCancellable, stepIndex } from '@getme/core';
import { api } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { CallOverlay } from '../lib/phone';
import { Avatar, Body, Button, Chip, Header, Icon, IconButton, Map, Sheet, Stars, StatusChip } from '../ui';
import { statusLabel } from './Home';
import { PAY_LABEL, itemsLabel, orderSummary, useCustomer, useOrderEvent } from './state';

export function OrderScreen() {
  const { id } = useParams(); const nav = useNavigate();
  const { orders, patchOrder } = useCustomer();
  const o = orders[id!];
  useEffect(() => { if (!o && id) api(`/api/orders/${id}`).then(patchOrder).catch(() => nav('/customer/orders', { replace: true })); }, [id, o, patchOrder, nav]);
  if (!o) return <><Header title="Order" onBack={() => nav('/customer')} /><Body><div className="cap13">Loading…</div></Body></>;
  if (o.status === 'delivered' && !o.rating) return <Delivered o={o} />;
  if (o.status === 'delivered' || o.status === 'cancelled' || o.status === 'expired') return <Detail o={o} />;
  if (o.courierId) return <Track o={o} />;
  if (o.mode === 'choose' && !o.chosenId) return <Choose o={o} />;
  return <Finding o={o} />;
}

function CancelSheet({ open, onClose, onCancel, title = 'Cancel this request?' }: { open: boolean; onClose: () => void; onCancel: () => void; title?: string }) {
  return <Sheet open={open} onClose={onClose}><div className="h17">{title}</div><div className="cap13">No charge if the partner has not bought anything yet.</div><Button color="warn" size="tall" fullWidth onClick={onCancel}>Cancel request</Button><Button variant="outlined" size="tall" fullWidth onClick={onClose}>Keep waiting</Button></Sheet>;
}
function CancelButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ height: 32, padding: '0 10px', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', borderRadius: 4, color: '#fff', font: '400 13px/1 var(--font-sans)', cursor: 'pointer' }}>Cancel</button>;
}
function useCancel(o: any) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const cancel = async () => { try { await ev(o.id, { type: 'cancel', reason: 'Changed my mind' }); toast(`Order ${o.id} cancelled`); nav('/customer', { replace: true }); } catch (e) { errToast(e); } finally { setOpen(false); } };
  return { open, setOpen, sheet: <CancelSheet open={open} onClose={() => setOpen(false)} onCancel={cancel} />, can: isCancellable(o, 'customer') };
}

function Choose({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { session, setMe } = useStore();
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
      <Header title="Choose a partner" onBack={() => nav('/customer')} right={<CancelButton onClick={() => c.setOpen(true)} />} />
      <Body tight>
        <Map a={o.shopPos ?? o.pickup} aIcon={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} b={o.address} bIcon={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} pool={partners.map(p => p.pos).filter(Boolean)} route={origin ? [origin, o.address] : null} />
        <div className="cap">{partners.length} partner{partners.length === 1 ? '' : 's'} nearby · favourites first, then by distance</div>
        {!partners.length && <div className="cap13" style={{ textAlign: 'center', padding: 16 }}>No partners online nearby right now. Try again in a minute or cancel and broadcast instead.</div>}
        {sorted.map(p => (
          <div key={p.id} className="card row flat" style={{ padding: 12 }}>
            <Avatar initials={p.initials} size="lg" />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}><span className="b">{p.name}</span><Icon name="star" size={14} filled color="var(--severity-low)" /><span style={{ fontSize: 13 }}>{p.rating.toFixed(1)}</span></div>
              <div className="cap">{p.vehicle} · {fmtKm(p.km)} away · {p.trips.toLocaleString('en-IN')} trips</div>
              <div className="cap">Can reach you in ~{p.etaMin} min</div>
            </div>
            <button onClick={() => fav(p.id)} aria-label="Favourite" style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: p.fav || favs.includes(p.id) ? 'var(--brand-warn-rest)' : 'var(--text-disabled)' }}><Icon name="favorite" size={22} filled={p.fav || favs.includes(p.id)} /></button>
            {p.declined ? <StatusChip status="ended" label="Declined" /> : <Button color="primary" size="small" onClick={() => pick(p.id)}>Request</Button>}
          </div>))}
      </Body>
      {c.sheet}
    </>
  );
}

function Finding({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast();
  const c = useCancel(o);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const el = Math.max(0, Math.floor((now - Date.parse(o.times.requesting ?? o.createdAt)) / 1000));
  const chosen = o.chosenId ? (o.counter?.partnerName ?? 'the partner') : '';
  const expired = o.status === 'expired';
  const title = expired ? 'No partner found' : o.mode === 'broadcast' ? `Request sent to partners within ${o.searchRadiusKm} km` : o.mode === 'offers' ? 'Collecting offers from partners nearby' : `Waiting for ${chosen} to respond`;
  const sub = expired ? 'Nobody accepted in time. Try again or widen your options.' : o.mode === 'broadcast' ? 'The first partner to accept takes it. Usually under a minute.' : o.mode === 'offers' ? 'Pick the offer you like. Offers stay open for 3 minutes.' : 'They can accept, ask for extra, or decline.';
  const seen = o.mode === 'choose' ? 'Sent to 1 partner' : `Seen by ${o.seenIds?.length ?? 0} partner${(o.seenIds?.length ?? 0) === 1 ? '' : 's'}`;
  const act = (body: any) => ev(o.id, body).catch(errToast);
  const sched = o.when === 'schedule' && o.scheduledAt && Date.parse(o.scheduledAt) > now;
  return (
    <>
      <Header title={`Order ${o.id}`} onBack={() => nav('/customer')} right={!expired && <CancelButton onClick={() => c.setOpen(true)} />} />
      <Body>
        <div className="card">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!expired && !sched && <><span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '2px solid var(--brand-primary-rest)', animation: 'gm-pulse 1.8s ease-out infinite' }} /><span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '2px solid var(--brand-primary-rest)', animation: 'gm-pulse 1.8s ease-out .9s infinite' }} /></>}
              <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--surface-info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={expired ? 'search_off' : sched ? 'schedule' : 'near_me'} size={22} color="var(--brand-primary-rest)" /></span>
            </div>
            <div className="grow col" style={{ gap: 4 }}><div className="h16">{sched ? `Scheduled · ${o.slot}` : title}</div><div className="cap13">{sched ? 'Partners are asked about 20 minutes before the slot.' : sub}</div></div>
          </div>
          {!expired && !sched && <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}><Icon name="timer" size={16} /><span className="mono">{Math.floor(el / 60)}:{String(el % 60).padStart(2, '0')}</span><span>·</span><span>{seen}</span></div>}
          {expired && <div className="row" style={{ gap: 8 }}><Button color="primary" fullWidth style={{ flex: 1 }} onClick={() => nav(o.kind === 'parcel' ? '/customer/package' : o.kind === 'shop' ? `/customer/shop/${o.shopId}` : '/customer/list')}>Try again</Button><Button variant="outlined" fullWidth style={{ flex: 1 }} onClick={() => nav('/customer')}>Home</Button></div>}
        </div>
        {o.status === 'counter' && o.counter && (
          <div className="card flat" style={{ background: 'var(--surface-caution-light)', borderColor: 'var(--severity-low)' }}>
            <div className="row" style={{ gap: 8 }}><Icon name="currency_rupee" size={22} color="var(--text-caution)" /><div style={{ font: '600 15px/20px var(--font-sans)' }}>{o.counter.partnerName} asks for {fmt(o.counter.amount)} extra</div></div>
            <div style={{ fontSize: 13, lineHeight: '18px' }}>Reason: {o.counter.reason}. New delivery fee {fmt(o.fee.delivery + o.counter.amount)}.</div>
            <div className="row" style={{ gap: 8 }}><Button color="primary" fullWidth style={{ flex: 1 }} onClick={() => act({ type: 'approve_counter' })}>Approve</Button><Button variant="outlined" fullWidth style={{ flex: 1 }} onClick={() => act({ type: 'decline_counter' })}>Decline</Button></div>
          </div>)}
        {o.mode === 'offers' && !expired && (
          <div className="col">
            <div className="h16">Offers · {o.offers.length}</div>
            {!o.offers.length && <div style={{ border: '1px dashed var(--surface-border-strong)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Offers arrive here as partners respond.</div>}
            {o.offers.map((of: any) => (
              <div key={of.partnerId} className="card row flat" style={{ padding: 12 }}>
                <Avatar initials={of.partnerName.split(' ').map((s: string) => s[0]).join('').slice(0, 2)} size="lg" />
                <div className="grow"><div className="b">{of.partnerName}</div><div style={{ fontSize: 13, lineHeight: '18px' }}><span className="mono b">{fmt(of.price)}</span> delivery · reaches you in ~{of.etaMin} min</div></div>
                <Button color="primary" size="small" onClick={() => act({ type: 'accept_offer', partnerId: of.partnerId })}>Accept</Button>
              </div>))}
          </div>)}
        {o.mode === 'choose' && o.chosenId && !expired && <Button variant="text" color="primary" onClick={() => act({ type: 'choose_partner', partnerId: '' }).catch(() => {})} style={{ display: 'none' }}>Change partner</Button>}
        <div className="card flat" style={{ padding: '12px 16px', gap: 4, fontSize: 13, lineHeight: '18px' }}>
          <div className="b">{orderSummary(o)}</div>
          <div className="sec">{itemsLabel(o)}</div>
          <div className="sec">Deliver to {o.address.label ? o.address.label + ' · ' : ''}{o.address.line}</div>
          <div className="sec">{PAY_LABEL[o.pay]} · {o.bill.totalLabel}</div>
        </div>
      </Body>
      {c.sheet}
    </>
  );
}

function Track({ o }: { o: any }) {
  const nav = useNavigate(); const { toast, session } = useStore(); const errToast = useErrorToast();
  const { unread } = useCustomer();
  const c = useCancel(o);
  const [sos, setSos] = useState(false);
  const [calling, setCalling] = useState(false);
  const parcel = o.kind === 'parcel';
  const steps = (parcel ? P_STEPS : C_STEPS).map(([label, key]) => ({ label, key }));
  const idx = stepIndex(o.status, parcel ? P_STEPS : C_STEPS);
  const eta = o.status === 'arrived' ? 'Partner is at your door' : o.status === 'shopping' ? (parcel ? 'Collecting the package' : 'Buying your items') : o.etaMin != null ? `Arriving in ~${o.etaMin} min` : 'On the way';
  const showOtp = o.status === 'to_customer' || o.status === 'arrived';
  const origin = o.shopPos ?? o.pickup;
  const share = async () => {
    try { const r = await api(`/api/orders/${o.id}/share`, { method: 'POST', body: {} }); const url = `${location.origin}/track/${r.token}`;
      if (navigator.share) await navigator.share({ title: `GetMe order ${o.id}`, url }); else { await navigator.clipboard.writeText(url); toast('Tracking link copied'); } } catch (e: any) { if (e?.name !== 'AbortError') errToast(e); }
  };
  const bill = o.bill;
  const rows = [...(parcel ? [] : [['Items', bill.itemsLabel]]), ['Delivery fee', fmt(o.fee.delivery)], ['Service fee', fmt(o.fee.service)], ...(o.fee.extra ? [[`Extra · ${o.fee.extraReason}`, '+' + fmt(o.fee.extra)]] : []), ...(o.fee.insure ? [['Package protection', fmt(o.fee.insure)]] : []), ...(o.promo ? [[`Promo ${o.promoCode}`, '−' + fmt(o.promo)]] : [])];
  const sosRows = [
    { icon: 'support_agent', color: 'var(--brand-primary-rest)', label: 'Call GetMe safety line', sub: '24×7 · answered in under a minute', run: () => { setSos(false); setCalling(true); } },
    { icon: 'share_location', color: 'var(--brand-primary-rest)', label: 'Share live trip with a contact', sub: 'Sends a tracking link by SMS', run: () => { setSos(false); share(); } },
    { icon: 'emergency', color: 'var(--brand-warn-rest)', label: 'Call 112', sub: 'Police, ambulance, fire', run: () => { setSos(false); toast('Dialling 112 · your location is attached'); location.href = 'tel:112'; } },
  ];
  return (
    <>
      <Header onBack={() => nav('/customer')} right={c.can && <CancelButton onClick={() => c.setOpen(true)} />}>
        <div className="grow"><div className="title">Order {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{statusLabel(o)}</div></div>
      </Header>
      <Body pad style={{ padding: '0 0 24px' }}>
        <div style={{ position: 'relative' }}>
          <Map a={origin} aIcon={parcel ? 'inventory_2' : 'storefront'} b={o.address} bIcon={parcel ? 'person_pin_circle' : 'home'} courier={o.courierPos} route={origin ? [origin, o.address] : null} tall />
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 500, background: 'var(--gm-chrome)', color: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-menu)' }}><Icon name="schedule" size={16} color="var(--gm-accent)" />{eta}</div>
        </div>
        <div className="col" style={{ padding: '0 16px', gap: 16 }}>
          {o.courier && <div className="card row" style={{ padding: 12 }}>
            <Avatar initials={o.courier.initials} size="lg" />
            <div className="grow"><div className="b">{o.courier.name}</div><div className="cap">{o.courier.vehicle}{o.courier.plate ? ' · ' + o.courier.plate : ''} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {o.courier.rating} · {o.courier.trips.toLocaleString('en-IN')} trips</div></div>
            <IconButton icon="chat" label="Chat" color="primary" onClick={() => nav(`/customer/order/${o.id}/chat`)} badge={unread[o.id] || undefined} />
            <IconButton icon="call" label="Call" color="primary" onClick={() => setCalling(true)} />
          </div>}
          <div className="row" style={{ gap: 8 }}><Button variant="outlined" icon="share" fullWidth style={{ flex: 1 }} onClick={share}>Share trip</Button><Button variant="outlined" color="warn" icon="emergency" fullWidth style={{ flex: 1 }} onClick={() => setSos(true)}>Safety</Button></div>
          {showOtp && <div className="card row flat" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }}>
            <div className="grow"><div className="b">Handover code</div><div className="cap">{parcel ? 'Share this code with the receiver. They tell it to the partner at handover.' : 'Tell the partner this code when your items arrive'}</div></div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, color: 'var(--brand-primary-rest)' }}>{o.otp}</div>
          </div>}
          {parcel && o.receiver && <div className="card row flat"><Icon name="person_pin_circle" size={22} color="var(--brand-fox-red)" /><div className="grow"><div className="b">Receiver · {o.receiver.name}{o.receiver.phone ? ' · ' + o.receiver.phone : ''}</div><div className="cap">Gets an SMS link with live tracking and the handover code</div></div></div>}
          <div className="card flat" style={{ padding: '12px 16px', gap: 10 }}>
            {steps.map((s, i) => <div key={s.key} className="row" style={{ gap: 10 }}><Icon name={i < idx ? 'check_circle' : i === idx ? 'radio_button_checked' : 'radio_button_unchecked'} size={20} color={i < idx ? 'var(--brand-confirm-rest)' : i === idx ? 'var(--brand-primary-rest)' : 'var(--text-disabled)'} /><span className="grow" style={{ fontWeight: i === idx ? 600 : 400, color: i > idx ? 'var(--text-secondary)' : 'var(--text)' }}>{s.label}</span><span className="cap mono">{o.times[s.key] ? new Date(o.times[s.key]).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}</span></div>)}
          </div>
          <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
            <div className="b" style={{ fontSize: 14, marginBottom: 2 }}>{itemsLabel(o)}</div>
            {!parcel && o.items.some((i: any) => i.substitute || i.unavailable) && <div className="cap" style={{ color: 'var(--text-caution)' }}>{o.items.filter((i: any) => i.substitute).map((i: any) => `${i.name} → ${i.substitute}`).concat(o.items.filter((i: any) => i.unavailable && !i.substitute).map((i: any) => `${i.name} unavailable`)).join(' · ')}</div>}
            {rows.map(([k, v]) => <div key={k} className="between"><span>{k}</span><span className="mono">{v}</span></div>)}
            {(o.receiptUrl || o.pickupPhotoUrl) && <a href={o.receiptUrl ?? o.pickupPhotoUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, textDecoration: 'none', fontSize: 13 }}><Icon name="receipt_long" size={18} />{parcel ? 'Open pickup photo' : 'Open receipt photo'}</a>}
            <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>Total</span><span className="mono">{bill.totalLabel}</span></div>
            <div className="cap">{PAY_LABEL[o.pay]}{o.pay === 'wallet' ? ` · balance ${fmt(session?.me.wallet ?? 0)}` : ''}</div>
          </div>
        </div>
      </Body>
      {c.sheet}
      <Sheet open={sos} onClose={() => setSos(false)} title="Safety">
        <div className="cap13">Your trip details are already with GetMe safety. Pick what you need.</div>
        {sosRows.map(r => <button key={r.label} onClick={r.run} className="card row flat" style={{ cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--text)' }}><Icon name={r.icon} size={22} color={r.color} /><div className="grow"><div className="b">{r.label}</div><div className="cap">{r.sub}</div></div></button>)}
      </Sheet>
      {calling && <CallOverlay name={o.courier?.name ?? 'GetMe safety'} onEnd={() => setCalling(false)} />}
    </>
  );
}

function Delivered({ o }: { o: any }) {
  const nav = useNavigate(); const ev = useOrderEvent(); const errToast = useErrorToast(); const { toast } = useStore();
  const [tip, setTip] = useState(20); const [stars, setStars] = useState(5); const [tags, setTags] = useState<string[]>([]); const [issue, setIssue] = useState(''); const [busy, setBusy] = useState(false);
  const total = o.bill.total + tip;
  const submit = async () => { setBusy(true); try { if (tip !== o.tip) await ev(o.id, { type: 'tip', amount: tip }); await ev(o.id, { type: 'rate', stars, tags }); toast('Thanks for rating'); nav('/customer', { replace: true }); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const report = async () => { try { await ev(o.id, { type: 'report_issue', issue }); setIssue(''); } catch (e) { errToast(e); } };
  return (
    <>
      <Header title="Delivered" />
      <Body>
        <div className="col" style={{ alignItems: 'center', gap: 6, padding: '12px 0 4px', textAlign: 'center' }}>
          <Icon name="check_circle" size={48} color="var(--brand-confirm-rest)" />
          <div style={{ font: '600 18px/24px var(--font-sans)' }}>Delivered by {o.courierName} at {o.times.delivered ? new Date(o.times.delivered).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}</div>
          <div className="cap13">{o.pay === 'cod' ? `${o.bill.totalLabel} paid in cash to the partner` : `${o.bill.totalLabel} charged to ${PAY_LABEL[o.pay]}`}</div>
        </div>
        <div className="card flat"><div className="b">Add a tip for {o.courierName}</div><div className="wrap">{TIPS.map(t => <Chip key={t} label={t ? fmt(t) : 'No tip'} selected={tip === t} onClick={() => setTip(t)} />)}</div><div className="cap">100% of the tip goes to the partner.</div></div>
        <div className="card flat"><div className="b">Rate the delivery</div><Stars value={stars} onChange={setStars} /><div className="wrap">{TAGS.map(t => <Chip key={t} label={t} selected={tags.includes(t)} onClick={() => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])} />)}</div></div>
        <div className="card flat"><div className="b">Something wrong?</div><div className="wrap">{ISSUES.map(i => <Chip key={i} label={i} selected={issue === i} onClick={() => setIssue(issue === i ? '' : i)} />)}</div>{issue && <Button variant="outlined" color="warn" fullWidth onClick={report}>Report and request a refund</Button>}{o.refund && <div className="cap" style={{ color: 'var(--text-caution)' }}>Refund of {fmt(o.refund.amount)} {o.refund.status} · reviewed within 24 h</div>}</div>
        <div className="between" style={{ fontWeight: 600, fontSize: 15, padding: '0 4px' }}><span>Total paid</span><span className="mono">{fmt(total)}</span></div>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth onClick={submit} loading={busy}>Submit rating</Button></div>
    </>
  );
}

/** Read-only detail for past orders. */
function Detail({ o }: { o: any }) {
  const nav = useNavigate();
  const parcel = o.kind === 'parcel';
  const chip = o.status === 'delivered' ? { s: 'success' as const, l: 'Delivered' } : o.status === 'expired' ? { s: 'ended' as const, l: 'No partner' } : { s: 'ended' as const, l: 'Cancelled' };
  const rows = [...(parcel ? [] : [['Items', o.bill.itemsLabel]]), ['Delivery fee', fmt(o.fee.delivery)], ['Service fee', fmt(o.fee.service)], ...(o.fee.extra ? [[`Extra · ${o.fee.extraReason}`, '+' + fmt(o.fee.extra)]] : []), ...(o.fee.insure ? [['Package protection', fmt(o.fee.insure)]] : []), ...(o.promo ? [[`Promo ${o.promoCode}`, '−' + fmt(o.promo)]] : []), ...(o.tip ? [['Tip', fmt(o.tip)]] : [])];
  return (
    <>
      <Header onBack={() => nav('/customer/orders')} right={<StatusChip status={chip.s} label={chip.l} />}><div className="grow"><div className="title">Order {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {orderSummary(o)}</div></div></Header>
      <Body>
        <div className="card flat" style={{ gap: 4, fontSize: 13, lineHeight: '18px' }}><div className="b">{orderSummary(o)}</div><div className="sec">{itemsLabel(o)}</div><div className="sec">Deliver to {o.address.line}</div>{o.courierName && <div className="sec">Partner · {o.courierName}</div>}{o.cancelReason && <div className="sec">Reason · {o.cancelReason}</div>}</div>
        {o.status === 'delivered' && <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
          {rows.map(([k, v]) => <div key={k} className="between"><span>{k}</span><span className="mono">{v}</span></div>)}
          {o.receiptUrl && <a href={o.receiptUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, textDecoration: 'none', fontSize: 13 }}><Icon name="receipt_long" size={18} />Open receipt photo</a>}
          <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>Total paid</span><span className="mono">{fmt(o.bill.total + o.tip)}</span></div>
          <div className="cap">{PAY_LABEL[o.pay]}{o.rating ? ` · rated ${o.rating.stars} stars` : ''}{o.refund ? ` · refund ${o.refund.status}` : ''}</div>
        </div>}
        {o.status === 'delivered' && <div className="card flat" style={{ padding: '12px 16px', gap: 10 }}>{(parcel ? P_STEPS : C_STEPS).map(([label, key]) => <div key={key} className="row" style={{ gap: 10 }}><Icon name="check_circle" size={20} color="var(--brand-confirm-rest)" /><span className="grow">{label}</span><span className="cap mono">{o.times[key] ? new Date(o.times[key]).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}</span></div>)}</div>}
        {o.kind !== 'parcel' && <Button variant="outlined" color="primary" fullWidth icon="replay" onClick={() => nav(o.kind === 'shop' ? `/customer/shop/${o.shopId}` : '/customer/list')}>Order again</Button>}
      </Body>
    </>
  );
}
