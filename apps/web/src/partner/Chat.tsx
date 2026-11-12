import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Message } from '@getme/core';
import { Body, Chip, Header, Icon, IconButton, Input } from '../ui';
import { post, uploadFile, API_URL } from '../lib/api';
import { useErrorToast } from '../lib/store';
import { useT } from '../lib/i18n';
import { CallOverlay } from '../lib/phone';
import { usePartner } from './state';

const QUICK = ['On my way', 'Reached the shop', 'Which brand do you prefer?', 'At your door'];
const t = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  const src = m.text.startsWith('/') ? API_URL + m.text : m.text;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {m.type === 'text' && <div className={'bubble ' + (mine ? 'me' : 'them')}>{m.text}</div>}
      {m.type === 'photo' && (/^(\/|https?:)/.test(m.text) ? <img src={src} alt="Photo" style={{ width: 180, borderRadius: 8, border: '1px solid var(--surface-border)' }} /> : <div style={{ width: 180, height: 130, borderRadius: 8, border: '1px solid var(--surface-border)', background: 'var(--surface-sunken)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: 12 }}><Icon name="image" size={28} />{m.text}</div>)}
      {m.type === 'location' && <div style={{ width: 220, borderRadius: 8, border: '1px solid var(--surface-border)', background: 'var(--surface)', overflow: 'hidden' }}><div style={{ height: 72, background: '#e8edf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="location_on" size={28} filled color="var(--brand-fox-red)" /></div><div style={{ padding: '8px 10px', fontSize: 12, lineHeight: '16px' }}><div className="b">{m.text}</div>{m.pos && <a href={`https://www.google.com/maps?q=${m.pos.lat},${m.pos.lng}`} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>Open in maps</a>}</div></div>}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t(m.at)}</div>
    </div>
  );
}

export function Chat() {
  const { t: tr } = useT();
  const nav = useNavigate(); const err = useErrorToast();
  const { active, messages, markRead, myPos } = usePartner();
  const [text, setText] = useState(''); const [calling, setCalling] = useState(false);
  const end = useRef<HTMLDivElement>(null); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { markRead(); }, [messages.length, markRead]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  if (!active) return <><Header title={tr('Chat')} onBack={() => nav('/partner')} /><Body><div className="cap">{tr('No active job.')}</div></Body></>;
  const name = active.anon ? tr('Customer') : active.customerName;
  const send = async (body: Record<string, unknown>) => { try { await post(`/api/orders/${active.id}/messages`, body); } catch (e) { err(e); } };
  const sendText = () => { const v = text.trim(); if (!v) return; setText(''); send({ type: 'text', text: v }); };
  const sendPhoto = async (f: File) => { try { const url = await uploadFile(f); await send({ type: 'photo', text: url }); } catch (e) { err(e); } };
  const sendLoc = () => { const go = (pos: { lat: number; lng: number }) => send({ type: 'location', text: 'Live location', pos }); if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition(p => go({ lat: p.coords.latitude, lng: p.coords.longitude }), () => go(myPos), { timeout: 3000 }); else go(myPos); };
  return (
    <>
      <Header onBack={() => nav('/partner/job')} right={<button className="chrome-btn" aria-label={tr('Call')} onClick={() => setCalling(true)}><Icon name="call" size={22} /></button>}>
        <div className="grow"><div className="title">{name}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{tr('Customer')} · {active.id}</div></div>
      </Header>
      <Body tight>
        {messages.map(m => <Bubble key={m.id} m={m} mine={m.from === 'partner'} />)}
        {!messages.length && <div className="cap" style={{ textAlign: 'center', padding: 16 }}>{tr('Messages are relayed through GetMe. Phone numbers stay private.')}</div>}
        <div ref={end} />
      </Body>
      <div className="sticky-cta" style={{ padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', gap: 8, overflow: 'auto', scrollbarWidth: 'none' }}>{QUICK.map(q => <Chip key={q} label={tr(q)} onClick={() => send({ type: 'text', text: tr(q) })} />)}</div>
        <div className="row" style={{ gap: 4 }}>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) sendPhoto(f); e.target.value = ''; }} />
          <IconButton icon="photo_camera" label={tr('Send a photo')} onClick={() => file.current?.click()} />
          <IconButton icon="location_on" label={tr('Share location')} onClick={sendLoc} />
          <Input placeholder={tr('Message')} value={text} onChange={e => setText(e.target.value)} onEnter={sendText} style={{ flex: 1 }} />
          <IconButton icon="send" label={tr('Send')} color="primary" onClick={sendText} />
        </div>
      </div>
      {calling && <CallOverlay name={name} onEnd={() => setCalling(false)} />}
    </>
  );
}
