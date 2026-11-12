import { useEffect, useMemo, useState } from 'react';
import type { Partner } from '@getme/core';
import { api, post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Avatar, Body, Button, Chip, Empty, Icon, Input, Section, StatusChip, type Status } from '../ui';
import { maskPhone, useAdmin } from './state';

type P = Partner & { user?: { phone: string; name: string } | null };
const VSTATE: Record<string, { label: string; chip: Status }> = { pending: { label: 'Pending', chip: 'caution' }, verified: { label: 'Verified', chip: 'success' }, rejected: { label: 'Rejected', chip: 'ended' }, none: { label: 'No documents', chip: 'draft' } };
const DOC_LABEL: Record<string, string> = { id: 'ID', licence: 'Licence', rc: 'RC', selfie: 'Selfie' };

function Docs({ p }: { p: P }) {
  if (!p.documents.length) return <div className="cap">—</div>;
  return <div className="wrap">{p.documents.map((d, i) => <a key={i} href={d.url} target="_blank" rel="noreferrer" title={DOC_LABEL[d.kind]} style={{ position: 'relative' }}><img className="thumb" src={d.url} alt={DOC_LABEL[d.kind]} /><span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,37,57,.75)', color: '#fff', fontSize: 9, lineHeight: '12px', textAlign: 'center', borderRadius: '0 0 4px 4px' }}>{DOC_LABEL[d.kind]}</span></a>)}</div>;
}

export function VerifyScreen() {
  const { t } = useT();
  const { refresh } = useAdmin();
  const { toast } = useStore();
  const err = useErrorToast();
  const [all, setAll] = useState<P[]>([]);
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = () => api<P[]>('/api/admin/partners').then(setAll).catch(() => {});
  useEffect(() => { void load(); }, []);
  const decide = async (p: P, decision: 'verified' | 'rejected') => {
    setBusy(p.id + decision);
    try { await post(`/api/admin/partners/${p.id}/verify`, { decision, note: notes[p.id] ?? '' }); toast(decision === 'verified' ? t('{name} is verified', { name: p.name }) : t('{name} rejected', { name: p.name })); await load(); await refresh(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const pending = all.filter(p => p.verification === 'pending');
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return all.filter(p => !s || p.name.toLowerCase().includes(s) || (p.user?.phone ?? '').includes(s) || p.area.toLowerCase().includes(s)); }, [all, q]);
  const groups: [string, P[]][] = ['verified', 'rejected', 'none'].map(k => [k, filtered.filter(p => p.verification === k)] as [string, P[]]);
  return (
    <Body>
      <Section title={t('Awaiting verification')} right={pending.length ? t('{n} pending', { n: pending.length }) : undefined}>
        {!pending.length && <div className="cap13">{t('Nobody is waiting. New partners appear here once their documents are in.')}</div>}
        {pending.map(p => (
          <div key={p.id} className="card" style={{ gap: 10 }}>
            <div className="row"><Avatar initials={p.initials} src={p.photoUrl} size="lg" /><div className="grow"><div className="b">{p.name}</div><div className="cap">{maskPhone(p.user?.phone ?? '')} · {p.vehicle}{p.plate ? ` ${p.plate}` : ''} · {p.area}</div></div><Chip label={p.tier === 'runner' ? t('Runner') : t('Pro')} leftIcon={p.tier === 'runner' ? 'groups' : 'two_wheeler'} /></div>
            <Docs p={p} />
            <Input value={notes[p.id] ?? ''} onChange={e => setNotes({ ...notes, [p.id]: e.target.value })} placeholder={t('Note to the partner (optional)')} />
            <div className="row" style={{ gap: 8 }}>
              <Button color="confirm" icon="verified_user" style={{ flex: 1 }} loading={busy === p.id + 'verified'} onClick={() => decide(p, 'verified')}>{t('Approve')}</Button>
              <Button variant="outlined" color="warn" icon="block" style={{ flex: 1 }} loading={busy === p.id + 'rejected'} onClick={() => decide(p, 'rejected')}>{t('Reject')}</Button>
            </div>
          </div>))}
      </Section>
      <Input value={q} onChange={e => setQ(e.target.value)} prefixIcon="search" placeholder={t('Search partners by name, phone or area')} />
      {groups.map(([k, list]) => list.length > 0 && (
        <Section key={k} title={t(VSTATE[k].label)} right={String(list.length)}>
          <div className="list">{list.map(p => (
            <div key={p.id} className="item" style={{ alignItems: 'flex-start' }}>
              <Avatar initials={p.initials} src={p.photoUrl} />
              <div className="grow">
                <div className="row" style={{ gap: 6 }}><span className="b">{p.name}</span><StatusChip status={VSTATE[p.verification].chip} label={t(VSTATE[p.verification].label)} /></div>
                <div className="cap">{maskPhone(p.user?.phone ?? '')} · {p.tier === 'runner' ? t('Runner') : t('Pro')} · {p.vehicle} · <Icon name="star" size={12} filled color="var(--severity-low)" /> {p.rating} · {p.trips} {t('trips')}{p.online ? ` · ${t('online')}` : ''}</div>
                {p.verificationNote && <div className="cap">{t('Note')}: {p.verificationNote}</div>}
                {p.verification !== 'verified' && p.documents.length > 0 && <div style={{ marginTop: 6 }}><Docs p={p} /></div>}
              </div>
              {p.verification === 'verified' && <Button variant="text" color="warn" size="small" loading={busy === p.id + 'rejected'} onClick={() => decide(p, 'rejected')}>{t('Revoke')}</Button>}
              {p.verification === 'rejected' && p.documents.length > 0 && <Button variant="text" color="primary" size="small" loading={busy === p.id + 'verified'} onClick={() => decide(p, 'verified')}>{t('Approve')}</Button>}
            </div>))}</div>
        </Section>))}
      {!all.length && <Empty icon="group" title={t('No partners yet')} />}
    </Body>
  );
}
