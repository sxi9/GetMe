import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODES, PAYS, fmt } from '@getme/core';
import { api } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { Body, Button, Header, Icon, Input, Toggle } from '../ui';
import { emptyList, emptyPackage, useCustomer } from './state';

function RadioCard({ selected, label, caption, onPick, inline }: { selected: boolean; label: string; caption: string; onPick: () => void; inline?: boolean }) {
  const ring = <span style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0, borderRadius: 999, border: `2px solid ${selected ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: selected ? 'var(--brand-primary-rest)' : 'transparent' }} /></span>;
  const body = <div className="grow"><div style={{ fontSize: 15, lineHeight: '22px', fontWeight: selected ? 600 : 400 }}>{label}</div><div className="cap">{caption}</div></div>;
  if (inline) return <div onClick={onPick} role="radio" aria-checked={selected} style={{ padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--divider)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>{ring}{body}</div>;
  return <div className={'option' + (selected ? ' selected' : '')} onClick={onPick} role="radio" aria-checked={selected}>{ring}{body}</div>;
}

export function Checkout() {
  const nav = useNavigate();
  const { session, toast } = useStore();
  const errToast = useErrorToast();
  const { coKind, list, setList, pkg, setPkg, cart, setCart, patchOrder } = useCustomer();
  const [mode, setMode] = useState<'broadcast' | 'offers' | 'choose'>('broadcast');
  const [pay, setPay] = useState<'cod' | 'upi' | 'card' | 'wallet'>('upi');
  const [anon, setAnon] = useState(false);
  const [promo, setPromo] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const wallet = session?.me.wallet ?? 0;
  const home = session?.me.addresses?.[0];

  const input = useMemo(() => {
    if (coKind === 'parcel') return { kind: 'parcel', address: { line: pkg.drop, label: 'Drop' }, receiver: { name: pkg.name, phone: pkg.phone }, pkType: pkg.type, pkSize: pkg.size, insure: pkg.insure, note: pkg.note + (pkg.photoUrl ? ` Photo: ${pkg.photoUrl}` : '') };
    if (coKind === 'shop') return { kind: 'shop', shopId: cart.shopId, items: Object.entries(cart.qty).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty, name: '' })) };
    return { kind: 'list', shopId: list.source === 'any' ? null : list.source, items: list.items.map(i => ({ name: i.name, qty: i.qty })), when: list.when, slot: list.slot, budget: list.budget ? Number(list.budget) : null, subs: list.subs, repeat: list.repeat, note: list.note + (list.photoUrl ? ` Photo: ${list.photoUrl}` : '') };
  }, [coKind, pkg, cart, list]);

  useEffect(() => {
    let live = true;
    api('/api/orders/quote', { method: 'POST', body: { ...input, mode, pay, promoCode: applied } }).then(q => { if (live) { setQuote(q); setErr(''); } }).catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [input, applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPromo = () => setApplied(promo.trim().toUpperCase() || null);
  const place = async () => {
    setBusy(true);
    try {
      const o = await api('/api/orders', { method: 'POST', body: { ...input, mode, pay, promoCode: applied, anon } });
      patchOrder(o);
      if (coKind === 'list') setList(() => emptyList()); else if (coKind === 'parcel') setPkg(() => emptyPackage()); else setCart(() => ({ shopId: null, qty: {} }));
      nav(`/customer/order/${o.id}`, { replace: true });
    } catch (e) { errToast(e); } finally { setBusy(false); }
  };
  const b = quote?.bill;
  const shopLine = coKind === 'parcel' ? `Package · ${pkg.type} · ${pkg.size}` : quote?.shop ? quote.shop.name : 'Any nearby shop · partner picks the closest';
  const whenLabel = coKind === 'list' && list.when === 'schedule' ? list.slot : 'Deliver now';
  const note = coKind === 'parcel' ? 'Price depends on package size. The receiver gets an SMS link with live tracking.' : quote?.itemsTotal != null ? 'Paid when the order is delivered.' : 'The partner adds the item cost and a receipt after buying. You pay the final total on delivery.';
  const payCaption: Record<string, string> = { cod: 'Pay the partner when items arrive', upi: session?.me.user.email ? `${session.me.user.email.split('@')[0]}@okaxis` : 'Pay with any UPI app', card: 'HDFC •••• 4421', wallet: `Balance ${fmt(wallet)}` };
  const cta = { broadcast: 'Send to partners nearby', offers: 'Ask for offers', choose: 'Choose a partner' }[mode];
  const back = () => nav(coKind === 'parcel' ? '/customer/package' : coKind === 'shop' ? `/customer/shop/${cart.shopId}` : '/customer/list');

  return (
    <>
      <Header title="Checkout" onBack={back} />
      <Body>
        {err && <div className="card flat" style={{ background: 'var(--surface-critical-light)', borderColor: 'var(--severity-high)' }}><div className="b" style={{ color: 'var(--text-critical)' }}>{err}</div><Button variant="text" color="primary" size="small" onClick={back}>Go back</Button></div>}
        <div className="card flat" style={{ padding: '12px 16px', gap: 6 }}>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}><Icon name={coKind === 'parcel' ? 'inventory_2' : 'storefront'} size={20} color="var(--brand-primary-rest)" /><div className="b grow">{shopLine}</div><div className="cap">{whenLabel}</div></div>
          {quote?.items.map((it: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: '20px' }}><span className="grow">{it.name}</span><span className="sec">× {it.qty}{it.unit ? ' · ' + it.unit : ''}</span><span className="mono" style={{ minWidth: 72, textAlign: 'right' }}>{it.price != null && coKind !== 'parcel' ? fmt(it.price * it.qty) : coKind === 'parcel' ? '' : 'partner buys'}</span></div>)}
          {home && coKind !== 'parcel' && <div className="cap" style={{ marginTop: 4 }}>Deliver to {home.label} · {home.line}</div>}
          {coKind === 'parcel' && <div className="cap" style={{ marginTop: 4 }}>From {home?.line} to {pkg.drop} · {pkg.name}{pkg.phone ? ' · ' + pkg.phone : ''}</div>}
        </div>
        <div className="col"><div className="h16">How should we find a partner?</div>{MODES.map(m => <RadioCard key={m.id} selected={mode === m.id} label={m.label} caption={m.caption} onPick={() => setMode(m.id)} />)}</div>
        <div className="col"><div className="h16">Payment</div><div className="card flat" style={{ padding: '4px 14px', gap: 0 }}>{PAYS.map(p => <RadioCard key={p.id} inline selected={pay === p.id} label={p.label} caption={payCaption[p.id]} onPick={() => setPay(p.id)} />)}</div>
          {pay === 'wallet' && b && wallet < b.fees && <div className="cap" style={{ color: 'var(--text-caution)' }}>Wallet balance does not cover the fees. Add money in Profile or pick another method.</div>}</div>
        <div className="card row">
          <Icon name="visibility_off" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">Anonymous delivery</div><div className="cap">The partner sees you as "Customer". Your number stays masked; chat and calls go through GetMe.</div></div>
          <Toggle checked={anon} onChange={setAnon} />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Input placeholder="Promo code" prefixIcon="sell" value={promo} onChange={e => setPromo(e.target.value.toUpperCase())} onEnter={applyPromo} hint={applied ? (quote?.promoMsg || '') : ''} error={applied && quote && !quote.promo ? quote.promoMsg : undefined} style={{ flex: 1 }} />
          <Button variant="outlined" onClick={applyPromo}>Apply</Button>
        </div>
        {b && <div className="card flat" style={{ padding: '12px 16px', gap: 6, fontSize: 13, lineHeight: '20px' }}>
          {coKind !== 'parcel' && <div className="between"><span>Items</span><span className="mono">{b.itemsLabel}</span></div>}
          <div className="between"><span>Delivery fee</span><span className="mono">{fmt(b.delivery)}</span></div>
          <div className="between"><span>Service fee</span><span className="mono">{fmt(b.service)}</span></div>
          {b.insure > 0 && <div className="between"><span>Package protection</span><span className="mono">{fmt(b.insure)}</span></div>}
          {b.promo > 0 && <div className="between" style={{ color: 'var(--text-success)' }}><span>Promo {applied}</span><span className="mono">−{fmt(b.promo)}</span></div>}
          <div className="between" style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, marginTop: 2, fontWeight: 600, fontSize: 15 }}><span>Total</span><span className="mono">{b.totalLabel}</span></div>
          <div className="cap">{note}</div>
        </div>}
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth iconRight="arrow_forward" onClick={place} loading={busy} disabled={!quote || !!err}>{cta}</Button></div>
    </>
  );
}
