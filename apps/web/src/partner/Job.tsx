import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D_STEPS, stepIndex } from '@getme/core';
import { AlertBanner, Avatar, Body, Button, Checkbox, Chip, Header, Icon, IconButton, Input, Map, SegmentStepper, Stars, StatusChip, Toggle } from '../ui';
import { uploadFile, API_URL, post } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { CallOverlay } from '../lib/phone';
import { SafetySheet } from './Safety';
import { firstName, navigateTo, phaseLabel, usePartner, fmtKm, type PView } from './state';

const P_STEPS = ['To pickup', 'Pickup', 'To receiver', 'Handover'];

export function Job() {
  const { t } = useT(); const nav = useNavigate(); const err = useErrorToast(); const { toast, session, online } = useStore(); const partner = session!.me.partner!;
  const { active: o, activeRun, mine, event, unread, clearActive, sim, setSim, gps, myPos, refreshRuns } = usePartner();
  const [sos, setSos] = useState(false); const [calling, setCalling] = useState(false); const [busy, setBusy] = useState(false);
  const [itemCost, setItemCost] = useState(''); const [costErr, setCostErr] = useState(''); const [receipt, setReceipt] = useState<string | null>(null); const [uploading, setUploading] = useState(false);
  const [otp, setOtp] = useState(''); const [otpErr, setOtpErr] = useState(''); const [cash, setCash] = useState(false); const [pod, setPod] = useState<string | null>(null);
  const [stars, setStars] = useState(5); const [subs, setSubs] = useState<Record<number, string>>({}); const [queued, setQueued] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null); const podFile = useRef<HTMLInputElement>(null);
  useEffect(() => { if (o?.kind === 'shop' && o.itemsTotal != null) setItemCost(String(o.itemsTotal)); else setItemCost(''); setReceipt(null); setPod(null); setOtp(''); setOtpErr(''); setCash(false); setQueued(null); }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const runOrders = activeRun ? activeRun.orderIds.map(id => mine[id]).filter(Boolean) : [];
  const runDone = activeRun && activeRun.status === 'done';
  if (!o) return (
    <>
      <Header title={activeRun ? t('Trip') : t('Active job')} onBack={() => nav('/partner')} />
      <Body>
        {runDone ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', textAlign: 'center' }}><Icon name="check_circle" size={48} color="var(--brand-confirm-rest)" /><div style={{ font: '600 18px/24px var(--font-sans)' }}>{t('Trip complete')}</div><div className="cap13">{t('{n} orders delivered. Earnings are in your balance.', { n: activeRun!.orderIds.length })}</div></div>
          : <AlertBanner type="neutral">{t('No active job. Accept a request from home.')}</AlertBanner>}
        <Button variant="outlined" onClick={() => nav('/partner')}>{t('Back to home')}</Button>
      </Body>
    </>
  );
  const parcel = o.kind === 'parcel';
  const idx = stepIndex(o.status, D_STEPS);
  const origin = o.shopPos ?? o.pickup ?? null;
  const active = ['to_shop', 'shopping', 'to_customer', 'arrived'].includes(o.status);
  const handoff = o.address.handoff ?? 'in_person';
  const run = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try { const r = await event(o.id, body); if (r.queued) { setQueued(t('Saved · will send when online')); toast(t('No network. Saved · will send when you are back online')); } else { setQueued(null); if (ok) toast(ok); } return true; }
    catch (e) { err(e); return false; } finally { setBusy(false); }
  };
  const custName = o.anon ? t('Customer') : o.customerName;
  const custInitials = o.anon ? 'C' : o.customerName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const cost = Number(itemCost) || 0;
  const over = o.budget != null && cost > o.budget;
  const pick = async (f: File, set: (u: string) => void) => { setUploading(true); try { set(await uploadFile(f)); } catch (e) { err(e); } finally { setUploading(false); } };
  const bought = async () => {
    if (!parcel && o.kind === 'list' && !(cost > 0)) { setCostErr(t('Enter what you paid for the items')); return; }
    setCostErr('');
    await run({ type: 'bought', itemCost: parcel || o.kind === 'shop' ? null : cost, receiptUrl: receipt }, parcel ? t('Package picked up') : t('Items bought · start delivery'));
  };
  const complete = async () => {
    if (handoff === 'in_person' && otp.length !== 4) { setOtpErr(t('Enter the 4-digit code')); return; }
    if (handoff !== 'in_person' && !pod) { setOtpErr(handoff === 'gate' ? t('Take a photo of the handover at the gate') : t('Take a photo of the delivery at the door')); return; }
    setBusy(true); setOtpErr('');
    try { const r = await event(o.id, { type: 'complete', otp: handoff === 'in_person' ? otp : '', cashCollected: cash, podPhotoUrl: pod }); if (r.queued) toast(t('No network. Saved · will send when you are back online')); else toast(t('Delivered. Nice work')); } catch (e) { setOtpErr((e as Error).message); } finally { setBusy(false); }
  };
  const checkItem = (i: number, bought: boolean, unavailable = false) => run({ type: 'check_item', index: i, bought, unavailable, substitute: subs[i]?.trim() || null });
  const target = o.status === 'to_shop' ? origin : o.status === 'to_customer' ? o.address : null;
  const etaLabel = target ? `${Math.max(2, Math.round(3 + (distKm(myPos, target) / 18) * 60))} min · ${fmtKm(distKm(myPos, target))}` : null;
  const dropName = parcel ? (o.receiver?.name ?? t('Receiver')) : custName;
  const total = o.bill.known ? o.bill.totalLabel : `₹${o.bill.fees} + items`;
  const cryptoWait = o.pay === 'crypto' && o.crypto?.status !== 'paid';
  const CRYPTO_CHIP: Record<string, { s: 'pending' | 'progress' | 'success' | 'fail' | 'ended'; l: string }> = { pending: { s: 'pending', l: 'Waiting' }, confirming: { s: 'progress', l: 'Confirming' }, paid: { s: 'success', l: 'Paid' }, expired: { s: 'ended', l: 'Expired' }, failed: { s: 'fail', l: 'Failed' } };
  const addr = fmtAddress(o.address) || o.address.line;
  const directions = [o.address.directions, o.address.landmark && t('Landmark: {x}', { x: o.address.landmark })].filter(Boolean).join('. ');
  const speak = () => { try { const u = new SpeechSynthesisUtterance(`${addr}. ${directions}`); window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch { toast(t('This device cannot read aloud')); } };
  const focus = async (id: string) => { if (!activeRun || id === o.id) return; try { await post(`/api/runs/${activeRun.id}/focus`, { orderId: id }); } catch (e) { err(e); } };
  const runPos = activeRun ? activeRun.orderIds.indexOf(o.id) + 1 : 0;
  const shortStatus: Record<string, string> = { scheduled: t('waiting'), to_shop: t('to shop'), shopping: t('shopping'), to_customer: t('delivering'), arrived: t('at door'), delivered: t('done') };

  return (
    <>
      <Header onBack={() => nav('/partner')} right={active ? <button onClick={() => setSos(true)} style={{ height: 32, padding: '0 10px', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', borderRadius: 4, color: '#fff', font: '600 12px/1 var(--font-sans)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="emergency" size={16} />SOS</button> : undefined}>
        <div className="grow"><div className="title">{activeRun ? t('Trip · {n} of {m}', { n: runPos, m: activeRun.orderIds.length }) : t('Job {id}', { id: o.id })}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{activeRun ? `${o.id} · ` : ''}{t(phaseLabel(o))} · {t('earn ₹{n}', { n: o.earn })}</div></div>
      </Header>
      <Body>
        {activeRun && (
          <div className="col" style={{ gap: 6 }}>
            <div className="cap">{activeRun.label} → {activeRun.destination} · {t('one shop visit for all orders, then drop one by one')}</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {runOrders.map((r, i) => <Chip key={r.id} label={`${i + 1} · ${firstName(r)} · ${shortStatus[r.status] ?? r.status}`} selected={r.id === o.id} leftIcon={r.status === 'delivered' ? 'check_circle' : undefined} onClick={() => focus(r.id)} />)}
            </div>
          </div>
        )}
        <SegmentStepper steps={(parcel ? P_STEPS : D_STEPS.map(s => s[0])).map(s => t(s))} index={idx} />
        {queued && <AlertBanner type="caution" icon="cloud_off">{queued}</AlertBanner>}
        {!online && !queued && <AlertBanner type="caution" icon="cloud_off">{t('Offline. Steps you take are saved and sent when the network is back.')}</AlertBanner>}
        {active && <div style={{ flexShrink: 0 }}><Map a={origin} aIcon={parcel ? 'inventory_2' : 'storefront'} b={o.address} bIcon={parcel ? 'person_pin_circle' : 'home'} me={myPos} meHeading={partner.heading} meVehicle={partner.vehicle} route={target ? [myPos, target] : origin ? [origin, o.address] : null} eta={etaLabel ? `${etaLabel}${o.traffic ? ` · ${t('Traffic: {level}', { level: t(o.traffic) })}` : ''}` : null} traffic={o.traffic} follow /></div>}
        {active && gps !== 'ok' && gps !== 'unknown' && <div className="between cap"><span>{gps === 'denied' ? t('Location blocked') : t('No GPS')} · {sim ? t('moving along the route automatically') : t('position frozen')}</span><Toggle checked={sim} onChange={setSim} label={t('Simulate movement')} /></div>}

        {o.status === 'to_shop' && (
          <div className="card">
            <div className="row"><Icon name={parcel ? 'inventory_2' : 'storefront'} size={24} color="var(--gm-chrome)" /><div className="grow"><div className="b">{parcel ? t('Pickup · {x}', { x: o.pickup?.label ?? t('customer') }) : o.shopId ? o.shopName : activeRun ? activeRun.destination : t('Any nearby shop · your choice')}</div><div className="cap">{parcel ? o.pickup?.line : o.shopPos ? t('{d} away', { d: fmtKm(distKm(myPos, o.shopPos)) }) : t('Pick the closest shop with the items')}{o.kind === 'shop' && o.shopStatus ? ` · ${t('shop')}: ${t(SHOP_LABEL[o.shopStatus] ?? o.shopStatus)}` : ''}</div></div></div>
            {o.kind === 'list' && <div className="cap13">{t('{n} items to buy', { n: o.items.length })}{o.budget ? ` · ${t('budget ₹{n}', { n: o.budget })}` : ''}{o.subs ? ` · ${t('substitutes allowed')}` : ` · ${t('no substitutes')}`}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outlined" color="primary" icon="navigation" style={{ flex: 1 }} onClick={() => navigateTo(origin ?? activeRun?.destinationPos ?? o.address)}>{t('Navigate')}</Button>
              <Button color="primary" icon="check" style={{ flex: 1 }} loading={busy} onClick={() => run({ type: 'reached' }, parcel ? t('At the pickup point') : t('At the shop'))}>{parcel ? t('Reached pickup') : t('Reached shop')}</Button>
            </div>
            {!activeRun && <Button variant="text" color="warn" size="small" onClick={async () => { if (confirm(t('Drop this job? It goes back to other partners.')) && await run({ type: 'unassign', reason: 'Partner could not continue' })) { clearActive(); nav('/partner'); } }}>{t("Can't continue · drop this job")}</Button>}
          </div>
        )}

        {o.status === 'shopping' && !parcel && (
          <>
            <div className="card">
              <div className="b">{o.kind === 'shop' ? t('Order from the shop') : activeRun ? t('Shopping list · {name}', { name: firstName(o) }) : t('Shopping list')}</div>
              {o.kind === 'shop' && <AlertBanner type={o.shopStatus === 'ready' || o.shopStatus === 'handed' ? 'success' : 'info'}>{t(SHOP_BANNER[o.shopStatus ?? 'new'])}</AlertBanner>}
              {o.items.map((it, i) => (
                <div key={i} className="col" style={{ gap: 4 }}>
                  <div className="between">
                    <Checkbox checked={!!it.bought} onChange={v => checkItem(i, v)} label={`${it.name} × ${it.qty}${it.unit ? ` (${it.unit})` : ''}${it.price != null ? ` · ₹${it.price * it.qty}` : ''}`} caption={it.unavailable ? t('Not available') : it.substitute ? t('Swapped for {x}', { x: it.substitute }) : undefined} />
                    {o.kind === 'list' && !it.bought && <Button size="small" variant={it.unavailable ? 'filled' : 'text'} color={it.unavailable ? 'warn' : 'default'} onClick={() => checkItem(i, false, !it.unavailable)}>{it.unavailable ? t('Unavailable') : t('Not found')}</Button>}
                  </div>
                  {o.kind === 'list' && o.subs && !it.bought && it.unavailable && <Input placeholder={t('Substitute (e.g. cherry tomatoes)')} value={subs[i] ?? ''} onChange={e => setSubs(s => ({ ...s, [i]: e.target.value }))} onEnter={() => checkItem(i, true)} suffix={<Button size="small" variant="text" color="primary" onClick={() => checkItem(i, true)}>{t('Bought')}</Button>} />}
                </div>
              ))}
              <div className="cap">{o.budget ? t('Budget cap ₹{n}', { n: o.budget }) : t('No budget cap')} · {o.subs ? t('substitutes allowed') : t('no substitutes')} · {t('message the customer before swapping items.')}</div>
            </div>
            <div className="card">
              {o.kind === 'list' ? <Input label={t('What you paid for the items (₹)')} value={itemCost} onChange={e => { setItemCost(e.target.value.replace(/\D/g, '')); setCostErr(''); }} prefixIcon="currency_rupee" type="tel" inputMode="numeric" error={costErr} hint={t("Added to the customer's bill")} mono /> : <div className="between"><span>{t('Items total (catalogue price)')}</span><span className="price">₹{o.itemsTotal ?? 0}</span></div>}
              {over && <AlertBanner type="caution">{t("Over the customer's ₹{n} budget cap. Message them before continuing.", { n: o.budget ?? 0 })}</AlertBanner>}
              <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f, setReceipt); e.target.value = ''; }} />
              {receipt && <img src={API_URL + receipt} alt="" style={{ maxHeight: 140, borderRadius: 4, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid var(--surface-border)' }} />}
              <Button variant="outlined" icon={receipt ? 'check' : 'photo_camera'} fullWidth loading={uploading} onClick={() => file.current?.click()}>{receipt ? t('Receipt attached · retake') : o.kind === 'shop' ? t('Attach the shop bill (optional)') : t('Attach receipt photo')}</Button>
              <Button color="primary" size="tall" fullWidth iconRight="arrow_forward" loading={busy} onClick={bought}>{o.kind === 'shop' ? t('Collected · start delivery') : t('Items bought · start delivery')}</Button>
            </div>
          </>
        )}
        {o.status === 'shopping' && parcel && (
          <div className="card">
            <div className="row"><Icon name="inventory_2" size={24} color="var(--gm-chrome)" /><div className="grow"><div className="b">{t('Collect the package')}</div><div className="cap">{o.pkType} · {o.pkSize}{o.note ? ` · ${o.note}` : ''}{o.fee.insure ? ` · ${t('protected')}` : ''}</div></div></div>
            <div className="cap13">{t('Check it is sealed and matches the description. Photo it before you leave.')}</div>
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f, setReceipt); e.target.value = ''; }} />
            {receipt && <img src={API_URL + receipt} alt="" style={{ maxHeight: 140, borderRadius: 4, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid var(--surface-border)' }} />}
            <Button variant="outlined" icon={receipt ? 'check' : 'photo_camera'} fullWidth loading={uploading} onClick={() => file.current?.click()}>{receipt ? t('Photo taken · retake') : t('Take a photo of the package')}</Button>
            <Button color="primary" size="tall" fullWidth iconRight="arrow_forward" loading={busy} onClick={bought}>{t('Picked up · start delivery')}</Button>
          </div>
        )}

        {o.status === 'to_customer' && (
          <div className="card">
            <div className="row" style={{ alignItems: 'flex-start' }}><Icon name={parcel ? 'person_pin_circle' : 'home'} size={24} color="var(--brand-fox-red)" /><div className="grow"><div className="b">{dropName}</div><div style={{ fontSize: 13, lineHeight: '18px' }}>{addr}</div>{o.address.area && <div className="cap">{o.address.area}</div>}{parcel && o.receiver?.phone ? <div className="cap">{t('call via GetMe')}</div> : null}</div></div>
            {o.address.gatePhotoUrl && <div className="row" style={{ gap: 10 }}><img className="thumb" src={API_URL + o.address.gatePhotoUrl} alt="" style={{ width: 64, height: 64 }} /><div className="cap13">{t('Photo of the gate / door so you recognise it.')}</div></div>}
            {directions && <AlertBanner type="info" icon="signpost" action={<Button size="small" variant="text" icon="volume_up" onClick={speak}>{t('Read aloud')}</Button>}>{directions}</AlertBanner>}
            {handoff !== 'in_person' && <AlertBanner type="neutral" icon={handoff === 'gate' ? 'door_sliding' : 'door_front'}>{handoff === 'gate' ? t('Leave at the gate / security. Take a photo of the handover.') : t('Leave at the door. Take a photo once it is placed.')}</AlertBanner>}
            {o.pay === 'cod' && <AlertBanner type="caution" icon="payments">{t('Collect {total} in cash at the door.', { total })}</AlertBanner>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outlined" color="primary" icon="navigation" style={{ flex: 1 }} onClick={() => navigateTo(o.address)}>{t('Navigate')}</Button>
              <Button color="primary" icon="where_to_vote" style={{ flex: 1 }} loading={busy} onClick={() => run({ type: 'arrived' }, t('Marked as arrived'))}>{t('Arrived')}</Button>
            </div>
          </div>
        )}

        {o.status === 'arrived' && (
          <div className="card">
            <div className="b">{t('Handover')}</div>
            {handoff === 'in_person' ? (
              <>
                <div className="cap13">{t('Collect the 4-digit code from the {who}. Bill total {total}.', { who: parcel ? t('receiver') : t('customer'), total })}</div>
                <Input label={t('Handover code')} value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 4)); setOtpErr(''); }} prefixIcon="password" type="tel" inputMode="numeric" error={otpErr} mono onEnter={complete} />
              </>
            ) : (
              <>
                <div className="cap13">{handoff === 'gate' ? t('The customer asked you to leave it with security at the gate. Take a photo of the handover as proof.') : t('The customer asked you to leave it at the door. Take a photo of the delivery as proof.')} {t('Bill total {total}.', { total })}</div>
                {addr && <div className="row" style={{ gap: 8, fontSize: 13 }}><Icon name="home" size={18} color="var(--icon)" /><span>{addr}</span></div>}
                <input ref={podFile} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { pick(f, setPod); setOtpErr(''); } e.target.value = ''; }} />
                {pod && <img src={API_URL + pod} alt="" style={{ maxHeight: 160, borderRadius: 4, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid var(--surface-border)' }} />}
                <Button variant={pod ? 'outlined' : 'filled'} color={pod ? 'default' : 'primary'} icon={pod ? 'check' : 'photo_camera'} fullWidth loading={uploading} onClick={() => podFile.current?.click()}>{pod ? t('Photo taken · retake') : handoff === 'gate' ? t('Take a photo of the handover at the gate') : t('Take a photo of the delivery at the door')}</Button>
                {otpErr && <div style={{ fontSize: 12, color: 'var(--brand-warn-rest)' }}>{otpErr}</div>}
              </>
            )}
            {o.pay === 'cod' && <Checkbox checked={cash} onChange={setCash} label={t('Collected {total} in cash', { total })} />}
            {cryptoWait && <div className="card flat" style={{ background: 'var(--surface-info-light)', gap: 6 }}><div className="between"><div className="row" style={{ gap: 8 }}><Icon name="currency_bitcoin" size={22} color="var(--brand-primary-rest)" /><div className="b">{t("Waiting for the customer's crypto payment")}</div></div><StatusChip status={(CRYPTO_CHIP[o.crypto?.status ?? 'pending'] ?? CRYPTO_CHIP.pending).s} label={t((CRYPTO_CHIP[o.crypto?.status ?? 'pending'] ?? CRYPTO_CHIP.pending).l)} /></div><div className="cap13">{o.crypto ? `${o.crypto.amountCrypto} ${o.crypto.currency} · ${o.crypto.network}` : t('Invoice not created yet')} · {t('Complete delivery unlocks once it is confirmed. You are paid in rupees as usual.')}</div></div>}
            <Button color="primary" size="tall" fullWidth icon="task_alt" loading={busy} disabled={cryptoWait} onClick={complete}>{cryptoWait ? t('Waiting for payment…') : t('Complete delivery')}</Button>
          </div>
        )}

        {o.status === 'delivered' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0', textAlign: 'center' }}>
              <Icon name="check_circle" size={48} color="var(--brand-confirm-rest)" />
              <div style={{ font: '600 18px/24px var(--font-sans)' }}>{t('Delivered · you earned ₹{n}', { n: o.earn })}</div>
              <div className="cap13">{o.tip ? t('Includes a ₹{n} tip.', { n: o.tip }) : t('Tips show up once the customer rates you.')}{o.pay === 'cod' ? codNote(o, t) : ''}</div>
              {o.pay === 'crypto' && o.crypto && <div className="cap13"><Icon name="currency_bitcoin" size={14} /> {t('Paid in {currency}', { currency: o.crypto.currency })} · {t('settled to you in rupees')}</div>}
              {o.podPhotoUrl && <img src={API_URL + o.podPhotoUrl} alt="" style={{ maxHeight: 100, borderRadius: 4, border: '1px solid var(--surface-border)' }} />}
            </div>
            <div className="card flat">
              <div className="b">{t('Rate the customer')}</div>
              <Stars value={stars} onChange={setStars} />
              <Button color="primary" size="tall" fullWidth loading={busy} onClick={async () => { if (o.customerRating == null) await run({ type: 'rate_customer', stars }, t('Thanks. Rating saved')); clearActive(); if (activeRun && runOrders.some(r => r.id !== o.id && r.status !== 'delivered')) { await refreshRuns(); } else nav('/partner'); }}>{activeRun && runOrders.some(r => r.id !== o.id && r.status !== 'delivered') ? t('Submit · next order') : t('Submit and go home')}</Button>
            </div>
          </>
        )}

        {active && (
          <div className="card row" style={{ padding: 12 }}>
            <Avatar initials={custInitials} size="lg" />
            <div className="grow"><div className="b">{custName}</div><div className="cap">{o.pay === 'cod' ? t('Cash on delivery') : o.pay === 'crypto' ? t('Paid in crypto (app)') : t('Paid in app')} · {o.kind === 'parcel' ? t('package sender') : t('{n} items', { n: o.items.length })}{o.anon ? ` · ${t('anonymous')}` : ''}</div></div>
            <IconButton icon="chat" label={t('Chat')} color="primary" badge={unread} onClick={() => nav('/partner/job/chat')} />
            <IconButton icon="call" label={t('Call')} color="primary" onClick={() => setCalling(true)} />
          </div>
        )}
        {parcel && active && o.receiver && <div className="card row" style={{ padding: 12 }}><Icon name="person_pin_circle" size={24} color="var(--icon)" /><div className="grow"><div className="b">{t('Receiver')} · {o.receiver.name}</div><div className="cap">{t('Has the handover code · number masked')}</div></div><IconButton icon="call" label={t('Call receiver')} color="primary" onClick={() => setCalling(true)} /></div>}
      </Body>
      <SafetySheet open={sos} onClose={() => setSos(false)} onCall={() => setCalling(true)} />
      {calling && <CallOverlay name={calling && session ? custName : ''} onEnd={() => setCalling(false)} />}
    </>
  );
}
function codNote(o: PView, t: (s: string, v?: Record<string, string | number>) => string) { const due = o.bill.total - o.fee.delivery - o.fee.extra - (o.kind === 'list' ? (o.itemCost ?? 0) : 0); return due > 0 ? ' ' + t('₹{n} of the cash is due to GetMe.', { n: due }) : due < 0 ? ' ' + t('GetMe owes you ₹{n} on top of the cash.', { n: -due }) : ''; }
const SHOP_LABEL: Record<string, string> = { new: 'not started', preparing: 'preparing', ready: 'ready for pickup', handed: 'handed over', done: 'done' };
const SHOP_BANNER: Record<string, string> = { new: 'The shop has not started packing yet. Check in at the counter.', preparing: 'The shop is packing this order.', ready: 'Ready for pickup at the counter.', handed: 'The shop marked this handed to you.', done: 'Done.' };
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) { const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
export type { PView };
