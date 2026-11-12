import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PK_SIZES, PK_TYPES, fmt } from '@getme/core';
import { uploadFile } from '../lib/api';
import { useStore } from '../lib/store';
import { Body, Button, Chip, Header, Icon, Input, Toggle } from '../ui';
import { useCustomer } from './state';

export function PackageScreen() {
  const nav = useNavigate();
  const { session, toast } = useStore();
  const { pkg, setPkg, setCoKind } = useCustomer();
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const home = session?.me.addresses?.[0];
  const price = PK_SIZES[pkg.size]?.price ?? 49;
  const invalid = !pkg.drop.trim() || !pkg.name.trim();
  const onPhoto = async (f: File | undefined) => { if (!f) return; setUploading(true); try { setPkg(d => ({ ...d, photoUrl: null })); const url = await uploadFile(f); setPkg(d => ({ ...d, photoUrl: url })); } catch (e: any) { toast(e.message); } finally { setUploading(false); } };
  return (
    <>
      <Header title="Send a package" onBack={() => nav('/customer')} />
      <Body>
        <div className="cap13">A partner picks it up from you and hands it to the receiver. Both of you get live tracking and a handover code.</div>
        <div className="card row">
          <Icon name="my_location" size={22} color="var(--gm-chrome)" />
          <div className="grow"><div className="b">Pickup · {home?.label ?? 'Home'}</div><div className="cap13">{home?.line ?? 'Add an address in Profile'}</div></div>
          <Button variant="text" color="primary" size="small" onClick={() => nav('/customer/profile')}>Change</Button>
        </div>
        <Input label="Drop address" value={pkg.drop} onChange={e => setPkg(d => ({ ...d, drop: e.target.value }))} prefixIcon="person_pin_circle" placeholder="Area, landmark, flat number" />
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Input label="Receiver name" value={pkg.name} onChange={e => setPkg(d => ({ ...d, name: e.target.value }))} placeholder="Who receives it" style={{ flex: 1 }} />
          <Input label="Receiver phone" value={pkg.phone} onChange={e => setPkg(d => ({ ...d, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} type="tel" inputMode="numeric" placeholder="10-digit number" style={{ flex: 1 }} />
        </div>
        <div className="col"><div className="b">What is it?</div><div className="wrap">{PK_TYPES.map(t => <Chip key={t} label={t} selected={pkg.type === t} onClick={() => setPkg(d => ({ ...d, type: t }))} />)}</div></div>
        <div className="col"><div className="b">Size</div>
          {Object.entries(PK_SIZES).map(([label, s]) => { const sel = pkg.size === label; return (
            <div key={label} className={'option' + (sel ? ' selected' : '')} onClick={() => setPkg(d => ({ ...d, size: label }))} role="radio" aria-checked={sel}>
              <span style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0, borderRadius: 999, border: `2px solid ${sel ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: sel ? 'var(--brand-primary-rest)' : 'transparent' }} /></span>
              <div className="grow"><div style={{ fontSize: 15, lineHeight: '22px', fontWeight: sel ? 600 : 400 }}>{label} · {fmt(s.price)}</div><div className="cap">{s.caption}</div></div>
            </div>); })}
        </div>
        <div className="col"><div className="b">Photo of the package (optional)</div>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <div className="drop" style={{ minHeight: 140 }} onClick={() => file.current?.click()}>{pkg.photoUrl ? <img src={pkg.photoUrl} alt="Package" /> : <><Icon name="photo_camera" size={28} /><div style={{ fontSize: 13 }}>{uploading ? 'Uploading…' : 'Drop a photo of the package'}</div></>}</div>
        </div>
        <div className="card row">
          <Icon name="verified_user" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">Protect this package · ₹9</div><div className="cap">Covered up to ₹2,000 for loss or damage</div></div>
          <Toggle checked={pkg.insure} onChange={v => setPkg(d => ({ ...d, insure: v }))} />
        </div>
        <Input label="Instructions for the partner (optional)" value={pkg.note} onChange={e => setPkg(d => ({ ...d, note: e.target.value }))} placeholder="e.g. Call the receiver on arrival" />
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth disabled={invalid} onClick={() => { setCoKind('parcel'); nav('/customer/checkout'); }}>Continue · {fmt(price)}</Button></div>
    </>
  );
}
