import { useEffect, useState } from 'react';
import type { Shop } from '@getme/core';
import { api, post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Body, Button, Empty, Icon, Section, StatusChip, Toggle } from '../ui';
import { useAdmin } from './state';

export function ShopsScreen() {
  const { t } = useT();
  const { refresh } = useAdmin();
  const { toast } = useStore();
  const err = useErrorToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [busy, setBusy] = useState('');
  const load = () => api<Shop[]>('/api/admin/shops').then(setShops).catch(() => {});
  useEffect(() => { void load(); }, []);
  const approve = async (s: Shop, approved: boolean) => {
    setBusy(s.id);
    try { await post(`/api/admin/shops/${s.id}/approve`, { approved }); toast(approved ? t('{name} is live for customers', { name: s.name }) : t('{name} hidden from customers', { name: s.name })); await load(); await refresh(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const pending = shops.filter(s => !s.approved);
  const live = shops.filter(s => s.approved);
  const row = (s: Shop) => (
    <div key={s.id} className="item" style={{ alignItems: 'flex-start' }}>
      {s.photoUrl ? <img className="thumb" src={s.photoUrl} alt="" /> : <div className="tile"><Icon name="storefront" size={20} /></div>}
      <div className="grow">
        <div className="row" style={{ gap: 6 }}><span className="b">{s.name}</span><StatusChip status={s.open ? 'success' : 'ended'} label={s.open ? t('Open') : t('Closed')} /></div>
        <div className="cap">{s.cat} · {s.address || t('No address')} · {s.hours}</div>
        <div className="cap">{t('{n} items · {m} live', { n: s.items.length, m: s.items.filter(i => i.on).length })}{s.gstin ? ` · GST ${s.gstin}` : ''}</div>
      </div>
      {s.approved ? <Toggle checked={s.approved} onChange={v => approve(s, v)} /> : <Button color="primary" size="small" icon="check" loading={busy === s.id} onClick={() => approve(s, true)}>{t('Approve')}</Button>}
    </div>
  );
  return (
    <Body>
      <Section title={t('Awaiting approval')} right={pending.length ? String(pending.length) : undefined}>
        {!pending.length ? <div className="cap13">{t('No new shops. Shops that sign up appear here before customers can see them.')}</div> : <div className="list">{pending.map(row)}</div>}
      </Section>
      <Section title={t('Live shops')} right={String(live.length)}>
        {!live.length ? <Empty icon="storefront" title={t('No live shops')} /> : <div className="list">{live.map(row)}</div>}
        <div className="cap row" style={{ gap: 6 }}><Icon name="info" size={16} />{t('The toggle hides a shop from customers without deleting it.')}</div>
      </Section>
    </Body>
  );
}
