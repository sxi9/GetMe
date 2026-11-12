import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fmt, fmtKm } from '@getme/core';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Body, Button, Chip, Header, Icon, StatusChip } from '../ui';
import { useCustomer } from './state';

export function Catalogue() {
  const nav = useNavigate(); const { id } = useParams(); const { t } = useT();
  const { cart, setCart, setCoKind } = useCustomer();
  const [shop, setShop] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/shops/${id}`).then(setShop).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => { if (id && cart.shopId !== id) setCart(() => ({ shopId: id, qty: {} })); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = (itemId: string) => cart.qty[itemId] ?? 0;
  const set = (itemId: string, delta: number, max: number) => setCart(c => ({ shopId: id!, qty: { ...c.qty, [itemId]: Math.max(0, Math.min(max, (c.qty[itemId] ?? 0) + delta)) } }));
  const count = Object.values(cart.qty).reduce((a, b) => a + b, 0);
  const total = shop ? shop.items.reduce((a: number, it: any) => a + it.price * q(it.id), 0) : 0;
  const btn = (icon: string, fn: () => void) => <button onClick={fn} aria-label={icon} style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Icon name={icon} size={18} /></button>;
  return (
    <>
      <Header onBack={() => nav('/customer')} right={shop && <StatusChip status={shop.open ? 'success' : 'ended'} label={shop.open ? t('Open') : t('Closed')} />}>
        <div className="grow"><div className="title ellip">{shop?.name ?? t('Shop')}</div>{shop && <div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{shop.cat} · {fmtKm(shop.distKm)} · {shop.etaLabel}</div>}</div>
      </Header>
      <Body tight>
        {err && <div className="card">{err}</div>}
        {shop?.photoUrl && <img className="photo" src={shop.photoUrl} alt="" style={{ borderRadius: 8 }} />}
        {shop && !shop.open && <div className="card flat" style={{ background: 'var(--surface-caution-light)', borderColor: 'var(--severity-low)' }}><div className="b">{t('Closed right now')}</div><div className="cap13">{t('Opens {hours}. You can still browse, or add these items to a list for another shop.', { hours: shop.hours })}</div></div>}
        {shop?.items.map((it: any) => { const avail = it.on && it.stock > 0; const n = q(it.id); return (
          <div key={it.id} className="card row flat" style={{ padding: '10px 10px 10px 14px', gap: 10 }}>
            {it.photoUrl && <img className="thumb" src={it.photoUrl} alt="" />}
            <div className="grow"><div className="b">{it.name}</div><div className="cap">{it.unit} · {fmt(it.price)}</div>{avail && it.stock <= 3 && <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--text-caution)', fontWeight: 600 }}>{t('Only a few left')}</div>}</div>
            {avail ? (n > 0 ? <div className="row" style={{ gap: 2, border: '1px solid var(--brand-primary-rest)', borderRadius: 4, color: 'var(--brand-primary-rest)' }}>{btn('remove', () => set(it.id, -1, it.stock))}<span className="mono" style={{ minWidth: 20, textAlign: 'center', fontWeight: 600, fontSize: 13 }}>{n}</span>{btn('add', () => set(it.id, 1, it.stock))}</div>
              : <Button variant="outlined" color="primary" size="small" icon="add" onClick={() => set(it.id, 1, it.stock)} disabled={!shop.open}>{t('Add')}</Button>)
              : <Chip label={t('Out of stock')} disabled />}
          </div>); })}
        {shop && !shop.items.length && <div className="cap13" style={{ textAlign: 'center', padding: 24 }}>{t('No items listed yet.')}</div>}
      </Body>
      {count > 0 && shop?.open && <div className="sticky-cta" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <div className="grow"><div className="b">{t('{n} items', { n: count })} · {fmt(total)}</div><div className="cap">{t('Plus delivery and service fee')}</div></div>
        <Button color="primary" size="tall" iconRight="arrow_forward" onClick={() => { setCoKind('shop'); nav('/customer/checkout'); }}>{t('Checkout')}</Button>
      </div>}
    </>
  );
}
