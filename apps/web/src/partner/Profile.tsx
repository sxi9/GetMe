import { AppearanceRow } from '../lib/theme';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Vehicle } from '@getme/core';
import { PARTNER_TIERS } from '@getme/core';
import { Body, Button, Chip, Header, Avatar, Icon, Input, Row, Sheet, StatusChip, Money, Toggle, Radio } from '../ui';
import { patch, post, uploadFile, API_URL } from '../lib/api';
import { disablePush, enablePush, pushPermission } from '../lib/push';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { usePartner } from './state';

const VEHICLES: Vehicle[] = ['Bike', 'Scooter', 'Cycle'];
type DocKind = 'id' | 'licence' | 'rc' | 'selfie';
const DOC_LABEL: Record<DocKind, [string, string]> = { id: ['ID proof', 'Aadhaar or voter ID'], licence: ['Driving licence', 'Front side'], rc: ['Vehicle RC', 'Registration certificate'], selfie: ['Selfie', 'Clear face photo'] };
const NEEDED: Record<'runner' | 'pro', DocKind[]> = { runner: ['id', 'selfie'], pro: ['id', 'licence', 'rc', 'selfie'] };

export function Profile() {
  const { t } = useT(); const nav = useNavigate();
  const { session, setMe, signOut, toast, refreshMe } = useStore(); const err = useErrorToast();
  const p = session!.me.partner!; const u = session!.me.user; const community = session!.me.community; const { earnings } = usePartner();
  const [sheet, setSheet] = useState<'vehicle' | 'docs' | 'area' | 'payouts' | 'community' | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(p.vehicle); const [plate, setPlate] = useState(p.plate); const [area, setArea] = useState(p.area);
  const [tier, setTier] = useState<'runner' | 'pro'>(p.tier); const [docKind, setDocKind] = useState<DocKind | null>(null); const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(''); const [push, setPush] = useState(u.pushEnabled && pushPermission() === 'granted');
  const file = useRef<HTMLInputElement>(null); const photo = useRef<HTMLInputElement>(null);
  useEffect(() => { setTier(p.tier); }, [p.tier]);
  const save = async (body: Record<string, unknown>, ok: string, close = true) => { setBusy(true); try { setMe({ partner: await patch('/api/partner', body) }); toast(ok); if (close) setSheet(null); } catch (e) { err(e); } finally { setBusy(false); } };
  const since = new Date(u.createdAt).getFullYear();
  const needed = NEEDED[tier];
  const have = (k: DocKind) => p.documents.some(d => d.kind === k);
  const missing = needed.filter(k => !have(k));
  const verif = p.verification === 'verified' ? { s: 'success' as const, l: t('Verified') } : p.verification === 'pending' ? { s: 'progress' as const, l: t('Under review') } : p.verification === 'rejected' ? { s: 'fail' as const, l: t('Not approved') } : { s: 'caution' as const, l: t('Not started') };
  const uploadDoc = async (f: File) => { if (!docKind) return; setBusy(true); try { const url = await uploadFile(f); setMe({ partner: await patch('/api/partner', { documents: [{ kind: docKind, url }], tier }) }); toast(t('{x} uploaded', { x: t(DOC_LABEL[docKind][0]) })); } catch (e) { err(e); } finally { setBusy(false); setDocKind(null); } };
  const setPhoto = async (f: File) => { setBusy(true); try { const url = await uploadFile(f); const me = await patch('/api/me', { photoUrl: url }); setMe(me); toast(t('Photo updated')); } catch (e) { err(e); } finally { setBusy(false); } };
  const togglePush = async (on: boolean) => {
    if (on) { const perm = await enablePush(); if (perm === 'granted') { setPush(true); await patch('/api/me', { pushEnabled: true }).then(setMe).catch(() => {}); toast(t('Push notifications on')); } else toast(perm === 'unsupported' ? t('This browser does not support push') : t('Notifications are blocked in the browser settings')); }
    else { await disablePush(); setPush(false); await patch('/api/me', { pushEnabled: false }).then(setMe).catch(() => {}); }
  };
  const join = async () => { setBusy(true); try { await post('/api/communities/join', { code: code.trim() }); await refreshMe(); toast(t('Joined')); setSheet(null); } catch (e) { err(e); } finally { setBusy(false); } };
  return (
    <>
      <Header>
        <input ref={photo} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ''; }} />
        <div style={{ position: 'relative' }}><Avatar initials={p.initials} src={p.photoUrl ? API_URL + p.photoUrl : null} size={48} onClick={() => photo.current?.click()} /><span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, background: 'var(--gm-accent)', color: 'var(--gm-chrome)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="photo_camera" size={12} /></span></div>
        <div className="grow"><div className="title">{p.name}</div><div style={{ fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,.75)' }}>{p.rating} {t('rating')} · {p.trips.toLocaleString('en-IN')} {t('trips')} · {t('since {y}', { y: since })}</div></div>
      </Header>
      <Body>
        <div className="card" style={{ gap: 8 }}>
          <div className="between"><div className="b">{t('Verification')}</div><StatusChip status={verif.s} label={verif.l} /></div>
          <div className="cap13">{p.verification === 'verified' ? t('You can go online and announce trips.') : p.verification === 'pending' ? t('GetMe ops is checking your documents. Usually under a day.') : p.verification === 'rejected' ? (p.verificationNote || t('Upload clearer documents and try again.')) : t('Pick how you want to work and upload your documents.')}</div>
          {p.verification !== 'verified' && <Button color="primary" fullWidth icon="verified_user" onClick={() => setSheet('docs')}>{p.verification === 'rejected' ? t('Upload again') : missing.length ? t('Upload documents') : t('View documents')}</Button>}
        </div>
        <div className="list">
          <Row icon={p.tier === 'runner' ? 'groups' : 'two_wheeler'} label={t(PARTNER_TIERS.find(x => x.id === p.tier)?.label ?? 'Partner')} caption={t('Purchase limit ₹{n} per list order', { n: p.floatLimit })} onClick={() => setSheet('docs')} />
          <Row icon="two_wheeler" label={t('Vehicle')} caption={`${t(p.vehicle)}${p.plate ? ` · ${p.plate}` : ` · ${t('add your plate')}`}`} onClick={() => setSheet('vehicle')} />
          <Row icon="verified_user" label={t('Documents')} caption={p.documents.length ? t('{n} uploaded', { n: p.documents.length }) : t('None uploaded yet')} right={<StatusChip status={verif.s} label={verif.l} />} onClick={() => setSheet('docs')} />
          <Row icon="map" label={t('Service area')} caption={p.area} onClick={() => setSheet('area')} />
          <Row icon="apartment" label={t('Community')} caption={community ? community.name : t('Join your society or village board')} onClick={() => community ? nav('/partner/community') : setSheet('community')} />
          <Row icon="add_road" label={t('My trips')} caption={t('Announce a trip and take orders along')} onClick={() => nav('/partner/runs')} />
          <Row icon="account_balance" label={t('Payouts')} caption={`${t('Daily to SBI •••• 8821')} · ${t('balance')} ${(earnings?.balance ?? 0) < 0 ? '−' : ''}₹${Math.abs(earnings?.balance ?? 0)}`} onClick={() => setSheet('payouts')} />
          <div className="item"><Icon name="notifications_active" size={22} color="var(--icon)" /><div className="grow"><div style={{ fontWeight: 600 }}>{t('Push notifications')}</div><div className="cap">{t('Requests and trip updates even when the app is closed')}</div></div><Toggle checked={push} onChange={togglePush} /></div>
          <AppearanceRow />
          <Row icon="call" label={t('Mobile')} caption={u.phone ? `+91 ${u.phone}` : u.email ?? ''} chevron={false} />
        </div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>{t('Log out')}</Button>
        <div className="cap" style={{ textAlign: 'center' }}>GetMe Partner · {t('support')} 1800 000 1234</div>
      </Body>
      <Sheet open={sheet === 'vehicle'} onClose={() => setSheet(null)} title={t('Vehicle')}>
        <div className="wrap">{VEHICLES.map(v => <Chip key={v} label={t(v)} selected={vehicle === v} onClick={() => setVehicle(v)} leftIcon={v === 'Cycle' ? 'pedal_bike' : 'two_wheeler'} />)}</div>
        <Input label={t('Registration plate')} value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="KA 05 MJ 4521" disabled={vehicle === 'Cycle'} mono />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={() => save({ vehicle, plate: vehicle === 'Cycle' ? '' : plate.trim() }, t('Vehicle updated'))}>{t('Save')}</Button>
      </Sheet>
      <Sheet open={sheet === 'docs'} onClose={() => setSheet(null)} title={t('How do you want to work?')}>
        <div className="col" style={{ gap: 8 }}>
          {PARTNER_TIERS.map(x => <div key={x.id} className={'option' + (tier === x.id ? ' selected' : '')} onClick={() => setTier(x.id)}><Radio checked={tier === x.id} onChange={() => setTier(x.id)} label={t(x.label)} caption={t(x.caption)} /></div>)}
        </div>
        <div className="b">{t('Documents')}</div>
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }} />
        <div className="list">
          {needed.map(k => { const d = p.documents.filter(x => x.kind === k).slice(-1)[0]; return (
            <div key={k} className="item">
              {d ? <img className="thumb" src={API_URL + d.url} alt="" /> : <div className="tile"><Icon name={k === 'selfie' ? 'face' : 'description'} size={20} /></div>}
              <div className="grow"><div style={{ fontWeight: 600 }}>{t(DOC_LABEL[k][0])}</div><div className="cap">{d ? t('Uploaded {when}', { when: new Date(d.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }) : t(DOC_LABEL[k][1])}</div></div>
              <Button size="small" variant={d ? 'text' : 'outlined'} color="primary" icon="photo_camera" loading={busy && docKind === k} onClick={() => { setDocKind(k); file.current?.click(); }}>{d ? t('Retake') : t('Upload')}</Button>
            </div>); })}
        </div>
        {p.verification === 'rejected' && p.verificationNote && <div style={{ fontSize: 13, color: 'var(--brand-warn-rest)' }}>{p.verificationNote}</div>}
        <div className="cap">{missing.length ? t('{n} more to upload. Review starts automatically once all are in.', { n: missing.length }) : p.verification === 'verified' ? t('All set.') : t('All documents in. GetMe ops will review them shortly.')}</div>
        {tier !== p.tier && <Button color="primary" size="tall" fullWidth loading={busy} onClick={() => save({ tier }, t('Saved'), false)}>{t('Switch to {x}', { x: t(PARTNER_TIERS.find(x => x.id === tier)!.label) })}</Button>}
      </Sheet>
      <Sheet open={sheet === 'area'} onClose={() => setSheet(null)} title={t('Service area')}>
        <Input label={t('Area')} value={area} onChange={e => setArea(e.target.value)} prefixIcon="map" hint={t('Requests are matched by your live position; the area is shown to customers')} />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={() => save({ area: area.trim() || p.area }, t('Service area updated'))}>{t('Save')}</Button>
      </Sheet>
      <Sheet open={sheet === 'community'} onClose={() => setSheet(null)} title={t('Join your community')}>
        <div className="cap13">{t('An apartment society or a village board. See trips going out, post notices and take neighbours\' orders.')}</div>
        <Input label={t('Join code')} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SUNRISE" prefixIcon="key" mono onEnter={join} />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={join}>{t('Join')}</Button>
      </Sheet>
      <Sheet open={sheet === 'payouts'} onClose={() => setSheet(null)} title={t('Payouts')}>
        <div className="between"><span>{t('GetMe balance')}</span><Money v={earnings?.balance ?? 0} /></div>
        <div className="cap">{t('Positive balances are paid to SBI •••• 8821 every evening. Negative balances are cash you collected on COD orders that is due to GetMe.')}</div>
        <div className="list">{(earnings?.ledger ?? []).slice(0, 15).map(l => <div key={l.id} className="item"><div className="grow"><div style={{ fontSize: 13 }}>{l.note}</div><div className="cap">{new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div></div><span className="mono" style={{ fontWeight: 600, color: l.amount < 0 ? 'var(--brand-warn-rest)' : 'var(--brand-confirm-rest)' }}>{l.amount < 0 ? '−' : '+'}₹{Math.abs(l.amount)}</span></div>)}{!earnings?.ledger?.length && <div className="item cap">{t('No transactions yet.')}</div>}</div>
      </Sheet>
    </>
  );
}
