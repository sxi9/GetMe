import { useRef, useState } from 'react';
import type { Vehicle } from '@getme/core';
import { Body, Button, Chip, Header, Avatar, Icon, Input, Row, Sheet, StatusChip, Money } from '../ui';
import { patch, uploadFile } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { usePartner } from './state';

const VEHICLES: Vehicle[] = ['Bike', 'Scooter', 'Cycle'];

export function Profile() {
  const { session, setMe, signOut, toast } = useStore(); const err = useErrorToast();
  const p = session!.me.partner!; const { earnings } = usePartner();
  const [sheet, setSheet] = useState<'vehicle' | 'docs' | 'area' | 'payouts' | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle>(p.vehicle); const [plate, setPlate] = useState(p.plate); const [area, setArea] = useState(p.area);
  const [docs, setDocs] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = async (body: Record<string, unknown>, ok: string) => { setBusy(true); try { setMe({ partner: await patch('/api/partner', body) }); toast(ok); setSheet(null); } catch (e) { err(e); } finally { setBusy(false); } };
  const since = new Date(session!.me.user.createdAt).getFullYear();
  return (
    <>
      <Header><Avatar initials={p.initials} size={48} /><div className="grow"><div className="title">{p.name}</div><div style={{ fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,.75)' }}>{p.rating} rating · {p.trips.toLocaleString('en-IN')} trips · partner since {since}</div></div></Header>
      <Body>
        <div className="list">
          <Row icon="two_wheeler" label="Vehicle" caption={`${p.vehicle}${p.plate ? ` · ${p.plate}` : ' · add your plate'}`} onClick={() => setSheet('vehicle')} />
          <Row icon="verified_user" label="Documents" caption="Aadhaar, licence and insurance" right={<StatusChip status={p.verified ? 'success' : 'caution'} label={p.verified ? 'Verified' : 'Pending'} />} onClick={p.verified ? undefined : () => setSheet('docs')} chevron={!p.verified} />
          <Row icon="map" label="Service area" caption={p.area} onClick={() => setSheet('area')} />
          <Row icon="account_balance" label="Payouts" caption={`Daily to SBI •••• 8821 · balance ₹${earnings?.balance ?? 0}`} onClick={() => setSheet('payouts')} />
          <Row icon="currency_rupee" label="Purchase limit" caption={`Up to ₹${p.floatLimit} per list order · call support to raise`} chevron={false} />
          <Row icon="call" label="Mobile" caption={session!.me.user.phone ? `+91 ${session!.me.user.phone}` : session!.me.user.email ?? ''} chevron={false} />
        </div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>Log out</Button>
        <div className="cap" style={{ textAlign: 'center' }}>GetMe Partner · support 1800 000 1234</div>
      </Body>
      <Sheet open={sheet === 'vehicle'} onClose={() => setSheet(null)} title="Vehicle">
        <div className="wrap">{VEHICLES.map(v => <Chip key={v} label={v} selected={vehicle === v} onClick={() => setVehicle(v)} leftIcon={v === 'Cycle' ? 'pedal_bike' : 'two_wheeler'} />)}</div>
        <Input label="Registration plate" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="KA 05 MJ 4521" disabled={vehicle === 'Cycle'} mono />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={() => save({ vehicle, plate: vehicle === 'Cycle' ? '' : plate.trim() }, 'Vehicle updated')}>Save</Button>
      </Sheet>
      <Sheet open={sheet === 'docs'} onClose={() => setSheet(null)} title="Documents">
        <div className="cap13">Upload clear photos of your Aadhaar, driving licence and vehicle RC. Verification takes under a day; in this build it is instant.</div>
        <input ref={file} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) { setBusy(true); try { setDocs(d => [...d, f.name]); await uploadFile(f); } catch (x) { err(x); } finally { setBusy(false); } } e.target.value = ''; }} />
        {docs.map(d => <div key={d} className="row" style={{ gap: 8 }}><Icon name="check_circle" size={18} color="var(--brand-confirm-rest)" /><span className="ellip">{d}</span></div>)}
        <Button variant="outlined" icon="photo_camera" fullWidth loading={busy} onClick={() => file.current?.click()}>Add a document photo</Button>
        <Button color="primary" size="tall" fullWidth disabled={!docs.length || busy} onClick={() => save({ documents: true }, 'Documents verified. You can go online')}>Submit for verification</Button>
      </Sheet>
      <Sheet open={sheet === 'area'} onClose={() => setSheet(null)} title="Service area">
        <Input label="Area" value={area} onChange={e => setArea(e.target.value)} prefixIcon="map" hint="Requests are matched by your live position; the area is shown to customers" />
        <Button color="primary" size="tall" fullWidth loading={busy} onClick={() => save({ area: area.trim() || p.area }, 'Service area updated')}>Save</Button>
      </Sheet>
      <Sheet open={sheet === 'payouts'} onClose={() => setSheet(null)} title="Payouts">
        <div className="between"><span>GetMe balance</span><Money v={earnings?.balance ?? 0} /></div>
        <div className="cap">Positive balances are paid to SBI •••• 8821 every evening. Negative balances are cash you collected on COD orders that is due to GetMe.</div>
        <div className="list">{(earnings?.ledger ?? []).slice(0, 15).map(l => <div key={l.id} className="item"><div className="grow"><div style={{ fontSize: 13 }}>{l.note}</div><div className="cap">{new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div></div><span className="mono" style={{ fontWeight: 600, color: l.amount < 0 ? 'var(--brand-warn-rest)' : 'var(--brand-confirm-rest)' }}>{l.amount < 0 ? '−' : '+'}₹{Math.abs(l.amount)}</span></div>)}{!earnings?.ledger?.length && <div className="item cap">No transactions yet.</div>}</div>
      </Sheet>
    </>
  );
}
