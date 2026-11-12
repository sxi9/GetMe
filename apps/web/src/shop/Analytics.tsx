import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt } from '@getme/core';
import { useT } from '../lib/i18n';
import { Body, Empty, Icon, Money } from '../ui';
import { useShop } from './state';

export function AnalyticsScreen() {
  const { analytics: a, refreshAnalytics } = useShop();
  const nav = useNavigate();
  const { t } = useT();
  useEffect(() => { refreshAnalytics(); }, [refreshAnalytics]);
  if (!a) return <Body><Empty icon="insights" title={t('Loading analytics')} /></Body>;
  const max = Math.max(1, ...a.week);
  const topMax = Math.max(1, ...a.top.map(x => x.n));
  const todayIdx = a.week.length - 1;
  const tile = (label: string, v: string) => <div className="card flat" style={{ padding: '10px 12px', gap: 2 }}><div className="overline">{label}</div><div className="price">{v}</div></div>;
  return (
    <Body style={{ paddingBottom: 48 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {tile(t('Orders'), String(a.orders))}{tile(t('Revenue'), fmt(a.revenue))}{tile(t('Avg prep'), a.avgPrep ? `${a.avgPrep} ${t('min')}` : '—')}
      </div>
      <div className="card flat" style={{ gap: 12 }}>
        <div className="b">{t('Revenue this week')}</div>
        <div className="bar" style={{ gap: 8 }}>
          {a.week.map((v, i) => (
            <div key={i}>
              <div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'flex-end' }}><div className={'v' + (i === todayIdx ? ' hi' : '')} title={fmt(v)} style={{ height: Math.max(4, Math.round((v / max) * 100)) + '%', background: v ? undefined : 'var(--surface-border)' }} /></div>
              <div style={{ fontSize: 11, lineHeight: '16px', color: i === todayIdx ? 'var(--text)' : 'var(--text-secondary)', fontWeight: i === todayIdx ? 600 : 400 }}>{a.labels[i]}</div>
            </div>
          ))}
        </div>
        <div className="cap">{t('Catalogue item sales on delivered orders · today {amount}', { amount: fmt(a.week[todayIdx] ?? 0) })}</div>
      </div>
      <div className="card flat" style={{ gap: 10 }}>
        <div className="b">{t('Top items')}</div>
        {a.top.length === 0 && <div className="cap13">{t('Nothing sold yet. Top sellers appear once orders are delivered.')}</div>}
        {a.top.map(top => (
          <div key={top.name} className="col" style={{ gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{top.name}</span><span className="sec">{t('{n} sold', { n: top.n })}</span></div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-sunken)' }}><div style={{ height: 6, borderRadius: 3, background: 'var(--brand-primary-rest)', width: Math.round((top.n / topMax) * 100) + '%' }} /></div>
          </div>
        ))}
      </div>
      <div className="card flat" style={{ gap: 8 }}>
        <div className="b">{t('Where orders come from')}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{t('Shopping lists bought here by partners')}</span><span className="mono">{a.split}%</span></div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--fill-active)', overflow: 'hidden' }}><div style={{ height: '100%', width: a.split + '%', background: 'var(--brand-primary-rest)', borderRadius: 2 }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{t('Catalogue orders in GetMe')}</span><span className="mono">{100 - a.split}%</span></div>
      </div>
      <div className="card row clickable" onClick={() => nav('/shop/profile')}>
        <div className="tile"><Icon name="account_balance" size={20} /></div>
        <div className="grow"><div className="b">{t('Settlement balance')}</div><div className="cap">{t('Paid out weekly after 8% commission')}</div></div>
        <Money v={a.settlement} style={{ fontSize: 16 }} />
        <Icon name="chevron_right" size={22} color="var(--icon)" />
      </div>
    </Body>
  );
}
