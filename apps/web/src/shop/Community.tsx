// Community notice board for shops: post offers to residents, see runs going to town.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Avatar, Body, Button, Empty, Header, Icon } from '../ui';
import { useShop } from './state';

export function CommunityScreen() {
  const { community, board, refreshBoard } = useShop();
  const { toast } = useStore();
  const { t } = useT();
  const err = useErrorToast();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (community) void refreshBoard(); }, [community, refreshBoard]);

  const postIt = async () => {
    if (!text.trim()) return; setBusy(true);
    try { await post('/api/community/announce', { text }); setText(''); toast(t('Posted to the notice board')); await refreshBoard(); } catch (e) { err(e); } finally { setBusy(false); }
  };
  const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  const when = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <Header title={community?.name ?? t('Community')} subtitle={community ? `${t(community.kind === 'apartment' ? 'Apartment society' : community.kind === 'village' ? 'Village' : 'Town')} · ${t('{n} members', { n: board?.members.length ?? community.memberCount })}` : undefined} onBack={() => nav('/shop/profile')} />
      <Body style={{ paddingBottom: 48 }}>
        {!community && <Empty icon="groups" title={t('Not in a community yet')} text={t('Join your apartment society or village from Profile to post offers to residents.')} />}
        {community && (
          <>
            <div className="card" style={{ gap: 8 }}>
              <div className="b">{t('Post an offer or a notice')}</div>
              <textarea className="ta" value={text} onChange={e => setText(e.target.value)} placeholder={t('e.g. Fresh mangoes today, 10% off for {name} residents', { name: community.name })} />
              <Button color="primary" fullWidth icon="campaign" onClick={postIt} loading={busy} disabled={!text.trim()}>{t('Post to the notice board')}</Button>
            </div>
            {!!board?.runs.length && (
              <div className="col">
                <div className="h16">{t('Trips to town')}</div>
                {board.runs.map(r => (
                  <div key={r.id} className="card row">
                    <div className="tile"><Icon name="route" size={20} /></div>
                    <div className="grow"><div className="b ellip">{r.label} · {r.destination}</div><div className="cap">{t('{name} leaves {time} · {seats} seats · ₹{fee} per order', { name: r.partnerName.split(' ')[0], time: when(r.departAt), seats: r.seats ?? Math.max(0, r.capacity - (r.orderIds?.length ?? 0)), fee: r.feePerOrder })}</div></div>
                  </div>
                ))}
              </div>
            )}
            <div className="col">
              <div className="h16">{t('Notice board')}</div>
              {!board?.announcements.length && <div className="cap13">{t('Nothing posted yet.')}</div>}
              {board?.announcements.map(a => (
                <div key={a.id} className="card flat" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8 }}><Avatar initials={a.authorName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()} size="sm" /><div className="grow b ellip">{a.authorName}</div><span className="cap">{ago(a.at)}</span></div>
                  <div style={{ fontSize: 14, lineHeight: '20px' }}>{a.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Body>
    </>
  );
}
