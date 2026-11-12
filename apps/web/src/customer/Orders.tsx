import { useNavigate } from 'react-router-dom';
import { dateStr, fmt } from '@getme/core';
import { api } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { Body, Button, Empty, Header, Icon, StatusChip } from '../ui';
import { CustomerTabs } from './Tabs';
import { statusLabel } from './Home';
import { orderSummary, useCustomer } from './state';

export function Orders() {
  const nav = useNavigate(); const { toast } = useStore(); const errToast = useErrorToast();
  const { orderList, activeOrders, subs, setSubs } = useCustomer();
  const past = orderList.filter(o => !activeOrders.includes(o));
  const stop = async (id: string) => { try { setSubs(await api(`/api/subscriptions/${id}/stop`, { method: 'POST', body: {} })); toast('Weekly order stopped'); } catch (e) { errToast(e); } };
  const chip = (o: any) => o.status === 'delivered' ? { s: 'success' as const, l: 'Delivered' } : o.status === 'expired' ? { s: 'ended' as const, l: 'No partner' } : { s: 'ended' as const, l: 'Cancelled' };
  return (
    <>
      <Header title="Orders" />
      <Body tight>
        {activeOrders.map(o => <div key={o.id} className="card row flat clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav(`/customer/order/${o.id}`)}><div className="grow"><div className="b ellip">{o.id} · {orderSummary(o)}</div><div className="cap13">{statusLabel(o)}{o.courierName ? ' · ' + o.courierName : ''}</div></div><StatusChip status="progress" label="Live" /></div>)}
        {subs.length > 0 && <><div className="cap" style={{ marginTop: 8 }}>Repeating</div>{subs.map(s => <div key={s.id} className="card row flat"><Icon name="event_repeat" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b ellip">{s.label}</div><div className="cap">Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.weekday]} · {s.slot} · next {dateStr(s.nextRunAt)}</div></div><Button variant="text" color="warn" size="small" onClick={() => stop(s.id)}>Stop</Button></div>)}</>}
        <div className="cap" style={{ marginTop: 8 }}>Past orders</div>
        {!past.length && <Empty icon="receipt_long" title="No orders yet" text="Your delivered and cancelled orders show up here." />}
        {past.map(o => { const c = chip(o); return (
          <div key={o.id} className="card row flat clickable" onClick={() => nav(`/customer/order/${o.id}`)}>
            <div className="grow"><div className="b ellip">{orderSummary(o)}</div><div className="cap">{dateStr(o.createdAt)} · {o.items.length} item{o.items.length > 1 ? 's' : ''}{o.courierName ? ' · ' + o.courierName : ''}</div></div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}><span className="mono b">{o.status === 'delivered' ? fmt(o.bill.total + o.tip) : '—'}</span><StatusChip status={c.s} label={c.l} variant="inline" /></div>
          </div>); })}
      </Body>
      <CustomerTabs />
    </>
  );
}
