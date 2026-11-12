// Address editor: drop-a-pin map, place search, landmark / apartment fields,
// directions (typed or spoken), door photo and handoff choice.
import { useEffect, useRef, useState } from 'react';
import { HANDOFFS, type Address } from '@getme/core';
import { uploadFile } from '../lib/api';
import { currentLocationAddress, searchPlaces, type GeoHit } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Button, Chip, Icon, Input, MapPicker, Sheet, Toggle } from '../ui';

const LABELS = ['Home', 'Work', 'Other'];

export function AddressEditor({ open, onClose, initial, onSave, title, saveLabel, showHandoff = true }: { open: boolean; onClose: () => void; initial?: Partial<Address> | null; onSave: (a: Address) => Promise<void> | void; title?: string; saveLabel?: string; showHandoff?: boolean }) {
  const { t } = useT(); const { toast } = useStore();
  const [a, setA] = useState<Partial<Address>>({ label: 'Home', handoff: 'in_person', ...(initial ?? {}) });
  const [apt, setApt] = useState(!!(initial?.building || initial?.flat || initial?.tower));
  const [q, setQ] = useState(''); const [hits, setHits] = useState<GeoHit[]>([]);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [listening, setListening] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setA({ label: 'Home', handoff: 'in_person', ...(initial ?? {}) }); setApt(!!(initial?.building || initial?.flat || initial?.tower)); setQ(''); setHits([]); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!q.trim()) { setHits([]); return; } const h = setTimeout(() => searchPlaces(q, a.lat != null ? { lat: a.lat!, lng: a.lng! } : null).then(setHits).catch(() => setHits([])), 300); return () => clearTimeout(h); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<Address>) => setA(x => ({ ...x, ...p }));
  const pick = (h: GeoHit) => { set({ lat: h.lat, lng: h.lng, line: a.line || h.line, area: h.area, source: 'typed' }); setQ(''); setHits([]); };
  const onPin = (pos: { lat: number; lng: number }, hit: GeoHit | null, accuracyM?: number) => set({ lat: pos.lat, lng: pos.lng, ...(hit ? { area: hit.area, line: a.line?.trim() ? a.line : hit.line } : {}), source: accuracyM != null ? 'gps' : 'pin', accuracyM });
  const mine = async () => { setBusy(true); const r = await currentLocationAddress(); setBusy(false); if ('error' in r) { toast(r.error === 'denied' ? t('Location is blocked for this site. Allow it in the browser settings, or drop the pin by hand.') : t('No GPS on this device. Drop the pin by hand.')); return; } set({ lat: r.address.lat, lng: r.address.lng, line: a.line?.trim() ? a.line : r.address.line, area: r.address.area, source: 'gps', accuracyM: r.address.accuracyM }); };
  const photo = async (f: File | undefined) => { if (!f) return; setUploading(true); try { set({ gatePhotoUrl: await uploadFile(f) }); } catch (e: any) { toast(e.message); } finally { setUploading(false); } };
  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast(t('Voice entry needs a browser with speech recognition')); return; }
    if (listening) return; const r = new SR(); r.lang = 'en-IN'; setListening(true);
    r.onresult = (e: any) => set({ directions: ((a.directions ?? '') + ' ' + e.results[0][0].transcript).trim() }); r.onend = () => setListening(false); r.onerror = () => toast(t('Could not hear that. Try again')); r.start();
  };
  const save = async () => {
    if (!(a.line || '').trim() && !(a.landmark || '').trim()) { toast(t('Describe the place: a street, a landmark, anything the partner can find')); return; }
    if (a.lat == null || a.lng == null) { toast(t('Drop the pin on the map first')); return; }
    setBusy(true);
    try { await onSave({ ...a, label: a.label || 'Other', line: (a.line || a.landmark || '').trim(), lat: a.lat, lng: a.lng, handoff: a.handoff ?? 'in_person', ...(apt ? {} : { building: undefined, tower: undefined, floor: undefined, flat: undefined }) } as Address); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('Address')}>
      <div className="col" style={{ gap: 4 }}>
        <Input placeholder={t('Search a place, area or landmark')} prefixIcon="search" value={q} onChange={e => setQ(e.target.value)} />
        {hits.length > 0 && <div className="list">{hits.map((h, i) => <div key={i} className="item clickable" style={{ padding: '8px 12px' }} onClick={() => pick(h)}><Icon name="place" size={18} color="var(--icon)" /><div className="grow"><div style={{ fontSize: 13, fontWeight: 600 }}>{h.line}</div><div className="cap">{h.area}</div></div></div>)}</div>}
      </div>
      <div style={{ flexShrink: 0 }}><MapPicker value={a.lat != null ? { lat: a.lat, lng: a.lng! } : null} onChange={onPin} height={220} /></div>
      <div className="row" style={{ gap: 8 }}><div className="cap grow">{a.source === 'gps' ? t('From your GPS') + (a.accuracyM ? ` · ±${a.accuracyM} m` : '') : a.lat != null ? t('Pin dropped. Drag the map to adjust.') : t('Move the map so the pin sits on your door or gate.')}</div><Button variant="text" color="primary" size="small" icon="my_location" onClick={mine} loading={busy}>{t('Use my location')}</Button></div>
      <div className="wrap">{LABELS.map(l => <Chip key={l} label={t(l)} selected={a.label === l} onClick={() => set({ label: l })} />)}</div>
      <Input label={t('Address or place')} placeholder={t('Street, house, or how people call this place')} value={a.line ?? ''} onChange={e => set({ line: e.target.value })} prefixIcon="location_on" />
      <Input label={t('Landmark')} placeholder={t('e.g. opposite the temple, blue gate after the bus stop')} value={a.landmark ?? ''} onChange={e => set({ landmark: e.target.value })} prefixIcon="flag" hint={t('In villages and hill areas the landmark is the address')} />
      <div className="between"><div className="row" style={{ gap: 8 }}><Icon name="apartment" size={20} color="var(--icon)" /><span className="b">{t('This is an apartment or gated community')}</span></div><Toggle checked={apt} onChange={setApt} /></div>
      {apt && <div className="col">
        <Input label={t('Building or society')} placeholder={t('e.g. Sunrise Residency')} value={a.building ?? ''} onChange={e => set({ building: e.target.value })} />
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Input label={t('Tower')} placeholder="B" value={a.tower ?? ''} onChange={e => set({ tower: e.target.value })} style={{ flex: 1 }} /><Input label={t('Floor')} placeholder="3" value={a.floor ?? ''} onChange={e => set({ floor: e.target.value })} style={{ flex: 1 }} /><Input label={t('Flat')} placeholder="B-304" value={a.flat ?? ''} onChange={e => set({ flat: e.target.value })} style={{ flex: 1 }} /></div>
      </div>}
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 8 }}><span className="b grow" style={{ fontSize: 14 }}>{t('Directions for the partner')}</span><button onClick={voice} aria-label={t('Speak directions')} style={{ width: 32, height: 32, border: '1px solid var(--surface-border-strong)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: listening ? 'var(--brand-warn-rest)' : 'var(--brand-primary-rest)' }}><Icon name={listening ? 'graphic_eq' : 'mic'} size={18} /></button></div>
        <textarea className="ta" placeholder={t('e.g. Take the left after the school, third house with a red roof')} value={a.directions ?? ''} onChange={e => set({ directions: e.target.value })} />
      </div>
      <div className="col" style={{ gap: 4 }}><div className="b" style={{ fontSize: 14 }}>{t('Photo of the door or gate (optional)')}</div>
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => photo(e.target.files?.[0])} />
        <div className="drop" style={{ minHeight: 96, padding: 10 }} onClick={() => file.current?.click()}>{a.gatePhotoUrl ? <img src={a.gatePhotoUrl} alt="" style={{ maxHeight: 120 }} /> : <><Icon name="photo_camera" size={24} /><div style={{ fontSize: 13 }}>{uploading ? t('Uploading…') : t('Helps the partner find you first time')}</div></>}</div>
      </div>
      {showHandoff && <div className="col"><div className="b" style={{ fontSize: 14 }}>{t('How should the partner hand it over?')}</div>
        {HANDOFFS.map(h => { const sel = (a.handoff ?? 'in_person') === h.id; return <div key={h.id} className={'option' + (sel ? ' selected' : '')} role="radio" aria-checked={sel} onClick={() => set({ handoff: h.id })}>
          <span style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0, borderRadius: 999, border: `2px solid ${sel ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: sel ? 'var(--brand-primary-rest)' : 'transparent' }} /></span>
          <div className="grow"><div style={{ fontSize: 15, lineHeight: '22px', fontWeight: sel ? 600 : 400 }}>{t(h.label)}</div><div className="cap">{t(h.caption)}</div></div></div>; })}
      </div>}
      <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{saveLabel ?? t('Save address')}</Button>
    </Sheet>
  );
}
