import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PK_SIZES, PK_TYPES, fmt } from '@getme/core';
import { uploadFile } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Body, Button, Chip, Header, Icon, Input, Toggle } from '../ui';
import { AddressEditor } from './AddressEditor';
import { DeliverToSheet } from './DeliverTo';
import { useCustomer } from './state';

export function PackageScreen() {
  const nav = useNavigate(); const { t } = useT();
  const { toast } = useStore();
  const { pkg, setPkg, setCoKind, address } = useCustomer();
  const [uploading, setUploading] = useState(false);
  const [drop, setDrop] = useState(false);
  const [pickup, setPickup] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const price = PK_SIZES[pkg.size]?.price ?? 49;
  const invalid = !pkg.drop || !pkg.name.trim();
  const onPhoto = async (f: File | undefined) => { if (!f) return; setUploading(true); try { setPkg(d => ({ ...d, photoUrl: null })); const url = await uploadFile(f); setPkg(d => ({ ...d, photoUrl: url })); } catch (e: any) { toast(e.message); } finally { setUploading(false); } };
  return (
    <>
      <Header title={t('Send a package')} onBack={() => nav('/customer')} />
      <Body>
        <div className="cap13">{t('A partner picks it up from you and hands it to the receiver. Both of you get live tracking and a handover code.')}</div>
        <div className="card row">
          <Icon name={address?.source === 'gps' ? 'my_location' : 'trip_origin'} size={22} color="var(--gm-chrome)" />
          <div className="grow"><div className="b">{t('Pickup')} · {address ? t(address.label) : t('Set a pickup')}</div><div className="cap13">{address ? fmtAddress(address) : t('Use your GPS location or a saved address')}</div></div>
          <Button variant="text" color="primary" size="small" onClick={() => setPickup(true)}>{t('Change')}</Button>
        </div>
        <div className="card row clickable" onClick={() => setDrop(true)} style={{ borderColor: pkg.drop ? undefined : 'var(--brand-primary-rest)' }}>
          <Icon name="person_pin_circle" size={22} color="var(--brand-danger)" />
          <div className="grow"><div className="b">{t('Drop')} · {pkg.drop ? (pkg.drop.label === 'Pinned' ? t('Pinned on the map') : t(pkg.drop.label)) : t('Where does it go?')}</div><div className="cap13">{pkg.drop ? fmtAddress(pkg.drop) : t('Drop a pin, add a landmark and how to hand it over')}</div></div>
          <Icon name={pkg.drop ? 'edit' : 'add_location_alt'} size={22} color="var(--brand-primary-rest)" />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Input label={t('Receiver name')} value={pkg.name} onChange={e => setPkg(d => ({ ...d, name: e.target.value }))} placeholder={t('Who receives it')} style={{ flex: 1 }} />
          <Input label={t('Receiver phone')} value={pkg.phone} onChange={e => setPkg(d => ({ ...d, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} type="tel" inputMode="numeric" placeholder={t('10-digit number')} style={{ flex: 1 }} />
        </div>
        <div className="col"><div className="b">{t('What is it?')}</div><div className="wrap">{PK_TYPES.map(v => <Chip key={v} label={t(v)} selected={pkg.type === v} onClick={() => setPkg(d => ({ ...d, type: v }))} />)}</div></div>
        <div className="col"><div className="b">{t('Size')}</div>
          {Object.entries(PK_SIZES).map(([label, s]) => { const sel = pkg.size === label; return (
            <div key={label} className={'option' + (sel ? ' selected' : '')} onClick={() => setPkg(d => ({ ...d, size: label }))} role="radio" aria-checked={sel}>
              <span style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0, borderRadius: 999, border: `2px solid ${sel ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: sel ? 'var(--brand-primary-rest)' : 'transparent' }} /></span>
              <div className="grow"><div style={{ fontSize: 15, lineHeight: '22px', fontWeight: sel ? 600 : 400 }}>{t(label)} · {fmt(s.price)}</div><div className="cap">{t(s.caption)}</div></div>
            </div>); })}
        </div>
        <div className="col"><div className="b">{t('Photo of the package (optional)')}</div>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <div className="drop" style={{ minHeight: 140 }} onClick={() => file.current?.click()}>{pkg.photoUrl ? <img src={pkg.photoUrl} alt="" /> : <><Icon name="photo_camera" size={28} /><div style={{ fontSize: 13 }}>{uploading ? t('Uploading…') : t('Drop a photo of the package')}</div></>}</div>
        </div>
        <div className="card row">
          <Icon name="verified_user" size={22} color="var(--icon)" />
          <div className="grow"><div className="b">{t('Protect this package · ₹9')}</div><div className="cap">{t('Covered up to ₹2,000 for loss or damage')}</div></div>
          <Toggle checked={pkg.insure} onChange={v => setPkg(d => ({ ...d, insure: v }))} />
        </div>
        <Input label={t('Instructions for the partner (optional)')} value={pkg.note} onChange={e => setPkg(d => ({ ...d, note: e.target.value }))} placeholder={t('e.g. Call the receiver on arrival')} />
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth disabled={invalid} onClick={() => { setCoKind('parcel'); nav('/customer/checkout'); }}>{t('Continue')} · {fmt(price)}</Button></div>
      <AddressEditor open={drop} onClose={() => setDrop(false)} initial={pkg.drop ?? { label: 'Pinned', line: '' }} title={t('Drop address')} saveLabel={t('Use this drop')} onSave={a => { setPkg(d => ({ ...d, drop: a })); setDrop(false); }} />
      <DeliverToSheet open={pickup} onClose={() => setPickup(false)} />
    </>
  );
}
