import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertBanner, Button, Chip, Icon, Money } from '../ui';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { fmtKm, itemsLabel, usePartner, type PView } from './state';

const MODE_LABEL: Record<string, string> = { broadcast: 'First to accept wins', offers: 'Send your price', choose: 'Sent only to you', run: 'Trip order' };

export function RequestCard({ o }: { o: PView }) {
  const { t } = useT(); const nav = useNavigate(); const err = useErrorToast(); const { toast } = useStore();
  const { event, declinedExtra } = usePartner();
  const [busy, setBusy] = useState(false);
  const first = o.customerName.split(' ')[0];
  const title = o.mode === 'choose' ? t('Direct request from {name}', { name: o.anon ? t('a customer') : first }) : o.mode === 'offers' ? t('Offers wanted') : t('New request nearby');
  const pickup = (o.kind === 'parcel' ? `${t('Pickup')} · ${o.pickup?.area ?? o.pickup?.line ?? t('customer')}` : o.shopId ? o.shopName : t('Any nearby shop')) + (o.distKm != null ? ` · ${t('{d} away', { d: fmtKm(o.distKm) })}` : '');
  const drop = (fmtAddress(o.address) || o.address.area || o.address.line) + (o.shopPos || o.pickup ? ` · ${t('{d} leg', { d: fmtKm(o.legKm) })}` : '');
  const handoff = o.address.handoff === 'gate' ? t('leave at gate') : o.address.handoff === 'leave_at_door' ? t('leave at door') : '';
  const pay = o.pay === 'cod' ? t('collect {x} in cash', { x: o.bill.totalLabel }) : t('paid in app');
  const when = (o.when === 'now' ? t('Deliver now') : t('Scheduled · {slot}', { slot: o.slot ?? '' })) + (o.budget ? ` · ${t('budget ₹{n}', { n: o.budget })}` : o.kind === 'list' ? ` · ${t('no budget cap')}` : '');
  const run = async (body: Record<string, unknown>, ok?: string) => { setBusy(true); try { const r = await event(o.id, body); if (r.queued) { toast(t('No network. Saved · will send when you are back online')); return; } if (ok) toast(ok); if (body.type === 'accept' && r.result.courierId) nav('/partner/job'); } catch (e) { err(e); } finally { setBusy(false); } };
  const canRespond = o.mode !== 'offers' && !o.myCounter;
  return (
    <div className="card" style={{ border: '2px solid var(--brand-primary-rest)', boxShadow: 'var(--shadow-menu)', gap: 12 }}>
      <div className="row" style={{ gap: 8 }}><Icon name="notifications_active" size={22} color="var(--brand-primary-rest)" /><div className="grow h16">{title}</div><Chip label={t(MODE_LABEL[o.mode])} /></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="mono" style={{ font: '600 28px/32px var(--font-mono)', color: 'var(--gm-chrome)' }}>₹{o.fee.delivery + o.fee.extra}</span><span className="cap13">{t('delivery fee')} · {pay}</span></div>
      <div className="col" style={{ gap: 6, fontSize: 13, lineHeight: '18px' }}>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} size={18} color="var(--icon)" /><span>{t('Pick up')} · {pickup}</span></div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} size={18} color="var(--icon)" /><span>{t('Drop')} · {drop}{handoff ? ` · ${handoff}` : ''}</span></div>
        {o.address.landmark && !fmtAddress(o.address).includes(o.address.landmark) && <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="signpost" size={18} color="var(--icon)" /><span>{t('Landmark')} · {o.address.landmark}</span></div>}
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="shopping_basket" size={18} color="var(--icon)" /><span>{itemsLabel(o)}</span></div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="schedule" size={18} color="var(--icon)" /><span>{when}{o.etaMin != null ? ` · ${t('{n} min to reach', { n: o.etaMin })}` : ''}</span></div>
        {o.note && <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="sticky_note_2" size={18} color="var(--icon)" /><span>“{o.note}”</span></div>}
      </div>
      {declinedExtra[o.id] && <AlertBanner type="caution">{t('{name} declined the extra fee. Accept at the base fee or decline.', { name: first })}</AlertBanner>}
      {canRespond && (
        <div className="col">
          <Button color="primary" size="tall" fullWidth icon="check" loading={busy} onClick={() => run({ type: 'accept' }, t('You got the job'))}>{t('Accept')}</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outlined" color="primary" icon="currency_rupee" style={{ flex: 1 }} disabled={busy} onClick={() => nav(`/partner/request/${o.id}/extra`)}>{t('Ask for extra')}</Button>
            <Button variant="outlined" style={{ flex: 1 }} disabled={busy} onClick={() => run({ type: 'decline' })}>{t('Decline')}</Button>
          </div>
        </div>
      )}
      {o.myCounter && <div className="col" style={{ gap: 4 }}><div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}><Icon name="progress_activity" size={18} color="var(--brand-primary-rest)" style={{ animation: 'gm-spin 1s linear infinite' }} /><span>{t('Asked')} <Money v={o.myCounter.amount} /> {t('extra · waiting for {name}', { name: first })}</span></div><Button variant="text" color="primary" size="small" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => run({ type: 'accept' }, t('Accepted at the base fee'))}>{t('Accept at the base fee instead')}</Button></div>}
      {o.mode === 'offers' && !o.myOffer && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button color="primary" size="tall" icon="sell" style={{ flex: 1 }} disabled={busy} onClick={() => nav(`/partner/request/${o.id}/offer`)}>{t('Send an offer')}</Button>
          <Button variant="outlined" size="tall" style={{ width: 90 }} disabled={busy} onClick={() => run({ type: 'decline' })}>{t('Skip')}</Button>
        </div>
      )}
      {o.myOffer && <div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}><Icon name="progress_activity" size={18} color="var(--brand-primary-rest)" style={{ animation: 'gm-spin 1s linear infinite' }} />{t('Offer sent')} · <Money v={o.myOffer.price} /> · {o.myOffer.etaMin} min · {t('waiting for {name}', { name: first })}{o.offers.length > 1 ? ` · ${t('{n} other offers', { n: o.offers.length - 1 })}` : ''}</div>}
    </div>
  );
}
