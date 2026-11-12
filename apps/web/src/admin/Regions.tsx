import { useEffect, useState } from 'react';
import type { RegionProfile } from '@getme/core';
import { api } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Body, Button, Chip, Input, Section } from '../ui';
import { maskPhone, timeStr, useAdmin } from './state';

const WHY: Record<string, string> = {
  city: 'Dense city: many partners, short radius, quick expiry, pay in app.',
  town: 'Small town: fewer partners, wider radius, requests stay open an hour, cash first.',
  hill: 'Hill station: long distances and a surcharge; trips to town are the default.',
  village: 'Village: widest radius, requests open for hours, cash and trips by default.',
};
const KEYS: (keyof RegionProfile)[] = ['radiusKm', 'expandEveryMs', 'expireAfterMs', 'deliveryBase', 'deliveryPerKm', 'deliveryMin', 'deliveryMax', 'surcharge', 'defaultPay', 'defaultMode', 'coverageKm'];

export function RegionsScreen() {
  const { t } = useT();
  const { overview, refresh } = useAdmin();
  const { toast } = useStore();
  const err = useErrorToast();
  const [base, setBase] = useState<RegionProfile[]>([]);
  const [draft, setDraft] = useState<Record<string, RegionProfile>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => { api<RegionProfile[]>('/api/regions').then(rs => { setBase(rs); setDraft(Object.fromEntries(rs.map(r => [r.id, r]))); }).catch(() => {}); }, []);
  const upd = (id: string, p: Partial<RegionProfile>) => setDraft(d => ({ ...d, [id]: { ...d[id], ...p } }));
  const num = (id: string, k: keyof RegionProfile, v: string, scale = 1) => { const n = Number(v); if (Number.isFinite(n)) upd(id, { [k]: n * scale } as any); };
  const changed = (r: RegionProfile) => { const o = base.find(b => b.id === r.id); if (!o) return {}; const diff: any = { id: r.id }; for (const k of KEYS) if (JSON.stringify(o[k]) !== JSON.stringify(r[k])) diff[k] = r[k]; return diff; };
  const save = async () => {
    setBusy('save');
    const over = Object.values(draft).map(changed).filter(d => Object.keys(d).length > 1);
    try { const rs = await api<RegionProfile[]>('/api/admin/regions', { method: 'PUT', body: over }); setBase(rs); setDraft(Object.fromEntries(rs.map(r => [r.id, r]))); toast(over.length ? t('Region profiles saved') : t('Nothing changed')); await refresh(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const dirty = Object.values(draft).some(r => Object.keys(changed(r)).length > 1);
  const field = (id: string, label: string, k: keyof RegionProfile, scale = 1, prefix?: string, suffix?: string) => (
    <Input label={label} value={String((draft[id][k] as number) / scale)} onChange={e => num(id, k, e.target.value, scale)} inputMode="decimal" mono prefixText={prefix} suffix={suffix ? <span className="cap">{suffix}</span> : undefined} />
  );
  return (
    <Body>
      <div className="cap13">{t('Each order snapshots the profile for its drop point, so changes apply to new orders only.')}</div>
      {Object.values(draft).map(r => (
        <div key={r.id} className="card" style={{ gap: 10 }}>
          <div className="between"><div className="b">{r.name}</div><Chip label={r.kind} /></div>
          <div className="cap">{t(WHY[r.kind] ?? '')}{r.coverageKm > 0 ? ` ${t('Applies within {km} km of {lat}, {lng}.', { km: r.coverageKm, lat: r.center.lat.toFixed(3), lng: r.center.lng.toFixed(3) })}` : ` ${t('Default for places outside every named region.')}`}</div>
          <div className="overline">{t('Search radius ladder (km)')}</div>
          <div className="row" style={{ gap: 8 }}>{[0, 1, 2].map(i => <Input key={i} value={String(r.radiusKm[i] ?? '')} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) { const next = [...r.radiusKm]; next[i] = v; upd(r.id, { radiusKm: next }); } }} inputMode="decimal" mono style={{ flex: 1 }} />)}</div>
          <div className="grid2">
            {field(r.id, t('Widen every (min)'), 'expandEveryMs', 60_000)}
            {field(r.id, t('Expire after (min)'), 'expireAfterMs', 60_000)}
            {field(r.id, t('Base fee'), 'deliveryBase', 1, '₹')}
            {field(r.id, t('Per km'), 'deliveryPerKm', 1, '₹')}
            {field(r.id, t('Minimum'), 'deliveryMin', 1, '₹')}
            {field(r.id, t('Maximum'), 'deliveryMax', 1, '₹')}
            {field(r.id, t('Surcharge ×'), 'surcharge')}
            {field(r.id, t('Coverage (km)'), 'coverageKm')}
          </div>
          <div className="overline">{t('Default payment')}</div>
          <div className="wrap">{(['cod', 'upi', 'card', 'wallet'] as const).map(p => <Chip key={p} label={p === 'cod' ? t('Cash') : p.toUpperCase()} selected={r.defaultPay === p} onClick={() => upd(r.id, { defaultPay: p })} />)}</div>
          <div className="overline">{t('Default dispatch')}</div>
          <div className="wrap">{(['broadcast', 'offers', 'choose', 'run'] as const).map(m => <Chip key={m} label={m === 'run' ? t('Trip') : t(m[0].toUpperCase() + m.slice(1))} selected={r.defaultMode === m} onClick={() => upd(r.id, { defaultMode: m })} />)}</div>
        </div>))}
      <div className="sticky-cta" style={{ margin: '0 -16px -16px', position: 'sticky', bottom: -16 }}><Button color="primary" size="tall" fullWidth icon="save" disabled={!dirty} loading={busy === 'save'} onClick={save}>{dirty ? t('Save region profiles') : t('No changes')}</Button></div>
      <Section title={t('Recent SMS')} right={overview?.sms.length ? String(overview.sms.length) : undefined}>
        <div className="cap">{t('Fallback messages sent when a user had no push device or app open.')}{overview?.sms[0] ? ` · ${t('provider')}: ${overview.sms[0].provider}` : ''}</div>
        {!overview?.sms.length ? <div className="cap13">{t('No SMS sent yet.')}</div> : <div className="list">{overview.sms.map((m, i) => <div key={i} className="item"><div className="grow"><div className="b mono">{maskPhone(m.phone)}</div><div className="cap">{m.text}</div></div><div className="cap" style={{ whiteSpace: 'nowrap' }}>{timeStr(m.at)}</div></div>)}</div>}
      </Section>
      <Section title={t('Communities')} right={overview?.communities.length ? String(overview.communities.length) : undefined}>
        {!overview?.communities.length ? <div className="cap13">{t('No communities yet.')}</div> : <div className="list">{overview.communities.map(c => <div key={c.id} className="item"><div className="grow"><div className="b">{c.name}</div><div className="cap">{c.kind} · {c.address} · {t('{n} members', { n: c.memberCount })} · {c.regionId}</div></div><Chip label={c.joinCode} leftIcon="key" /></div>)}</div>}
      </Section>
    </Body>
  );
}
