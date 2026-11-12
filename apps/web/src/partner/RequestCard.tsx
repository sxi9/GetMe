import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertBanner, Button, Chip, Icon, Money } from '../ui';
import { useErrorToast, useStore } from '../lib/store';
import { fmtKm, itemsLabel, usePartner, type PView } from './state';

const MODE_LABEL: Record<string, string> = { broadcast: 'First to accept wins', offers: 'Send your price', choose: 'Sent only to you' };

export function RequestCard({ o }: { o: PView }) {
  const nav = useNavigate(); const err = useErrorToast(); const { toast } = useStore();
  const { event, declinedExtra } = usePartner();
  const [busy, setBusy] = useState(false);
  const first = o.customerName.split(' ')[0];
  const title = o.mode === 'choose' ? `Direct request from ${o.anon ? 'a customer' : first}` : o.mode === 'offers' ? 'Offers wanted' : 'New request nearby';
  const pickup = (o.kind === 'parcel' ? `Pickup · ${o.pickup?.area ?? o.pickup?.line ?? 'customer'}` : o.shopId ? o.shopName : 'Any nearby shop') + (o.distKm != null ? ` · ${fmtKm(o.distKm)} away` : '');
  const drop = (o.address.area ?? o.address.line) + (o.shopPos || o.pickup ? ` · ${fmtKm(o.legKm)} leg` : '');
  const pay = o.pay === 'cod' ? `collect ${o.bill.totalLabel} in cash` : 'paid in app';
  const when = (o.when === 'now' ? 'Deliver now' : `Scheduled · ${o.slot ?? ''}`) + (o.budget ? ` · budget ₹${o.budget}` : o.kind === 'list' ? ' · no budget cap' : '');
  const run = async (body: Record<string, unknown>, ok?: string) => { setBusy(true); try { const r = await event(o.id, body); if (ok) toast(ok); if (body.type === 'accept' && r.courierId) nav('/partner/job'); } catch (e) { err(e); } finally { setBusy(false); } };
  const canRespond = o.mode !== 'offers' && !o.myCounter;
  return (
    <div className="card" style={{ border: '2px solid var(--brand-primary-rest)', boxShadow: 'var(--shadow-menu)', gap: 12 }}>
      <div className="row" style={{ gap: 8 }}><Icon name="notifications_active" size={22} color="var(--brand-primary-rest)" /><div className="grow h16">{title}</div><Chip label={MODE_LABEL[o.mode]} /></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="mono" style={{ font: '600 28px/32px var(--font-mono)', color: 'var(--gm-chrome)' }}>₹{o.fee.delivery + o.fee.extra}</span><span className="cap13">delivery fee · {pay}</span></div>
      <div className="col" style={{ gap: 6, fontSize: 13, lineHeight: '18px' }}>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} size={18} color="var(--icon)" /><span>Pick up · {pickup}</span></div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} size={18} color="var(--icon)" /><span>Drop · {drop}</span></div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="shopping_basket" size={18} color="var(--icon)" /><span>{itemsLabel(o)}</span></div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="schedule" size={18} color="var(--icon)" /><span>{when}{o.etaMin != null ? ` · ${o.etaMin} min to reach` : ''}</span></div>
        {o.note && <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="sticky_note_2" size={18} color="var(--icon)" /><span>“{o.note}”</span></div>}
      </div>
      {declinedExtra[o.id] && <AlertBanner type="caution">{first} declined the extra fee. Accept at the base fee or decline.</AlertBanner>}
      {canRespond && (
        <div className="col">
          <Button color="primary" size="tall" fullWidth icon="check" loading={busy} onClick={() => run({ type: 'accept' }, 'You got the job')}>Accept</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outlined" color="primary" icon="currency_rupee" style={{ flex: 1 }} disabled={busy} onClick={() => nav(`/partner/request/${o.id}/extra`)}>Ask for extra</Button>
            <Button variant="outlined" style={{ flex: 1 }} disabled={busy} onClick={() => run({ type: 'decline' })}>Decline</Button>
          </div>
        </div>
      )}
      {o.myCounter && <div className="col" style={{ gap: 4 }}><div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}><Icon name="progress_activity" size={18} color="var(--brand-primary-rest)" style={{ animation: 'gm-spin 1s linear infinite' }} /><span>Asked <Money v={o.myCounter.amount} /> extra · waiting for {first}</span></div><Button variant="text" color="primary" size="small" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => run({ type: 'accept' }, 'Accepted at the base fee')}>Accept at the base fee instead</Button></div>}
      {o.mode === 'offers' && !o.myOffer && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button color="primary" size="tall" icon="sell" style={{ flex: 1 }} disabled={busy} onClick={() => nav(`/partner/request/${o.id}/offer`)}>Send an offer</Button>
          <Button variant="outlined" size="tall" style={{ width: 90 }} disabled={busy} onClick={() => run({ type: 'decline' })}>Skip</Button>
        </div>
      )}
      {o.myOffer && <div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}><Icon name="progress_activity" size={18} color="var(--brand-primary-rest)" style={{ animation: 'gm-spin 1s linear infinite' }} />Offer sent · <Money v={o.myOffer.price} /> · {o.myOffer.etaMin} min · waiting for {first}{o.offers.length > 1 ? ` · ${o.offers.length - 1} other offer${o.offers.length > 2 ? 's' : ''}` : ''}</div>}
    </div>
  );
}
