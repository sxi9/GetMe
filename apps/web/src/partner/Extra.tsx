import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EXTRAS, REASONS } from '@getme/core';
import { AlertBanner, Body, Button, Chip, Header, Input } from '../ui';
import { useErrorToast, useStore } from '../lib/store';
import { usePartner } from './state';

export function Extra() {
  const { id } = useParams(); const nav = useNavigate(); const err = useErrorToast(); const { toast } = useStore();
  const { requests, event } = usePartner();
  const o = id ? requests[id] : undefined;
  const [extra, setExtra] = useState(30); const [reason, setReason] = useState(REASONS[0]); const [busy, setBusy] = useState(false);
  if (!o) return <><Header title="Ask for extra" onBack={() => nav('/partner')} /><Body><AlertBanner type="neutral">This request is no longer open.</AlertBanner></Body></>;
  const first = o.anon ? 'The customer' : o.customerName.split(' ')[0];
  const send = async () => { setBusy(true); try { await event(o.id, { type: 'counter', amount: extra, reason }); toast(`Asked ${first} for ₹${extra} extra`); nav('/partner'); } catch (e) { err(e); } finally { setBusy(false); } };
  return (
    <>
      <Header title="Ask for extra" onBack={() => nav(-1)} />
      <Body>
        <div className="cap13">{first} pays ₹{o.fee.delivery} for delivery. Ask for more if the job needs it. They can approve or decline.</div>
        <div className="col"><div className="b">Extra amount</div><div className="wrap">{EXTRAS.map(a => <Chip key={a} label={`+₹${a}`} selected={extra === a} onClick={() => setExtra(a)} />)}</div></div>
        <div className="col"><div className="b">Reason</div><div className="wrap">{REASONS.map(r => <Chip key={r} label={r} selected={reason === r} onClick={() => setReason(r)} />)}</div></div>
        <AlertBanner type="info">You would earn ₹{o.fee.delivery + extra} instead of ₹{o.fee.delivery}</AlertBanner>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth loading={busy} onClick={send}>Send to customer</Button></div>
    </>
  );
}
export function Offer() {
  const { id } = useParams(); const nav = useNavigate(); const err = useErrorToast(); const { toast } = useStore();
  const { requests, event } = usePartner();
  const o = id ? requests[id] : undefined;
  const [price, setPrice] = useState(o ? String(o.fee.delivery + 10) : '55'); const [eta, setEta] = useState(o?.etaMin ? String(o.etaMin) : '12'); const [busy, setBusy] = useState(false); const [e1, setE1] = useState('');
  if (!o) return <><Header title="Send an offer" onBack={() => nav('/partner')} /><Body><AlertBanner type="neutral">This request is no longer open.</AlertBanner></Body></>;
  const first = o.anon ? 'The customer' : o.customerName.split(' ')[0];
  const send = async () => {
    const p = Number(price), m = Number(eta);
    if (!(p > 0)) { setE1('Enter your delivery fee'); return; }
    setBusy(true); try { await event(o.id, { type: 'offer', price: p, etaMin: m > 0 ? m : 12 }); toast(`Offer sent · ₹${p} · ${m} min`); nav('/partner'); } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Send an offer" onBack={() => nav(-1)} />
      <Body>
        <div className="cap13">{first} compares offers by price, time and rating. Other partners nearby are offering too.</div>
        <Input label="Your delivery fee (₹)" value={price} onChange={e => { setPrice(e.target.value.replace(/\D/g, '')); setE1(''); }} prefixIcon="currency_rupee" type="tel" inputMode="numeric" error={e1} hint={`Suggested ₹${o.fee.delivery} for this distance`} mono />
        <Input label="Time to reach the customer (min)" value={eta} onChange={e => setEta(e.target.value.replace(/\D/g, ''))} prefixIcon="schedule" type="tel" inputMode="numeric" mono />
        <AlertBanner type="info">{first} sees: ₹{Number(price) || 0} delivery · ~{Number(eta) || 0} min</AlertBanner>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth loading={busy} onClick={send}>Send offer</Button></div>
    </>
  );
}
