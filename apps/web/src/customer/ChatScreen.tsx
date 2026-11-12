import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Message } from '@getme/core';
import { TERMINAL } from '@getme/core';
import { api, uploadFile } from '../lib/api';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { CallOverlay } from '../lib/phone';
import { Body, Chip, Header, Icon, IconButton, Input } from '../ui';
import { useCustomer } from './state';

const QUICK = ['Please add 1 kg sugar', 'Call me when you reach', 'Leave it at the door', 'Ask the security guard'];

export function ChatScreen() {
  const { id } = useParams(); const nav = useNavigate(); const { t } = useT();
  const errToast = useErrorToast();
  const { orders, lastMessage, chatOpen, clearUnread } = useCustomer();
  const o = orders[id!];
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [calling, setCalling] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { chatOpen.current = id!; clearUnread(id!); api(`/api/orders/${id}/messages`).then(setMsgs).catch(errToast); return () => { chatOpen.current = null; }; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (lastMessage && lastMessage.orderId === id) setMsgs(m => m.some(x => x.id === lastMessage.id) ? m : [...m, lastMessage]); }, [lastMessage, id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  const closed = !o || TERMINAL.has(o.status);
  const send = async (t: string, type: Message['type'] = 'text', pos?: { lat: number; lng: number }) => { const body = t.trim(); if (!body && type === 'text') return; try { const m = await api(`/api/orders/${id}/messages`, { method: 'POST', body: { type, text: body, pos } }); setMsgs(ms => ms.some(x => x.id === m.id) ? ms : [...ms, m]); setText(''); } catch (e) { errToast(e); } };
  const photo = async (f: File | undefined) => { if (!f) return; try { const url = await uploadFile(f); await send(url, 'photo'); } catch (e) { errToast(e); } };
  const loc = () => { const fallback = () => send(`Live location · ${o?.address.line ?? ''}`, 'location', o ? { lat: o.address.lat, lng: o.address.lng } : undefined); if (!navigator.geolocation) return fallback(); navigator.geolocation.getCurrentPosition(p => send('Live location', 'location', { lat: p.coords.latitude, lng: p.coords.longitude }), fallback, { timeout: 4000 }); };
  const name = o?.courier?.name ?? o?.courierName ?? t('Partner');
  return (
    <>
      <Header onBack={() => nav(`/customer/order/${id}`)} right={<button className="chrome-btn" onClick={() => setCalling(true)} aria-label={t('Call')}><Icon name="call" size={22} /></button>}>
        <div className="grow"><div className="title">{name}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{t('Your delivery partner · number stays private')}</div></div>
      </Header>
      <Body tight>
        {!msgs.length && <div className="cap13" style={{ textAlign: 'center', padding: 16 }}>{t('Say hello. Messages are relayed through GetMe.')}</div>}
        {msgs.map(m => { const me = m.from === 'customer'; return (
          <div key={m.id} className="col" style={{ alignItems: me ? 'flex-end' : 'flex-start', gap: 2 }}>
            {m.type === 'text' && <div className={'bubble ' + (me ? 'me' : 'them')}>{m.text}</div>}
            {m.type === 'photo' && <a href={m.text} target="_blank" rel="noreferrer" style={{ width: 180, borderRadius: 8, border: '1px solid var(--surface-border)', background: 'var(--surface-sunken)', overflow: 'hidden', display: 'block' }}><img src={m.text} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} /></a>}
            {m.type === 'location' && <div style={{ width: 220, borderRadius: 8, border: '1px solid var(--surface-border)', background: 'var(--surface)', overflow: 'hidden' }}><div style={{ height: 72, background: '#e8edf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="location_on" size={28} filled color="var(--brand-fox-red)" /></div><div style={{ padding: '8px 10px', fontSize: 12, lineHeight: '16px' }}><div className="b">{m.text}</div>{m.pos && <a href={`https://www.openstreetmap.org/?mlat=${m.pos.lat}&mlon=${m.pos.lng}#map=17/${m.pos.lat}/${m.pos.lng}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{t('Open in maps')}</a>}</div></div>}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(m.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
          </div>); })}
        <div ref={end} />
      </Body>
      <div className="sticky-cta" style={{ padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        {closed ? <div className="cap13" style={{ textAlign: 'center' }}>{t('This chat is closed.')}</div> : <>
          <div style={{ display: 'flex', gap: 8, overflow: 'auto', scrollbarWidth: 'none' }}>{QUICK.map(q => <Chip key={q} label={t(q)} onClick={() => send(t(q))} />)}</div>
          <div className="row" style={{ gap: 4 }}>
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => photo(e.target.files?.[0])} />
            <IconButton icon="photo_camera" label={t('Send a photo')} onClick={() => file.current?.click()} />
            <IconButton icon="location_on" label={t('Share location')} onClick={loc} />
            <Input placeholder={t('Message')} value={text} onChange={e => setText(e.target.value)} onEnter={() => send(text)} style={{ flex: 1 }} />
            <IconButton icon="send" label={t('Send')} color="primary" onClick={() => send(text)} />
          </div></>}
      </div>
      {calling && <CallOverlay name={name} onEnd={() => setCalling(false)} />}
    </>
  );
}
