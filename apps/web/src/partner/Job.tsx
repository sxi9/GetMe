import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D_STEPS, stepIndex } from '@getme/core';
import { AlertBanner, Avatar, Body, Button, Checkbox, Header, Icon, IconButton, Input, Map, SegmentStepper, Stars, Toggle } from '../ui';
import { uploadFile, API_URL } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { CallOverlay } from '../lib/phone';
import { SafetySheet } from './Safety';
import { navigateTo, phaseLabel, usePartner, fmtKm, type PView } from './state';

const P_STEPS = ['To pickup', 'Pickup', 'To receiver', 'Handover'];

export function Job() {
  const nav = useNavigate(); const err = useErrorToast(); const { toast, session } = useStore();
  const { active: o, event, unread, clearActive, sim, setSim, gps, myPos } = usePartner();
  const [sos, setSos] = useState(false); const [calling, setCalling] = useState(false); const [busy, setBusy] = useState(false);
  const [itemCost, setItemCost] = useState(''); const [costErr, setCostErr] = useState(''); const [receipt, setReceipt] = useState<string | null>(null); const [uploading, setUploading] = useState(false);
  const [otp, setOtp] = useState(''); const [otpErr, setOtpErr] = useState(''); const [cash, setCash] = useState(false);
  const [stars, setStars] = useState(5); const [subs, setSubs] = useState<Record<number, string>>({});
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (o?.kind === 'shop' && o.itemsTotal != null) setItemCost(String(o.itemsTotal)); }, [o?.id, o?.kind, o?.itemsTotal]);

  if (!o) return <><Header title="Active job" onBack={() => nav('/partner')} /><Body><AlertBanner type="neutral">No active job. Accept a request from home.</AlertBanner><Button variant="outlined" onClick={() => nav('/partner')}>Back to home</Button></Body></>;
  const parcel = o.kind === 'parcel';
  const idx = stepIndex(o.status, D_STEPS);
  const origin = o.shopPos ?? o.pickup ?? null;
  const active = ['to_shop', 'shopping', 'to_customer', 'arrived'].includes(o.status);
  const run = async (body: Record<string, unknown>, ok?: string) => { setBusy(true); try { await event(o.id, body); if (ok) toast(ok); return true; } catch (e) { err(e); return false; } finally { setBusy(false); } };
  const custName = o.anon ? 'Customer' : o.customerName;
  const custInitials = o.anon ? 'C' : o.customerName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const cost = Number(itemCost) || 0;
  const over = o.budget != null && cost > o.budget;
  const pick = async (f: File) => { setUploading(true); try { setReceipt(await uploadFile(f)); } catch (e) { err(e); } finally { setUploading(false); } };
  const bought = async () => {
    if (!parcel && o.kind === 'list' && !(cost > 0)) { setCostErr('Enter what you paid for the items'); return; }
    setCostErr('');
    await run({ type: 'bought', itemCost: parcel || o.kind === 'shop' ? null : cost, receiptUrl: receipt }, parcel ? 'Package picked up' : 'Items bought · start delivery');
  };
  const complete = async () => {
    if (otp.length !== 4) { setOtpErr('Enter the 4-digit code'); return; }
    setBusy(true); setOtpErr('');
    try { await event(o.id, { type: 'complete', otp, cashCollected: cash }); toast('Delivered. Nice work'); } catch (e) { setOtpErr((e as Error).message); } finally { setBusy(false); }
  };
  const checkItem = (i: number, bought: boolean, unavailable = false) => run({ type: 'check_item', index: i, bought, unavailable, substitute: subs[i]?.trim() || null });
  const target = o.status === 'to_shop' ? origin : o.status === 'to_customer' ? o.address : null;
  const etaLabel = target ? `${Math.max(2, Math.round(3 + (distKm(myPos, target) / 18) * 60))} min · ${fmtKm(distKm(myPos, target))}` : null;
  const dropName = parcel ? (o.receiver?.name ?? 'Receiver') : custName;
  const total = o.bill.known ? o.bill.totalLabel : `₹${o.bill.fees} + items`;

  return (
    <>
      <Header onBack={() => nav('/partner')} right={active ? <button onClick={() => setSos(true)} style={{ height: 32, padding: '0 10px', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', borderRadius: 4, color: '#fff', font: '600 12px/1 var(--font-sans)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="emergency" size={16} />SOS</button> : undefined}>
        <div className="grow"><div className="title">Job {o.id}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{phaseLabel(o)} · earn ₹{o.earn}</div></div>
      </Header>
      <Body>
        <SegmentStepper steps={parcel ? P_STEPS : D_STEPS.map(s => s[0])} index={idx} />
        {active && <Map a={origin} aIcon={parcel ? 'inventory_2' : 'storefront'} b={o.address} bIcon={parcel ? 'person_pin_circle' : 'home'} me={myPos} route={target ? [myPos, target] : origin ? [origin, o.address] : null} eta={etaLabel} />}
        {active && gps === 'unavailable' && <div className="between cap"><span>No GPS · {sim ? 'moving along the route automatically' : 'position frozen'}</span><Toggle checked={sim} onChange={setSim} label="Simulate movement" /></div>}

        {o.status === 'to_shop' && (
          <div className="card">
            <div className="row"><Icon name={parcel ? 'inventory_2' : 'storefront'} size={24} color="var(--gm-chrome)" /><div className="grow"><div className="b">{parcel ? `Pickup · ${o.pickup?.label ?? 'customer'}` : o.shopId ? o.shopName : 'Any nearby shop · your choice'}</div><div className="cap">{parcel ? o.pickup?.line : o.shopPos ? `${fmtKm(distKm(myPos, o.shopPos))} away` : 'Pick the closest shop with the items'}{o.kind === 'shop' && o.shopStatus ? ` · shop: ${SHOP_LABEL[o.shopStatus] ?? o.shopStatus}` : ''}</div></div></div>
            {o.kind === 'list' && <div className="cap13">{o.items.length} item{o.items.length > 1 ? 's' : ''} to buy{o.budget ? ` · budget ₹${o.budget}` : ''}{o.subs ? ' · substitutes allowed' : ' · no substitutes'}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outlined" color="primary" icon="navigation" style={{ flex: 1 }} onClick={() => navigateTo(origin ?? o.address)}>Navigate</Button>
              <Button color="primary" icon="check" style={{ flex: 1 }} loading={busy} onClick={() => run({ type: 'reached' }, parcel ? 'At the pickup point' : 'At the shop')}>{parcel ? 'Reached pickup' : 'Reached shop'}</Button>
            </div>
            <Button variant="text" color="warn" size="small" onClick={async () => { if (confirm('Drop this job? It goes back to other partners.') && await run({ type: 'unassign', reason: 'Partner could not continue' })) { clearActive(); nav('/partner'); } }}>Can't continue · drop this job</Button>
          </div>
        )}

        {o.status === 'shopping' && !parcel && (
          <>
            <div className="card">
              <div className="b">{o.kind === 'shop' ? 'Order from the shop' : 'Shopping list'}</div>
              {o.kind === 'shop' && <AlertBanner type={o.shopStatus === 'ready' || o.shopStatus === 'handed' ? 'success' : 'info'}>{SHOP_BANNER[o.shopStatus ?? 'new']}</AlertBanner>}
              {o.items.map((it, i) => (
                <div key={i} className="col" style={{ gap: 4 }}>
                  <div className="between">
                    <Checkbox checked={!!it.bought} onChange={v => checkItem(i, v)} label={`${it.name} × ${it.qty}${it.unit ? ` (${it.unit})` : ''}${it.price != null ? ` · ₹${it.price * it.qty}` : ''}`} caption={it.unavailable ? 'Not available' : it.substitute ? `Swapped for ${it.substitute}` : undefined} />
                    {o.kind === 'list' && !it.bought && <Button size="small" variant={it.unavailable ? 'filled' : 'text'} color={it.unavailable ? 'warn' : 'default'} onClick={() => checkItem(i, false, !it.unavailable)}>{it.unavailable ? 'Unavailable' : 'Not found'}</Button>}
                  </div>
                  {o.kind === 'list' && o.subs && !it.bought && it.unavailable && <Input placeholder="Substitute (e.g. cherry tomatoes)" value={subs[i] ?? ''} onChange={e => setSubs(s => ({ ...s, [i]: e.target.value }))} onEnter={() => checkItem(i, true)} suffix={<Button size="small" variant="text" color="primary" onClick={() => checkItem(i, true)}>Bought</Button>} />}
                </div>
              ))}
              <div className="cap">{o.budget ? `Budget cap ₹${o.budget}` : 'No budget cap'} · {o.subs ? 'substitutes allowed' : 'no substitutes'} · message the customer before swapping items.</div>
            </div>
            <div className="card">
              {o.kind === 'list' ? <Input label="What you paid for the items (₹)" value={itemCost} onChange={e => { setItemCost(e.target.value.replace(/\D/g, '')); setCostErr(''); }} prefixIcon="currency_rupee" type="tel" inputMode="numeric" error={costErr} hint="Added to the customer's bill" mono /> : <div className="between"><span>Items total (catalogue price)</span><span className="price">₹{o.itemsTotal ?? 0}</span></div>}
              {over && <AlertBanner type="caution">Over the customer's ₹{o.budget} budget cap. Message them before continuing.</AlertBanner>}
              <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
              {receipt && <img src={API_URL + receipt} alt="Receipt" style={{ maxHeight: 140, borderRadius: 4, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid var(--surface-border)' }} />}
              <Button variant="outlined" icon={receipt ? 'check' : 'photo_camera'} fullWidth loading={uploading} onClick={() => file.current?.click()}>{receipt ? 'Receipt attached · retake' : o.kind === 'shop' ? 'Attach the shop bill (optional)' : 'Attach receipt photo'}</Button>
              <Button color="primary" size="tall" fullWidth iconRight="arrow_forward" loading={busy} onClick={bought}>{o.kind === 'shop' ? 'Collected · start delivery' : 'Items bought · start delivery'}</Button>
            </div>
          </>
        )}
        {o.status === 'shopping' && parcel && (
          <div className="card">
            <div className="row"><Icon name="inventory_2" size={24} color="var(--gm-chrome)" /><div className="grow"><div className="b">Collect the package</div><div className="cap">{o.pkType} · {o.pkSize}{o.note ? ` · ${o.note}` : ''}{o.fee.insure ? ' · protected' : ''}</div></div></div>
            <div className="cap13">Check it is sealed and matches the description. Photo it before you leave.</div>
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
            {receipt && <img src={API_URL + receipt} alt="Package" style={{ maxHeight: 140, borderRadius: 4, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid var(--surface-border)' }} />}
            <Button variant="outlined" icon={receipt ? 'check' : 'photo_camera'} fullWidth loading={uploading} onClick={() => file.current?.click()}>{receipt ? 'Photo taken · retake' : 'Take a photo of the package'}</Button>
            <Button color="primary" size="tall" fullWidth iconRight="arrow_forward" loading={busy} onClick={bought}>Picked up · start delivery</Button>
          </div>
        )}

        {o.status === 'to_customer' && (
          <div className="card">
            <div className="row"><Icon name={parcel ? 'person_pin_circle' : 'home'} size={24} color="var(--brand-fox-red)" /><div className="grow"><div className="b">{dropName}</div><div className="cap">{o.address.line}{parcel && o.receiver?.phone ? ' · call via GetMe' : ''}</div></div></div>
            {o.pay === 'cod' && <AlertBanner type="caution" icon="payments">Collect {total} in cash at the door.</AlertBanner>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outlined" color="primary" icon="navigation" style={{ flex: 1 }} onClick={() => navigateTo(o.address)}>Navigate</Button>
              <Button color="primary" icon="where_to_vote" style={{ flex: 1 }} loading={busy} onClick={() => run({ type: 'arrived' }, 'Marked as arrived')}>Arrived</Button>
            </div>
          </div>
        )}

        {o.status === 'arrived' && (
          <div className="card">
            <div className="b">Handover</div>
            <div className="cap13">Collect the 4-digit code from the {parcel ? 'receiver' : 'customer'}. Bill total {total}.</div>
            <Input label="Handover code" value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 4)); setOtpErr(''); }} prefixIcon="password" type="tel" inputMode="numeric" error={otpErr} mono onEnter={complete} />
            {o.pay === 'cod' && <Checkbox checked={cash} onChange={setCash} label={`Collected ${total} in cash`} />}
            <Button color="primary" size="tall" fullWidth icon="task_alt" loading={busy} onClick={complete}>Complete delivery</Button>
          </div>
        )}

        {o.status === 'delivered' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', textAlign: 'center' }}>
              <Icon name="check_circle" size={48} color="var(--brand-confirm-rest)" />
              <div style={{ font: '600 18px/24px var(--font-sans)' }}>Delivered · you earned ₹{o.earn}</div>
              <div className="cap13">{o.tip ? `Includes a ₹${o.tip} tip.` : 'Tips show up once the customer rates you.'}{o.pay === 'cod' ? ` ₹${o.bill.total - o.fee.delivery - o.fee.extra} of the cash is due to GetMe.` : ''}</div>
            </div>
            <div className="card flat">
              <div className="b">Rate the customer</div>
              <Stars value={stars} onChange={setStars} />
              <Button color="primary" size="tall" fullWidth loading={busy} onClick={async () => { if (o.customerRating == null) await run({ type: 'rate_customer', stars }, 'Thanks. Rating saved'); clearActive(); nav('/partner'); }}>Submit and go home</Button>
            </div>
          </>
        )}

        {active && (
          <div className="card row" style={{ padding: 12 }}>
            <Avatar initials={custInitials} size="lg" />
            <div className="grow"><div className="b">{custName}</div><div className="cap">{o.pay === 'cod' ? 'Cash on delivery' : 'Paid in app'} · {o.kind === 'parcel' ? 'package sender' : `${o.items.length} item${o.items.length > 1 ? 's' : ''}`}{o.anon ? ' · anonymous' : ''}</div></div>
            <IconButton icon="chat" label="Chat" color="primary" badge={unread} onClick={() => nav('/partner/job/chat')} />
            <IconButton icon="call" label="Call" color="primary" onClick={() => setCalling(true)} />
          </div>
        )}
        {parcel && active && o.receiver && <div className="card row" style={{ padding: 12 }}><Icon name="person_pin_circle" size={24} color="var(--icon)" /><div className="grow"><div className="b">Receiver · {o.receiver.name}</div><div className="cap">Has the handover code · number masked</div></div><IconButton icon="call" label="Call receiver" color="primary" onClick={() => setCalling(true)} /></div>}
      </Body>
      <SafetySheet open={sos} onClose={() => setSos(false)} onCall={() => setCalling(true)} />
      {calling && <CallOverlay name={calling && session ? custName : ''} onEnd={() => setCalling(false)} />}
    </>
  );
}
const SHOP_LABEL: Record<string, string> = { new: 'not started', preparing: 'preparing', ready: 'ready for pickup', handed: 'handed over', done: 'done' };
const SHOP_BANNER: Record<string, string> = { new: 'The shop has not started packing yet. Check in at the counter.', preparing: 'The shop is packing this order.', ready: 'Ready for pickup at the counter.', handed: 'The shop marked this handed to you.', done: 'Done.' };
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) { const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
export type { PView };
