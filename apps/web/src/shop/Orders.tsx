import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { postOrQueue } from '../lib/offline';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { AlertBanner, Body, Button, Empty, Icon, Money, Sheet, StatusChip, type Status } from '../ui';
import { lowStock, timeStr, useShop, type ShopOrderView } from './state';

const CHIP: Record<string, { status: Status; label: string }> = {
  new: { status: 'info', label: 'New' }, preparing: { status: 'progress', label: 'Preparing' }, ready: { status: 'success', label: 'Ready for pickup' },
  handed: { status: 'progress', label: 'With partner' }, done: { status: 'success', label: 'Completed' }, cancelled: { status: 'ended', label: 'Cancelled' },
};
const ACTION: Record<string, string> = { new: 'Accept order', preparing: 'Mark ready', ready: 'Handed to partner' };

function effectiveStatus(o: ShopOrderView): string {
  if (o.status === 'cancelled' || o.status === 'expired') return 'cancelled';
  if (o.status === 'delivered') return 'done';
  return o.shopStatus ?? 'new';
}
const isActive = (o: ShopOrderView) => !['done', 'cancelled'].includes(effectiveStatus(o));
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function OrdersScreen() {
  const { shop, orders, loading } = useShop();
  const { toast } = useStore();
  const { t } = useT();
  const err = useErrorToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<ShopOrderView | null>(null);
  const low = lowStock(shop);

  const advance = async (o: ShopOrderView) => {
    setBusy(o.id);
    try {
      const r = await postOrQueue<{ shopStatus: string }>(`/api/shop/orders/${o.id}/advance`, {}, `advance ${o.id}`);
      if (r.queued) toast(t('Saved · will send when online'));
      else toast({ preparing: t('Accepted {id} · preparing', { id: o.id }), ready: t('{id} is ready for pickup', { id: o.id }), handed: t('{id} handed to {name}', { id: o.id, name: o.courierName ?? t('the partner') }) }[r.result.shopStatus] ?? t('Updated'));
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const doReject = async () => {
    if (!reject) return; const o = reject; setReject(null); setBusy(o.id);
    try { await post(`/api/shop/orders/${o.id}/reject`); toast(t('{id} cancelled · the customer has been told', { id: o.id })); } catch (e) { err(e); } finally { setBusy(null); }
  };

  const active = orders.filter(isActive);
  const earlier = orders.filter(o => !isActive(o));
  const today = earlier.filter(o => isToday(o.createdAt)), past = earlier.filter(o => !isToday(o.createdAt));

  const card = (o: ShopOrderView) => {
    const st = effectiveStatus(o); const chip = CHIP[st] ?? CHIP.new; const action = ACTION[st];
    const subs = o.items.filter(i => i.substitute); const missing = o.items.filter(i => i.unavailable && !i.substitute);
    const onRun = o.status === 'scheduled';
    const partnerLine = onRun ? t("Riding on {name}'s trip", { name: (o.courierName ?? t('a partner')).split(' ')[0] }) + (o.run ? ` · ${o.run.label}` : '') : o.courierName ? t('Partner · {name}', { name: o.courierName }) : st === 'cancelled' ? '' : t('Waiting for a partner');
    return (
      <div key={o.id} className="card" style={{ padding: '12px 16px', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}><div className="grow b ellip">{o.id} · {o.customerName}</div><span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeStr(o.createdAt)}</span></div>
        <div className="row" style={{ gap: 8 }}><StatusChip status={chip.status} label={t(chip.label)} /><span className="cap ellip">{onRun && <Icon name="route" size={14} style={{ verticalAlign: -2 }} />} {partnerLine}</span></div>
        <div style={{ fontSize: 13, lineHeight: '18px' }}>{o.items.map(i => `${i.name} × ${i.qty}`).join(' · ')}</div>
        {o.note && <div className="cap13"><span className="gm-icon" style={{ fontSize: 14, verticalAlign: -2 }}>sticky_note_2</span> {o.note}</div>}
        {(subs.length > 0 || missing.length > 0) && <div className="cap13">{subs.map(i => `${i.name} → ${i.substitute}`).join(', ')}{subs.length && missing.length ? ' · ' : ''}{missing.length ? `${t('Unavailable')}: ${missing.map(i => i.name).join(', ')}` : ''}</div>}
        {!subs.length && !missing.length && st !== 'done' && st !== 'cancelled' && <div className="cap">{o.subs ? t('Substitutes allowed') : t('No substitutes')}</div>}
        <div className="row" style={{ gap: 8 }}>
          <div className="grow"><Money v={o.itemsTotal ?? 0} /></div>
          {(st === 'new' || st === 'preparing') && <Button variant="text" color="warn" size="small" onClick={() => setReject(o)} disabled={busy === o.id}>{t("Can't fulfil")}</Button>}
          {action && <Button color="primary" size="small" onClick={() => advance(o)} loading={busy === o.id}>{t(action)}</Button>}
        </div>
      </div>
    );
  };
  const group = (title: string, list: ShopOrderView[]) => list.length ? <><div className="overline" style={{ marginTop: 4 }}>{title}</div>{list.map(card)}</> : null;

  return (
    <>
      <Body style={{ gap: 12, paddingBottom: 48 }}>
        {shop && !shop.approved && <AlertBanner type="caution" icon="pending_actions">{t('Your shop is under review. Customers will see it once approved.')}</AlertBanner>}
        {low.length > 0 && <AlertBanner type="caution" onClick={() => nav('/shop/items')} action={<Button variant="text" size="small" onClick={() => nav('/shop/items')}>{t('Restock')}</Button>}>{low.length === 1 ? t('{name} is {state}', { name: low[0].name, state: low[0].stock === 0 ? t('out of stock') : t('low on stock') }) : t('{n} items low or out of stock', { n: low.length })}</AlertBanner>}
        {!loading && orders.length === 0 && <Empty icon="receipt_long" title={t('No orders yet')} text={shop?.open ? t('New catalogue orders from customers nearby show up here.') : t('You are closed. Turn the shop open to receive orders.')} />}
        {active.length ? group(t('Active'), active) : null}
        {!active.length && orders.length > 0 && <Empty icon="task_alt" title={t('All caught up')} text={t('No orders need action right now.')} />}
        {group(t('Earlier today'), today)}
        {group(t('Past'), past)}
      </Body>
      <Sheet open={!!reject} onClose={() => setReject(null)} title={t("Can't fulfil this order?")}>
        <div style={{ fontSize: 14, lineHeight: '20px' }}>{t('{id} will be cancelled and {name} will be told the shop could not fulfil it. Reserved stock goes back to your items.', { id: reject?.id ?? '', name: reject?.customerName ?? '' })}</div>
        <Button color="warn" size="tall" fullWidth onClick={doReject}>{t('Cancel the order')}</Button>
        <Button variant="text" fullWidth onClick={() => setReject(null)}>{t('Keep it')}</Button>
      </Sheet>
    </>
  );
}
