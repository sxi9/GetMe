// Community notice board for partners: trips going out, announcements, members.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Announcement, Community as CommunityT } from '@getme/core';
import { AlertBanner, Avatar, Body, Button, Empty, Header, Icon, Input, Money } from '../ui';
import { api, post } from '../lib/api';
import { useT } from '../lib/i18n';
import { useErrorToast, useEvent, useStore } from '../lib/store';
import { RunChip } from './Runs';
import { whenStr, type RView } from './state';

interface Board { community: CommunityT; announcements: Announcement[]; runs: RView[]; members: { id: string; name: string; role: string; photoUrl: string | null }[] }
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

export function CommunityBoard() {
  const { t } = useT(); const nav = useNavigate(); const err = useErrorToast();
  const { session, refreshMe, toast } = useStore(); const me = session!.me;
  const [board, setBoard] = useState<Board | null>(null); const [code, setCode] = useState(''); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => api<Board | null>('/api/community/board').then(setBoard).catch(() => {});
  useEffect(() => { void load(); }, [me.user.communityId]);
  useEvent(ev => { if (ev.type === 'announcement' || ev.type === 'run.updated') load(); });
  const join = async () => { setBusy(true); try { await post('/api/communities/join', { code: code.trim() }); await refreshMe(); toast(t('Joined')); } catch (x) { err(x); } finally { setBusy(false); } };
  const postIt = async () => { const v = text.trim(); if (!v) return; setBusy(true); try { await post('/api/community/announce', { text: v }); setText(''); load(); } catch (x) { err(x); } finally { setBusy(false); } };
  const leave = async () => { if (!confirm(t('Leave this community?'))) return; try { await post('/api/communities/leave'); await refreshMe(); setBoard(null); } catch (x) { err(x); } };
  if (!me.user.communityId || !board) return (
    <>
      <Header title={t('Community')} onBack={() => nav('/partner/profile')} />
      <Body>
        <Empty icon="apartment" title={t('Join your community')} text={t('An apartment society or a village board. See trips going out, post notices and take neighbours\' orders.')} />
        <Input label={t('Join code')} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SUNRISE" prefixIcon="key" mono onEnter={join} hint={t('Ask a resident or the society office for the code')} />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={join}>{t('Join')}</Button>
      </Body>
    </>
  );
  const c = board.community;
  return (
    <>
      <Header title={c.name} subtitle={`${c.kind === 'apartment' ? t('Apartment society') : c.kind === 'village' ? t('Village') : t('Town')} · ${t('{n} members', { n: board.members.length })}`} onBack={() => nav('/partner/profile')} />
      <Body>
        <div className="card" style={{ gap: 8 }}>
          <div className="b">{t('Post a notice')}</div>
          <textarea className="ta" value={text} onChange={e => setText(e.target.value)} placeholder={t('e.g. Going to the market on Sunday, send your lists by Saturday night')} />
          <Button color="primary" fullWidth icon="campaign" loading={busy} onClick={postIt} disabled={!text.trim()}>{t('Post')}</Button>
        </div>
        <div className="col">
          <div className="h16">{t('Trips going out')}</div>
          {!board.runs.length && <div className="cap13">{t('No trips announced right now.')}</div>}
          {board.runs.map(r => (
            <div key={r.id} className="card flat clickable" style={{ gap: 6 }} onClick={() => r.partnerId === me.partner?.id ? nav(`/partner/runs/${r.id}`) : undefined}>
              <div className="between"><div className="row" style={{ gap: 8 }}><Avatar initials={r.partner?.initials ?? 'P'} src={r.partner?.photoUrl} size="sm" /><div className="b">{r.partnerName.split(' ')[0]} → {r.destination}</div></div><RunChip status={r.status} /></div>
              <div className="cap13">{t('leaves {when}', { when: whenStr(r.departAt) })} · {t('{n} of {m} seats taken', { n: r.orderIds.length, m: r.capacity })} · <Money v={r.feePerOrder} /> {t('per order')}</div>
            </div>
          ))}
        </div>
        <div className="col">
          <div className="h16">{t('Notice board')}</div>
          {!board.announcements.length && <div className="cap13">{t('Nothing posted yet.')}</div>}
          <div className="list">{board.announcements.map(a => <div key={a.id} className="item" style={{ alignItems: 'flex-start' }}><Icon name="campaign" size={20} color="var(--brand-primary-rest)" /><div className="grow"><div style={{ fontSize: 13, lineHeight: '18px' }}>{a.text}</div><div className="cap">{a.authorName} · {ago(a.at)}</div></div></div>)}</div>
        </div>
        <AlertBanner type="neutral" action={<Button size="small" variant="text" color="warn" onClick={leave}>{t('Leave')}</Button>}>{t('Join code')} <span className="mono b">{c.joinCode}</span></AlertBanner>
      </Body>
    </>
  );
}
