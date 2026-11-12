import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SLOTS, TEMPLATES } from '@getme/core';
import { api, uploadFile } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useStore } from '../lib/store';
import { DeliverToSheet } from './DeliverTo';
import { Body, Button, Chip, Header, Icon, IconButton, Input, Toggle } from '../ui';
import { useCustomer, type ListItem } from './state';

export function ListScreen() {
  const nav = useNavigate(); const { t } = useT();
  const { toast } = useStore();
  const { list, setList, setCoKind, address, pendingRun, runs } = useCustomer();
  const [deliver, setDeliver] = useState(false);
  const run = pendingRun ? runs.find(r => r.id === pendingRun) : null;
  const [newItem, setNewItem] = useState('');
  const [shops, setShops] = useState<any[]>([]);
  const [listening, setListening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api('/api/shops').then(setShops).catch(() => {}); }, []);

  const add = (name: string) => { const t = name.trim(); if (!t) return; setList(d => ({ ...d, items: [...d.items, { id: String(Date.now() + Math.random()), name: t, qty: 1 }] })); };
  const addItem = () => { add(newItem); setNewItem(''); };
  const qty = (it: ListItem, delta: number) => setList(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, qty: Math.max(1, x.qty + delta) } : x) }));
  const remove = (it: ListItem) => setList(d => ({ ...d, items: d.items.filter(x => x.id !== it.id) }));
  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast(t('Voice entry needs a browser with speech recognition')); return; }
    if (listening) return;
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
    setListening(true);
    r.onresult = (e: any) => { const text = e.results[0][0].transcript as string; add(text); toast(t('Heard: “{text}” · added to your list', { text })); };
    r.onerror = () => toast(t('Could not hear that. Try again'));
    r.onend = () => setListening(false);
    r.start();
  };
  const onPhoto = async (f: File | undefined) => { if (!f) return; setUploading(true); try { const url = await uploadFile(f); setList(d => ({ ...d, photoUrl: url })); toast(t('Photo attached · the partner reads your list from it')); } catch (e: any) { toast(e.message); } finally { setUploading(false); } };
  const n = list.items.length;
  const go = () => { setCoKind('list'); nav('/customer/checkout'); };

  return (
    <>
      <Header title={t('Make a list')} onBack={() => nav('/customer')} />
      <Body>
        {run && <div className="card row flat" style={{ background: 'var(--surface-info-light)', borderColor: 'var(--brand-primary-rest)' }}><Icon name="route" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{t('For {name}’s trip to {place}', { name: run.partnerName.split(' ')[0], place: run.destination })}</div><div className="cap">{t('Add what you need. The list rides along for ₹{fee}.', { fee: run.feePerOrder })}</div></div></div>}
        <div className="row" style={{ gap: 8 }}>
          <Input placeholder={t('Add an item, e.g. Tomatoes 1 kg')} value={newItem} onChange={e => setNewItem(e.target.value)} onEnter={addItem} style={{ flex: 1 }} />
          <Button variant="outlined" icon="add" onClick={addItem}>{t('Add')}</Button>
          <button onClick={voice} title={t('Speak your list')} aria-label={t('Speak your list')} style={{ width: 40, height: 40, border: '1px solid var(--surface-border-strong)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: listening ? 'var(--brand-warn-rest)' : 'var(--brand-primary-rest)' }}><Icon name={listening ? 'graphic_eq' : 'mic'} size={22} /></button>
        </div>
        {n === 0 && !list.photoUrl && <div style={{ border: '1px dashed var(--surface-border-strong)', borderRadius: 8, padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, lineHeight: '18px' }}>{t('Your list is empty. Add anything a partner can buy nearby.')}</div>}
        {n > 0 && <div className="col">{list.items.map(it => (
          <div key={it.id} className="card row flat" style={{ padding: '8px 8px 8px 12px', gap: 8 }}>
            <Icon name="shopping_basket" size={20} color="var(--icon)" />
            <div className="grow b ellip">{it.name}</div>
            <div className="row" style={{ gap: 2, border: '1px solid var(--surface-border-strong)', borderRadius: 4 }}>
              <button onClick={() => qty(it, -1)} aria-label={t('Decrease')} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Icon name="remove" size={18} /></button>
              <span className="mono" style={{ minWidth: 20, textAlign: 'center', fontWeight: 600, fontSize: 13 }}>{it.qty}</span>
              <button onClick={() => qty(it, 1)} aria-label={t('Increase')} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Icon name="add" size={18} /></button>
            </div>
            <IconButton icon="delete" label={t('Remove')} onClick={() => remove(it)} />
          </div>))}</div>}
        <div className="col"><div className="b">{t('Quick add')}</div><div className="wrap">{TEMPLATES.map(tp => <Chip key={tp.label} label={t(tp.label)} leftIcon="playlist_add" onClick={() => { tp.items.forEach(add); toast(t('Added {n} items from {label}', { n: tp.items.length, label: t(tp.label) })); }} />)}</div></div>
        <Input label={t('Note for the partner (optional)')} value={list.note} onChange={e => setList(d => ({ ...d, note: e.target.value }))} prefixIcon="sticky_note_2" placeholder={t('e.g. Only Amul butter, ripe bananas')} />
        <div className="card row">
          <Icon name="swap_horiz" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">{t('Allow substitutes')}</div><div className="cap">{t('If something is out of stock, the partner picks the closest match and tells you')}</div></div>
          <Toggle checked={list.subs} onChange={v => setList(d => ({ ...d, subs: v }))} />
        </div>
        <div className="col"><div className="b">{t('Or photograph a handwritten list')}</div>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <div className="drop" style={{ minHeight: 120 }} onClick={() => file.current?.click()}>{list.photoUrl ? <img src={list.photoUrl} alt="" /> : <><Icon name="photo_camera" size={28} /><div style={{ fontSize: 13 }}>{uploading ? t('Uploading…') : t('Drop a photo of your list')}</div></>}</div>
        </div>
        <div className="col"><div className="b">{t('Buy from')}</div><div className="wrap">
          <Chip label={t('Any nearby shop')} selected={list.source === 'any'} onClick={() => setList(d => ({ ...d, source: 'any' }))} />
          {shops.filter(s => s.open).map(s => <Chip key={s.id} label={s.name} selected={list.source === s.id} onClick={() => setList(d => ({ ...d, source: s.id }))} />)}
        </div></div>
        <div className="col"><div className="b">{t('When')}</div>
          <div className="wrap"><Chip label={t('Now')} leftIcon="bolt" selected={list.when === 'now'} onClick={() => setList(d => ({ ...d, when: 'now' }))} /><Chip label={t('Schedule')} leftIcon="schedule" selected={list.when === 'schedule'} onClick={() => setList(d => ({ ...d, when: 'schedule' }))} /></div>
          {list.when === 'schedule' && <div className="wrap">{SLOTS.map(s => <Chip key={s} label={s} selected={list.slot === s} onClick={() => setList(d => ({ ...d, slot: s }))} />)}</div>}
        </div>
        <div className="card row">
          <Icon name="event_repeat" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">{t('Repeat every week')}</div><div className="cap">{list.repeat ? t('Same list, same day each week. Stop any time from Orders.') : t('Turn on for groceries you buy every week')}</div></div>
          <Toggle checked={list.repeat} onChange={v => setList(d => ({ ...d, repeat: v }))} />
        </div>
        <Input label={t('Budget cap (optional)')} placeholder="300" value={list.budget} onChange={e => setList(d => ({ ...d, budget: e.target.value.replace(/\D/g, '') }))} prefixIcon="currency_rupee" type="tel" inputMode="numeric" hint={t('The partner messages you before going over it')} />
        <div className="card row">
          <Icon name={address?.source === 'gps' ? 'my_location' : 'home'} size={22} color="var(--brand-primary-rest)" />
          <div className="grow"><div className="b">{address ? t(address.label) : t('Delivery address')}</div><div className="cap13">{address ? fmtAddress(address) : t('Set where this should go')}</div></div>
          <Button variant="text" color="primary" size="small" onClick={() => setDeliver(true)}>{t('Change')}</Button>
        </div>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth disabled={n === 0} onClick={go}>{n ? `${t('Continue')} · ${t('{n} items', { n })}` : t('Add items to continue')}</Button></div>
      <DeliverToSheet open={deliver} onClose={() => setDeliver(false)} />
    </>
  );
}
