import { useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Body, Button, Chip, Input, Money, Section, StatusChip } from '../ui';
import { ago, useAdmin } from './state';

export function RefundsScreen() {
  const { t } = useT();
  const { overview, refresh } = useAdmin();
  const { toast } = useStore();
  const err = useErrorToast();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const loadHistory = () => api<any[]>('/api/admin/orders').then(os => setHistory(os.filter(o => o.refund && o.refund.status !== 'requested'))).catch(() => {});
  useEffect(() => { void loadHistory(); }, [overview?.refunds.length]);
  const decide = async (o: any, approve: boolean) => {
    setBusy(o.id + approve);
    const amount = Number(amounts[o.id] ?? o.refund.amount);
    if (approve && !(amount >= 0)) { err(new Error(t('Enter a valid amount'))); setBusy(''); return; }
    try { await post(`/api/admin/refunds/${o.id}`, { approve, amount }); toast(approve ? t('Refund of ₹{a} approved', { a: amount }) : t('Refund rejected')); await refresh(); await loadHistory(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const open = overview?.refunds ?? [];
  return (
    <Body>
      <Section title={t('Refund requests')} right={open.length ? String(open.length) : undefined}>
        {!open.length && <div className="cap13">{t('No open requests. Customers report issues after delivery; they land here.')}</div>}
        {open.map(o => (
          <div key={o.id} className="card" style={{ gap: 10 }}>
            <div className="between"><span className="b mono">{o.id}</span><Chip label={o.issue} leftIcon="report" /></div>
            <div className="cap13">{o.anon ? t('Anonymous') : o.customerName} · {o.courierName ?? '—'} · {o.pay.toUpperCase()} · {ago(o.times?.delivered ?? o.updatedAt)} {t('ago')}</div>
            <div className="cap13">{o.items.map((i: any) => `${i.name} × ${i.qty}`).join(', ')}</div>
            <div className="between"><span className="sec">{t('Order total')}</span><span className="mono">{o.bill?.totalLabel}</span></div>
            {o.receiptUrl && <a href={o.receiptUrl} target="_blank" rel="noreferrer" className="cap">{t('Open receipt')}</a>}
            <Input label={t('Refund amount (₹)')} value={amounts[o.id] ?? String(o.refund.amount)} onChange={e => setAmounts({ ...amounts, [o.id]: e.target.value.replace(/[^\d]/g, '') })} prefixText="₹" mono inputMode="numeric" hint={t('Suggested: half the items plus the delivery fee')} />
            <div className="row" style={{ gap: 8 }}>
              <Button color="confirm" icon="check" style={{ flex: 1 }} loading={busy === o.id + 'true'} onClick={() => decide(o, true)}>{t('Approve')}</Button>
              <Button variant="outlined" color="warn" icon="close" style={{ flex: 1 }} loading={busy === o.id + 'false'} onClick={() => decide(o, false)}>{t('Reject')}</Button>
            </div>
          </div>))}
      </Section>
      <Section title={t('History')} right={history.length ? String(history.length) : undefined}>
        {!history.length ? <div className="cap13">{t('Nothing reviewed yet.')}</div> : <div className="list">{history.map(o => (
          <div key={o.id} className="item">
            <div className="grow"><div className="row" style={{ gap: 6 }}><span className="b mono">{o.id}</span><StatusChip status={o.refund.status === 'approved' ? 'success' : 'ended'} label={o.refund.status === 'approved' ? t('Approved') : t('Rejected')} /></div><div className="cap">{o.issue} · {o.customerName}</div></div>
            <Money v={o.refund.amount} />
          </div>))}</div>}
      </Section>
    </Body>
  );
}
