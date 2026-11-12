import { useEffect } from 'react';
import { Body, Header, Icon, Money } from '../ui';
import { useT } from '../lib/i18n';
import { usePartner } from './state';

export function Earnings() {
  const { t: tr } = useT();
  const { earnings: e, refreshEarnings } = usePartner();
  useEffect(() => { refreshEarnings(); }, [refreshEarnings]);
  const max = Math.max(1, ...(e?.week ?? [0]));
  const pct = e ? Math.min(100, Math.round((e.bonus.trips / e.bonus.target) * 100)) : 0;
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <>
      <Header title={tr('Earnings')} />
      <Body>
        <div className="card" style={{ gap: 4 }}>
          <div className="overline">{tr('Today')}</div>
          <div className="mono" style={{ font: '600 32px/40px var(--font-mono)', color: 'var(--gm-chrome)' }}>₹{e?.today ?? 0}</div>
          <div className="cap13">{tr('{n} trips · ₹{m} in tips · {h} online', { n: e?.trips ?? 0, m: e?.tips ?? 0, h: e?.hours ?? '0h 0m' })}</div>
        </div>
        <div className="card flat" style={{ gap: 12 }}>
          <div className="b">{tr('This week')}</div>
          <div className="bar">{(e?.week ?? [0, 0, 0, 0, 0, 0, 0]).map((v, i) => <div key={i}><div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'flex-end' }} title={`₹${v}`}><div className={'v' + (i === 6 ? ' hi' : '')} style={{ height: Math.max(4, Math.round((v / max) * 100)) + '%', background: v ? undefined : 'var(--surface-border)' }} /></div><div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--text-secondary)' }}>{e?.labels?.[i] ?? ''}</div></div>)}</div>
        </div>
        <div className="card flat" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}><Icon name="military_tech" size={20} color="var(--brand-primary-rest)" /><div className="grow b">{tr('Daily bonus')}</div><Money v={e?.bonus.amount ?? 100} /></div>
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 4, borderRadius: 999, background: 'var(--fill-active)', overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: 'var(--brand-primary-rest)', borderRadius: 999, transition: 'width .3s ease' }} /></div>
          <div className="cap">{e ? (e.bonus.trips >= e.bonus.target ? tr('Unlocked today') : tr('{a} of {b} trips · {c} more to unlock ₹{d}', { a: e.bonus.trips, b: e.bonus.target, c: e.bonus.target - e.bonus.trips, d: e.bonus.amount })) : ''}</div>
        </div>
        <div className="grid2">
          <div className="card flat" style={{ padding: '10px 12px', gap: 0 }}><div className="overline">{tr('GetMe balance')}</div><div className="price" style={{ color: (e?.balance ?? 0) < 0 ? 'var(--brand-warn-rest)' : undefined }}>{(e?.balance ?? 0) < 0 ? '−' : ''}₹{Math.abs(e?.balance ?? 0)}</div><div className="cap">{(e?.balance ?? 0) < 0 ? tr('Due to GetMe') : tr('Paid out daily')}</div></div>
          <div className="card flat" style={{ padding: '10px 12px', gap: 0 }}><div className="overline">{tr('Cash collected')}</div><div className="price">₹{e?.codDue ?? 0}</div><div className="cap">{tr('COD · deposit by Friday')}</div></div>
        </div>
        <div className="col">
          <div className="b">{tr('Recent trips')}</div>
          {(e?.recent ?? []).map(r => <div key={r.id} className="card row flat"><div className="grow"><div className="ellip" style={{ fontSize: 13, lineHeight: '18px' }}>{r.label}</div><div className="cap">{r.id} · {t(r.t)}</div></div><Money v={r.amt} /></div>)}
          {e && !e.recent.length && <div className="cap">{tr('No trips yet. Your first delivery shows up here.')}</div>}
        </div>
      </Body>
    </>
  );
}
