import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODES, PAYS, fmt, type DispatchMode, type PayMethod } from '@getme/core';
import { api } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { Avatar, Body, Button, Header, Icon, Input, Toggle } from '../ui';
import { addressInput, dayAt, emptyList, emptyPackage, timeAt, useCustomer } from './state';
import { DeliverToSheet } from './DeliverTo';

export function RadioCard({ selected, label, caption, onPick, inline, left }: { selected: boolean; label: React.ReactNode; caption: React.ReactNode; onPick: () => void; inline?: boolean; left?: React.ReactNode }) {
  const ring = <span style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0, borderRadius: 999, border: `2px solid ${selected ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: selected ? 'var(--brand-primary-rest)' : 'transparent' }} /></span>;
  const body = <div className="grow"><div style={{ fontSize: 15, lineHeight: '22px', fontWeight: selected ? 600 : 400 }}>{label}</div><div className="cap">{caption}</div></div>;
  if (inline) return <div onClick={onPick} role="radio" aria-checked={selected} style={{ padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>{ring}{left}{body}</div>;
  return <div className={'option' + (selected ? ' selected' : '')} onClick={onPick} role="radio" aria-checked={selected}>{ring}{left}{body}</div>;
}

export function Checkout() {
  const nav = useNavigate(); const { t } = useT();
  const { session, toast } = useStore();
  const errToast = useErrorToast();
  const { coKind, list, setList, pkg, setPkg, cart, setCart, patchOrder, address, runs, refreshRuns, pendingRun, setPendingRun } = useCustomer();
  const [mode, setMode] = useState<DispatchMode>(pendingRun ? 'run' : 'broadcast');
  const [runId, setRunId] = useState<string | null>(pendingRun);
  const [pay, setPay] = useState<PayMethod>('upi');
  const [anon, setAnon] = useState(false);
  const [promo, setPromo] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deliver, setDeliver] = useState(false);
  const defaulted = useRef(!!pendingRun);
  const wallet = session?.me.wallet ?? 0;
  useEffect(() => { refreshRuns().catch(() => {}); }, [refreshRuns]);
  useEffect(() => { if (mode === 'run' && !runId && runs[0]) setRunId(runs[0].id); }, [mode, runId, runs]);

  const input = useMemo(() => {
    if (coKind === 'parcel') return { kind: 'parcel', address: pkg.drop ?? { line: '', label: 'Drop' }, pickupAddressId: address?.id, receiver: { name: pkg.name, phone: pkg.phone }, pkType: pkg.type, pkSize: pkg.size, insure: pkg.insure, note: pkg.note + (pkg.photoUrl ? ` Photo: ${pkg.photoUrl}` : '') };
    const addr = addressInput(address);
    if (coKind === 'shop') return { kind: 'shop', ...addr, shopId: cart.shopId, items: Object.entries(cart.qty).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, name: '' })) };
    return { kind: 'list', ...addr, shopId: list.source === 'any' ? null : list.source, items: list.items.map(i => ({ name: i.name, qty: i.qty })), when: list.when, slot: list.slot, budget: list.budget ? Number(list.budget) : null, subs: list.subs, repeat: list.repeat, note: list.note + (list.photoUrl ? ` Photo: ${list.photoUrl}` : '') };
  }, [coKind, pkg, cart, list, address]);

  useEffect(() => {
    let live = true;
    api('/api/orders/quote', { method: 'POST', body: { ...input, mode, runId: mode === 'run' ? runId : null, pay, promoCode: applied } }).then(q => {
      if (!live) return; setQuote(q); setErr('');
      if (!defaulted.current && q.region) { defaulted.current = true; setPay(q.region.defaultPay); if (q.region.defaultMode === 'run' && runs.length) setMode('run'); else if (q.region.defaultMode !== 'run') setMode(q.region.defaultMode); }
    }).catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [input, applied, mode, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPromo = () => setApplied(promo.trim().toUpperCase() || null);
  const place = async () => {
    if (mode === 'run' && !runId) { toast(t('Pick a trip, or choose another way to find a partner')); return; }
    setBusy(true);
    try {
      const o = await api('/api/orders', { method: 'POST', body: { ...input, mode, runId: mode === 'run' ? runId : null, pay, promoCode: applied, anon } });
      patchOrder(o); setPendingRun(null);
      if (coKind === 'list') setList(() => emptyList()); else if (coKind === 'parcel') setPkg(() => emptyPackage()); else setCart(() => ({ shopId: null, qty: {} }));
      nav(`/customer/order/${o.id}`, { replace: true });
    } catch (e) { errToast(e); } finally { setBusy(false); }
  };
  const b = quote?.bill;
  const shopLine = coKind === 'parcel' ? `${t('Package')} · ${pkg.type} · ${pkg.size}` : quote?.shop ? quote.shop.name : t('Any nearby shop · partner picks the closest');
  const whenLabel = coKind === 'list' && list.when === 'schedule' ? list.slot : t('Deliver now');
  const note = coKind === 'parcel' ? t('Price depends on package size. The receiver gets an SMS link with live tracking.') : quote?.itemsTotal != null ? t('Paid when the order is delivered.') : t('The partner adds the item cost and a receipt after buying. You pay the final total on delivery.');
  const payCaption: Record<string, string> = { cod: t('Pay the partner when items arrive'), upi: session?.me.user.email ? `${session.me.user.email.split('@')[0]}@okaxis` : t('Pay with any UPI app'), card: 'HDFC •••• 4421', wallet: `${t('Balance')} ${fmt(wallet)}` };
  const cta: Record<DispatchMode, string> = { broadcast: t('Send to partners nearby'), offers: t('Ask for offers'), choose: t('Choose a partner'), run: t('Join the trip') };
  const back = () => nav(coKind === 'parcel' ? '/customer/package' : coKind === 'shop' ? `/customer/shop/${cart.shopId}` : '/customer/list');
  const modes = MODES.filter(m => m.id !== 'run' || coKind !== 'parcel');
  const handoffNote = address?.handoff === 'gate' ? t('Left at the gate with a photo') : address?.handoff === 'leave_at_door' ? t('Left at your door with a photo') : null;

  return (
    <>
      <Header title={t('Checkout')} onBack={back} />
      <Body>
        {err && <div className="card flat" style={{ background: 'var(--surface-critical-light)', borderColor: 'var(--severity-high)' }}><div className="b" style={{ color: 'var(--text-critical)' }}>{err}</div><Button variant="text" color="primary" size="small" onClick={back}>{t('Go back')}</Button></div>}
        <div className="card flat" style={{ padding: '12px 16px', gap: 6 }}>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}><Icon name={coKind === 'parcel' ? 'inventory_2' : 'storefront'} size={20} color="var(--brand-primary-rest)" /><div className="b grow">{shopLine}</div><div className="cap">{whenLabel}</div></div>
          {quote?.items.map((it: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: '20px' }}><span className="grow">{it.name}</span><span className="sec">× {it.qty}{it.unit ? ' · ' + it.unit : ''}</span><span className="mono" style={{ minWidth: 72, textAlign: 'right' }}>{it.price != null && coKind !== 'parcel' ? fmt(it.price * it.qty) : coKind === 'parcel' ? '' : t('partner buys')}</span></div>)}
          {coKind !== 'parcel' && <div className="row" style={{ gap: 6, marginTop: 4 }}><Icon name={address?.source === 'gps' ? 'my_location' : 'location_on'} size={16} color="var(--icon)" /><span className="cap grow">{address ? `${t('Deliver to')} ${t(address.label)} · ${fmtAddress(address)}` : t('No delivery address yet')}{handoffNote ? ` · ${handoffNote}` : ''}</span><Button variant="text" color="primary" size="small" onClick={() => setDeliver(true)}>{t('Change')}</Button></div>}
          {coKind === 'parcel' && <div className="cap" style={{ marginTop: 4 }}>{t('From')} {fmtAddress(address)} {t('to')} {fmtAddress(pkg.drop)} · {pkg.name}{pkg.phone ? ' · ' + pkg.phone : ''}</div>}
          {quote?.region && <div className="cap"><Icon name="landscape" size={14} /> {t('Delivery priced for {region}', { region: quote.region.name })}</div>}
        </div>
        <div className="col"><div className="h16">{t('How should we find a partner?')}</div>
          {modes.map(m => <RadioCard key={m.id} selected={mode === m.id} label={t(m.label)} caption={m.id === 'run' && !runs.length ? t('No trips announced near you right now') : t(m.caption)} onPick={() => setMode(m.id)} />)}
          {mode === 'run' && <div className="card flat" style={{ padding: '4px 14px', gap: 0 }}>
            {!runs.length && <div className="cap13" style={{ padding: '12px 0' }}>{t('Nobody has announced a trip near you yet. Ask on your notice board, or pick another option above.')}</div>}
            {runs.map(r => <RadioCard key={r.id} inline selected={runId === r.id} onPick={() => setRunId(r.id)} left={<Avatar initials={r.partner?.initials ?? 'P'} src={r.partner?.photoUrl} size="md" />}
              label={<span>{r.partnerName.split(' ')[0]} → {r.destination} <span className="mono b">₹{r.feePerOrder}</span></span>}
              caption={<span>{dayAt(r.departAt)} {timeAt(r.departAt)} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {r.partner?.rating ?? '–'} · {t('{n} seats left', { n: r.seats })}{r.communityId ? ` · ${t('community trip')}` : ''}</span>} />)}
          </div>}
        </div>
        <div className="col"><div className="h16">{t('Payment')}</div><div className="card flat" style={{ padding: '4px 14px', gap: 0 }}>{PAYS.map(p => <RadioCard key={p.id} inline selected={pay === p.id} label={t(p.label)} caption={payCaption[p.id]} onPick={() => setPay(p.id)} />)}</div>
          {pay === 'wallet' && b && wallet < b.fees && <div className="cap" style={{ color: 'var(--text-caution)' }}>{t('Wallet balance does not cover the fees. Add money in Profile or pick another method.')}</div>}</div>
        <div className="card row">
          <Icon name="visibility_off" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">{t('Anonymous delivery')}</div><div className="cap">{t('The partner sees you as "Customer". Your number stays masked; chat and calls go through GetMe.')}</div></div>
          <Toggle checked={anon} onChange={setAnon} />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Input placeholder={t('Promo code')} prefixIcon="sell" value={promo} onChange={e => setPromo(e.target.value.toUpperCase())} onEnter={applyPromo} hint={applied ? (quote?.promoMsg || '') : ''} error={applied && quote && !quote.promo ? quote.promoMsg : undefined} style={{ flex: 1 }} />
          <Button variant="outlined" onClick={applyPromo}>{t('Apply')}</Button>
        </div>
        {b && <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
          {coKind !== 'parcel' && <div className="between"><span>{t('Items')}</span><span className="mono">{b.itemsLabel === 'Added after purchase' ? t('Added after purchase') : b.itemsLabel}</span></div>}
          <div className="between"><span>{mode === 'run' ? t('Trip fee') : t('Delivery fee')}</span><span className="mono">{fmt(b.delivery)}</span></div>
          <div className="between"><span>{t('Service fee')}</span><span className="mono">{fmt(b.service)}</span></div>
          {b.insure > 0 && <div className="between"><span>{t('Package protection')}</span><span className="mono">{fmt(b.insure)}</span></div>}
          {b.promo > 0 && <div className="between" style={{ color: 'var(--text-success)' }}><span>{t('Promo')} {applied}</span><span className="mono">−{fmt(b.promo)}</span></div>}
          <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>{t('Total')}</span><span className="mono">{b.totalLabel}</span></div>
          <div className="cap">{note}</div>
        </div>}
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth iconRight="arrow_forward" onClick={place} loading={busy} disabled={!quote || !!err || (coKind !== 'parcel' && !address)}>{cta[mode]}</Button></div>
      <DeliverToSheet open={deliver} onClose={() => setDeliver(false)} />
    </>
  );
}
