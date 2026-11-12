import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { AlertBanner, Body, Button, Empty, Money, Sheet, StatusChip, type Status } from '../ui';
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
  const err = useErrorToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<ShopOrderView | null>(null);
  const low = lowStock(shop);

  const advance = async (o: ShopOrderView) => {
    setBusy(o.id);
    try { const r = await post(`/api/shop/orders/${o.id}/advance`); toast({ preparing: `Accepted ${o.id} · preparing`, ready: `${o.id} is ready for pickup`, handed: `${o.id} handed to ${o.courierName ?? 'the partner'}` }[r.shopStatus as string] ?? 'Updated'); }
    catch (e) { err(e); } finally { setBusy(null); }
  };
  const doReject = async () => {
    if (!reject) return; const o = reject; setReject(null); setBusy(o.id);
    try { await post(`/api/shop/orders/${o.id}/reject`); toast(`${o.id} cancelled · the customer has been told`); } catch (e) { err(e); } finally { setBusy(null); }
  };

  const active = orders.filter(isActive);
  const earlier = orders.filter(o => !isActive(o));
  const today = earlier.filter(o => isToday(o.createdAt)), past = earlier.filter(o => !isToday(o.createdAt));

  const card = (o: ShopOrderView) => {
    const st = effectiveStatus(o); const chip = CHIP[st] ?? CHIP.new; const action = ACTION[st];
    const subs = o.items.filter(i => i.substitute); const missing = o.items.filter(i => i.unavailable && !i.substitute);
    return (
      <div key={o.id} className="card" style={{ padding: '12px 16px', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}><div className="grow b ellip">{o.id} · {o.customerName}</div><span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeStr(o.createdAt)}</span></div>
        <div className="row" style={{ gap: 8 }}><StatusChip status={chip.status} label={chip.label} /><span className="cap ellip">{o.courierName ? `Partner · ${o.courierName}` : st === 'cancelled' ? '' : 'Waiting for a partner'}</span></div>
        <div style={{ fontSize: 13, lineHeight: '18px' }}>{o.items.map(i => `${i.name} × ${i.qty}`).join(' · ')}</div>
        {o.note && <div className="cap13"><span className="vulpes-icon" style={{ fontSize: 14, verticalAlign: -2 }}>sticky_note_2</span> {o.note}</div>}
        {(subs.length > 0 || missing.length > 0) && <div className="cap13">{subs.map(i => `${i.name} → ${i.substitute}`).join(', ')}{subs.length && missing.length ? ' · ' : ''}{missing.length ? `Unavailable: ${missing.map(i => i.name).join(', ')}` : ''}</div>}
        {!subs.length && !missing.length && st !== 'done' && st !== 'cancelled' && <div className="cap">{o.subs ? 'Substitutes allowed' : 'No substitutes'}</div>}
        <div className="row" style={{ gap: 8 }}>
          <div className="grow"><Money v={o.itemsTotal ?? 0} /></div>
          {(st === 'new' || st === 'preparing') && <Button variant="text" color="warn" size="small" onClick={() => setReject(o)} disabled={busy === o.id}>Can't fulfil</Button>}
          {action && <Button color="primary" size="small" onClick={() => advance(o)} loading={busy === o.id}>{action}</Button>}
        </div>
      </div>
    );
  };
  const group = (title: string, list: ShopOrderView[]) => list.length ? <><div className="overline" style={{ marginTop: 4 }}>{title}</div>{list.map(card)}</> : null;

  return (
    <>
      <Body style={{ gap: 12, paddingBottom: 48 }}>
        {low.length > 0 && <AlertBanner type="caution" onClick={() => nav('/shop/items')} action={<Button variant="text" size="small" onClick={() => nav('/shop/items')}>Restock</Button>}>{low.length === 1 ? `${low[0].name} is ${low[0].stock === 0 ? 'out of stock' : 'low on stock'}` : `${low.length} items low or out of stock`}</AlertBanner>}
        {!loading && orders.length === 0 && <Empty icon="receipt_long" title="No orders yet" text={shop?.open ? 'New catalogue orders from customers nearby show up here.' : 'You are closed. Turn the shop open to receive orders.'} />}
        {active.length ? group('Active', active) : null}
        {!active.length && orders.length > 0 && <Empty icon="task_alt" title="All caught up" text="No orders need action right now." />}
        {group('Earlier today', today)}
        {group('Past', past)}
      </Body>
      <Sheet open={!!reject} onClose={() => setReject(null)} title="Can't fulfil this order?">
        <div style={{ fontSize: 14, lineHeight: '20px' }}>{reject?.id} will be cancelled and {reject?.customerName} will be told the shop could not fulfil it. Reserved stock goes back to your items.</div>
        <Button color="warn" size="tall" fullWidth onClick={doReject}>Cancel the order</Button>
        <Button variant="text" fullWidth onClick={() => setReject(null)}>Keep it</Button>
      </Sheet>
    </>
  );
}
