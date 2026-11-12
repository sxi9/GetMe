// Community notice board: announcements, trips, members.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { Avatar, Body, Button, Chip, Empty, Header, Icon, Input, Sheet } from '../ui';
import { RunCard } from './Runs';
import { useCustomer } from './state';

export function CommunityScreen() {
  const nav = useNavigate(); const { t } = useT(); const { session, setMe } = useStore(); const errToast = useErrorToast();
  const { board, refreshBoard } = useCustomer();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { refreshBoard().catch(() => {}); }, [refreshBoard]);
  const post = async () => { if (!text.trim()) return; setBusy(true); try { await api('/api/community/announce', { method: 'POST', body: { text } }); setText(''); await refreshBoard(); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  const leave = async () => { try { await api('/api/communities/leave', { method: 'POST', body: {} }); setMe({ community: null, user: { ...session!.me.user, communityId: null } } as any); nav('/customer/profile'); } catch (e) { errToast(e); } };
  if (!board) return <><Header title={t('Community')} onBack={() => nav('/customer')} /><Body><JoinCommunity /></Body></>;
  const c = board.community;
  return (
    <>
      <Header onBack={() => nav('/customer')}><div className="grow"><div className="title">{c.name}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{t(c.kind)} · {t('{n} members', { n: board.members.length })} · {t('code')} <span className="mono">{c.joinCode}</span></div></div></Header>
      <Body>
        <div className="card" style={{ gap: 8 }}>
          <div className="b">{t('Notice board')}</div>
          <div className="row" style={{ gap: 8 }}><Input placeholder={t('Going to town? Need something? Tell the neighbours')} value={text} onChange={e => setText(e.target.value)} onEnter={post} style={{ flex: 1 }} /><Button color="primary" icon="send" onClick={post} loading={busy}>{t('Post')}</Button></div>
        </div>
        {board.runs.length > 0 && <div className="col"><div className="h16">{t('Upcoming trips')}</div>{board.runs.map((r: any) => <RunCard key={r.id} r={r} onClick={() => nav(`/customer/runs/${r.id}`)} />)}</div>}
        <div className="col">
          <div className="h16">{t('Recent')}</div>
          {!board.announcements.length && <Empty icon="campaign" title={t('Nothing posted yet')} text={t('Trips, tankers, power cuts, a shop that opened. Anything the neighbours should know.')} />}
          {board.announcements.map((a: any) => (
            <div key={a.id} className={'card row flat' + (a.runId ? ' clickable' : '')} style={{ alignItems: 'flex-start' }} onClick={() => { if (a.runId) nav(`/customer/runs/${a.runId}`); }}>
              <Avatar initials={a.authorName.split(' ').map((s: string) => s[0]).join('').slice(0, 2)} size="md" />
              <div className="grow"><div className="row" style={{ gap: 6 }}><span className="b">{a.authorName}</span><span className="cap">{ago(a.at)}</span></div><div style={{ fontSize: 14, lineHeight: '20px' }}>{a.text}</div>{a.runId && <div className="cap" style={{ color: 'var(--brand-primary-rest)' }}><Icon name="route" size={14} /> {t('Open the trip')}</div>}</div>
            </div>))}
        </div>
        <div className="col"><div className="h16">{t('Members')}</div><div className="wrap">{board.members.map((m: any) => <Chip key={m.id} label={`${m.name.split(' ')[0]}${m.role === 'partner' ? ' · ' + t('runner') : ''}`} leftIcon={m.role === 'partner' ? 'two_wheeler' : 'person'} />)}</div></div>
        <Button variant="text" color="warn" onClick={leave}>{t('Leave this community')}</Button>
      </Body>
    </>
  );
}

export function JoinCommunity() {
  const { t } = useT(); const { setMe, toast, refreshMe } = useStore(); const errToast = useErrorToast(); const { refreshBoard, address } = useCustomer();
  const [code, setCode] = useState('');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState(''); const [kind, setKind] = useState<'apartment' | 'village' | 'town'>('apartment'); const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => { if (!code.trim()) return; setBusy(true); try { const c = await api('/api/communities/join', { method: 'POST', body: { code } }); setMe({ community: c } as any); await refreshMe(); await refreshBoard(); toast(t('Welcome to {name}', { name: c.name })); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const doCreate = async () => { if (!name.trim()) { toast(t('Give the community a name')); return; } setBusy(true); try { const c = await api('/api/communities', { method: 'POST', body: { name, kind, address: addr, pos: address ? { lat: address.lat, lng: address.lng } : null } }); setMe({ community: c } as any); await refreshMe(); await refreshBoard(); setCreate(false); toast(t('{name} created · share code {code} with neighbours', { name: c.name, code: c.joinCode })); } catch (e) { errToast(e); } finally { setBusy(false); } };
  return (
    <>
      <div className="card">
        <div className="row" style={{ gap: 8 }}><Icon name="groups" size={22} color="var(--brand-primary-rest)" /><div className="h16">{t('Your apartment or village')}</div></div>
        <div className="cap13">{t('A notice board for neighbours: who is going to town, shared trips, shop news. Ask a neighbour for the code, or start one.')}</div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Input placeholder={t('Join code, e.g. SUNRISE')} value={code} onChange={e => setCode(e.target.value.toUpperCase())} onEnter={join} prefixIcon="key" style={{ flex: 1 }} mono /><Button color="primary" onClick={join} loading={busy}>{t('Join')}</Button></div>
        <Button variant="text" color="primary" onClick={() => setCreate(true)}>{t('Start a community')}</Button>
      </div>
      <Sheet open={create} onClose={() => setCreate(false)} title={t('Start a community')}>
        <Input label={t('Name')} placeholder={t('e.g. Sunrise Residency, Kakkabe village')} value={name} onChange={e => setName(e.target.value)} />
        <div className="wrap">{(['apartment', 'village', 'town'] as const).map(k => <Chip key={k} label={t(k)} selected={kind === k} onClick={() => setKind(k)} />)}</div>
        <Input label={t('Address or area')} value={addr} onChange={e => setAddr(e.target.value)} placeholder={t('Where it is')} />
        <Button color="primary" size="tall" fullWidth onClick={doCreate} loading={busy}>{t('Create')}</Button>
      </Sheet>
    </>
  );
}
