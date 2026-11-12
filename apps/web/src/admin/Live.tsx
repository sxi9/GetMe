import { useState } from 'react';
import { STATUS_LABEL, type OrderStatus } from '@getme/core';
import { post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { AlertBanner, Body, Button, Chip, Empty, Icon, Input, Money, Section, Sheet, StatusChip, Timeline, type Status } from '../ui';
import { ago, timeStr, useAdmin } from './state';

const STATUS_CHIP: Record<string, Status> = { scheduled: 'pending', requesting: 'progress', counter: 'caution', to_shop: 'progress', shopping: 'progress', to_customer: 'progress', arrived: 'info', delivered: 'success', cancelled: 'ended', expired: 'ended' };
const KIND_ICON: Record<string, string> = { list: 'checklist', shop: 'storefront', parcel: 'inventory_2' };
const STEPS: { label: string; key: string }[] = [['Requested', 'requesting'], ['Heading to the shop', 'to_shop'], ['Shopping', 'shopping'], ['On the way', 'to_customer'], ['Arrived', 'arrived'], ['Delivered', 'delivered']].map(([label, key]) => ({ label, key }));

export function LiveScreen() {
  const { t } = useT();
  const { overview, loading, refresh } = useAdmin();
  const { toast } = useStore();
  const err = useErrorToast();
  const [sel, setSel] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const ov = overview;
  const tiles: [string, string | number][] = [[t('Orders today'), ov?.ordersToday ?? '—'], [t('Partners online'), ov ? `${ov.partnersOnline} / ${ov.partners}` : '—'], [t('Open refunds'), ov?.refunds.length ?? '—'], [t('To verify'), ov ? ov.pendingPartners.length + ov.pendingShops.length : '—']];
  const cancelOrder = async () => {
    if (!sel) return; setBusy('cancel');
    try { await post(`/api/orders/${sel.id}/events`, { type: 'cancel', reason: reason.trim() || 'Cancelled by GetMe ops' }); toast(t('Order {id} cancelled', { id: sel.id })); setSel(null); setReason(''); await refresh(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const cancelRun = async (r: any) => { setBusy(r.id); try { await post(`/api/runs/${r.id}/cancel`); toast(t('Trip cancelled. Waiting orders go back to broadcast')); await refresh(); } catch (e) { err(e); } finally { setBusy(''); } };
  const live = ov?.live ?? [];
  return (
    <Body>
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {tiles.map(([label, v]) => <div key={label} className="card flat" style={{ gap: 2, padding: 12 }}><div className="overline">{label}</div><div className="stat">{v}</div></div>)}
      </div>
      <Section title={t('Live orders')} right={live.length ? t('{n} open', { n: live.length }) : undefined}>
        {!loading && !live.length && <Empty icon="local_shipping" title={t('No live orders')} text={t('New requests, active jobs and trips show up here as they happen.')} />}
        {live.length > 0 && <div className="list">{live.map((o: any) => (
          <div key={o.id} className="item clickable" onClick={() => setSel(o)}>
            <Icon name={KIND_ICON[o.kind] ?? 'local_shipping'} size={22} color="var(--icon)" />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}><span className="b mono">{o.id}</span><StatusChip status={STATUS_CHIP[o.status] ?? 'info'} label={STATUS_LABEL[o.status as OrderStatus] ?? o.status} /></div>
              <div className="cap ellip">{o.anon ? t('Anonymous') : o.customerName} · {o.courierName ?? t('No partner yet')} · {o.regionId} · {ago(o.createdAt)}</div>
            </div>
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>))}</div>}
      </Section>
      <Section title={t('Open trips')} right={ov?.runs.length ? t('{n} open', { n: ov.runs.length }) : undefined}>
        {!(ov?.runs.length) && <div className="cap13">{t('No partner has announced a trip right now.')}</div>}
        {(ov?.runs ?? []).map((r: any) => (
          <div key={r.id} className="card flat" style={{ gap: 6 }}>
            <div className="between"><div className="b">{r.label}</div><Chip label={r.status} /></div>
            <div className="cap13">{r.partnerName} → {r.destination} · {t('leaves {t}', { t: timeStr(r.departAt) })} · {t('{n} of {c} seats taken', { n: r.orderIds.length, c: r.capacity })} · <Money v={r.feePerOrder} />/{t('order')}</div>
            {(r.status === 'open' || r.status === 'closed') && <div><Button variant="text" color="warn" size="small" loading={busy === r.id} onClick={() => cancelRun(r)}>{t('Cancel trip')}</Button></div>}
          </div>))}
      </Section>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${t('Order')} ${sel.id}` : ''}>
        {sel && <>
          <div className="row" style={{ gap: 6 }}><StatusChip status={STATUS_CHIP[sel.status] ?? 'info'} label={STATUS_LABEL[sel.status as OrderStatus] ?? sel.status} /><Chip label={sel.kind} /><Chip label={sel.mode} /><Chip label={sel.pay.toUpperCase()} /></div>
          <div className="card flat" style={{ gap: 4 }}>
            <div className="b">{sel.anon ? t('Anonymous customer') : sel.customerName}{sel.courierName ? ` · ${sel.courierName}` : ''}</div>
            <div className="cap13">{sel.shopName} → {[sel.address?.flat, sel.address?.building, sel.address?.line, sel.address?.landmark && `near ${sel.address.landmark}`].filter(Boolean).join(' · ')}</div>
            {sel.address?.handoff && sel.address.handoff !== 'in_person' && <div className="cap">{t('Handoff')}: {sel.address.handoff.replace('_', ' ')}</div>}
            {sel.run && <div className="cap">{t('On trip')}: {sel.run.label} · {timeStr(sel.run.departAt)}</div>}
          </div>
          <div className="card flat" style={{ gap: 4 }}>
            {sel.items.map((i: any, idx: number) => <div key={idx} className="between"><span>{i.name} × {i.qty}{i.substitute ? ` → ${i.substitute}` : ''}{i.unavailable ? ` (${t('not found')})` : ''}</span><span className="mono">{i.price != null ? `₹${i.price * i.qty}` : '—'}</span></div>)}
            <div className="divider" />
            <div className="between"><span className="sec">{t('Items')}</span><span className="mono">{sel.bill?.itemsLabel}</span></div>
            <div className="between"><span className="sec">{t('Delivery')}</span><span className="mono">₹{sel.fee.delivery}{sel.fee.extra ? ` + ₹${sel.fee.extra}` : ''}</span></div>
            <div className="between"><span className="sec">{t('Service')}{sel.fee.insure ? ` + ${t('protection')}` : ''}</span><span className="mono">₹{sel.fee.service + (sel.fee.insure || 0)}</span></div>
            {sel.promo > 0 && <div className="between"><span className="sec">{t('Promo')}</span><span className="mono">−₹{sel.promo}</span></div>}
            <div className="between b"><span>{t('Total')}</span><span className="mono">{sel.bill?.totalLabel}</span></div>
          </div>
          <Timeline steps={STEPS} index={Math.max(0, STEPS.findIndex(s => s.key === sel.status))} times={sel.times} />
          {['scheduled', 'requesting', 'counter', 'to_shop'].includes(sel.status) ? <>
            <Input label={t('Reason for cancelling')} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('e.g. Customer called support')} />
            <Button color="warn" fullWidth icon="cancel" loading={busy === 'cancel'} onClick={cancelOrder}>{t('Cancel order')}</Button>
          </> : <AlertBanner type="neutral">{t('Orders can only be cancelled before shopping starts.')}</AlertBanner>}
        </>}
      </Sheet>
    </Body>
  );
}
