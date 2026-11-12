import { useState } from 'react';
import { LANGS, TOPUPS, PROMOS, fmt, initials } from '@getme/core';
import { api, del, patch } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { Avatar, Body, Button, Chip, Icon, IconButton, Input, Row, Sheet, Toggle } from '../ui';
import { CustomerTabs } from './Tabs';

export function Profile() {
  const { session, signOut, setMe, toast } = useStore(); const errToast = useErrorToast();
  const me = session!.me; const u = me.user;
  const [sheet, setSheet] = useState<null | 'topup' | 'addresses' | 'pay' | 'promo' | 'help' | 'terms'>(null);
  const [topup, setTopup] = useState(500);
  const [label, setLabel] = useState('Other'); const [line, setLine] = useState(''); const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const addrs = me.addresses ?? [];
  const doTopup = async () => { setBusy(true); try { const r = await api('/api/wallet/topup', { method: 'POST', body: { amount: topup } }); setMe({ wallet: r.balance }); toast(`${fmt(topup)} added to your wallet`); setSheet(null); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const addAddr = async () => { if (!line.trim()) { toast('Enter the address'); return; } try { setMe({ addresses: await api('/api/addresses', { method: 'POST', body: { label, line, area } }) }); setLine(''); setArea(''); toast('Address saved'); } catch (e) { errToast(e); } };
  const rmAddr = async (id: string) => { try { setMe({ addresses: await del(`/api/addresses/${id}`) }); } catch (e) { errToast(e); } };
  const setPush = async (v: boolean) => { try { const r = await patch('/api/me', { pushEnabled: v }); setMe(r); } catch (e) { errToast(e); } };
  const setLang = async (lang: string) => { try { const r = await patch('/api/me', { lang }); setMe(r); toast(lang === 'en' ? 'Language set to English' : lang === 'kn' ? 'ಭಾಷೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ' : 'भाषा हिन्दी में बदल दी गई'); } catch (e) { errToast(e); } };
  const shareRef = async () => { const text = `Get ₹50 off your first GetMe order with my code ${u.referralCode}`; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Referral code copied'); } } catch { /* cancelled */ } };
  return (
    <>
      <div className="chrome" style={{ paddingBottom: 20 }}>
        <Avatar initials={initials(u.name)} size={48} />
        <div className="grow"><div className="title">{u.name}</div><div style={{ fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,.75)' }}>{u.phone ? '+91 ' + u.phone : ''}{u.phone && u.email ? ' · ' : ''}{u.email ?? ''}</div></div>
      </div>
      <Body>
        <div className="row" style={{ background: 'var(--gm-chrome)', color: '#fff', borderRadius: 8, padding: 16 }}>
          <div className="grow"><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: .4 }}>GetMe wallet</div><div className="mono" style={{ font: '600 24px/32px var(--font-mono)' }}>{fmt(me.wallet ?? 0)}</div></div>
          <button onClick={() => setSheet('topup')} style={{ height: 36, padding: '0 14px', border: 'none', borderRadius: 4, background: '#fff', color: 'var(--gm-chrome)', font: '600 13px/1 var(--font-sans)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="add" size={18} />Add money</button>
        </div>
        <div className="card row flat"><Icon name="card_giftcard" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">Invite friends, get ₹50 each</div><div className="cap">Code <span className="mono b">{u.referralCode}</span> · they get ₹50 off their first order</div></div><Button variant="outlined" color="primary" size="small" icon="share" onClick={shareRef}>Share</Button></div>
        <div className="list">
          <Row icon="home" label="Saved addresses" caption={addrs.map(a => a.label).join(' · ') || 'Add your first address'} onClick={() => setSheet('addresses')} />
          <Row icon="account_balance_wallet" label="Payment methods" caption={`UPI · Card •••• 4421 · Wallet ${fmt(me.wallet ?? 0)}`} onClick={() => setSheet('pay')} />
          <Row icon="sell" label="Promo codes" caption={PROMOS.map(p => p.code).join(', ') + ' available'} onClick={() => setSheet('promo')} />
          <div className="item"><Icon name="notifications" size={22} color="var(--icon)" /><div className="grow"><div className="b">Push notifications</div><div className="cap">Order updates, offers and messages</div></div><Toggle checked={u.pushEnabled} onChange={setPush} /></div>
          <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}><div className="row"><Icon name="translate" size={22} color="var(--icon)" /><div className="grow b">Language</div></div><div className="wrap" style={{ paddingLeft: 34 }}>{LANGS.map(l => <Chip key={l.id} label={l.label} selected={u.lang === l.id} onClick={() => setLang(l.id)} />)}</div></div>
        </div>
        <div className="list"><Row icon="help" label="Help and support" onClick={() => setSheet('help')} /><Row icon="description" label="Terms and privacy" onClick={() => setSheet('terms')} /></div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>Log out</Button>
        <div className="cap" style={{ textAlign: 'center' }}>GetMe · Bengaluru · v0.1</div>
      </Body>
      <CustomerTabs />
      <Sheet open={sheet === 'topup'} onClose={() => setSheet(null)} title="Add money to wallet">
        <div className="cap13">Instant via UPI. Wallet pays automatically on delivery.</div>
        <div className="wrap">{TOPUPS.map(t => <Chip key={t} label={fmt(t)} selected={topup === t} onClick={() => setTopup(t)} />)}</div>
        <Button color="primary" size="tall" fullWidth onClick={doTopup} loading={busy}>Add {fmt(topup)} via UPI</Button>
      </Sheet>
      <Sheet open={sheet === 'addresses'} onClose={() => setSheet(null)} title="Saved addresses">
        <div className="list">{addrs.map((a, i) => <div key={a.id} className="item"><Icon name={a.label === 'Home' ? 'home' : a.label === 'Work' ? 'work' : 'location_on'} size={22} color="var(--icon)" /><div className="grow"><div className="b">{a.label}{i === 0 ? ' · default' : ''}</div><div className="cap">{a.line}{a.area ? ' · ' + a.area : ''}</div></div>{addrs.length > 1 && <IconButton icon="delete" label="Remove" onClick={() => rmAddr(a.id)} />}</div>)}</div>
        <div className="b" style={{ marginTop: 4 }}>Add an address</div>
        <div className="wrap">{['Home', 'Work', 'Other'].map(l => <Chip key={l} label={l} selected={label === l} onClick={() => setLabel(l)} />)}</div>
        <Input placeholder="Flat, street, landmark" value={line} onChange={e => setLine(e.target.value)} prefixIcon="location_on" />
        <Input placeholder="Area (e.g. Koramangala 4th Block)" value={area} onChange={e => setArea(e.target.value)} onEnter={addAddr} />
        <Button color="primary" fullWidth onClick={addAddr}>Save address</Button>
      </Sheet>
      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)} title="Payment methods">
        <div className="list">
          <div className="item"><Icon name="payments" size={22} color="var(--icon)" /><div className="grow"><div className="b">UPI</div><div className="cap">Pay with any UPI app on delivery</div></div><Icon name="check_circle" size={20} color="var(--brand-confirm-rest)" /></div>
          <div className="item"><Icon name="credit_card" size={22} color="var(--icon)" /><div className="grow"><div className="b">Card •••• 4421</div><div className="cap">HDFC · charged automatically on delivery</div></div></div>
          <div className="item"><Icon name="account_balance_wallet" size={22} color="var(--icon)" /><div className="grow"><div className="b">GetMe wallet</div><div className="cap">Balance {fmt(me.wallet ?? 0)}</div></div></div>
          <div className="item"><Icon name="currency_rupee" size={22} color="var(--icon)" /><div className="grow"><div className="b">Cash on delivery</div><div className="cap">Pay the partner in cash</div></div></div>
        </div>
        <div className="cap">Adding new cards and UPI IDs needs the payment gateway, which is not connected in this build.</div>
      </Sheet>
      <Sheet open={sheet === 'promo'} onClose={() => setSheet(null)} title="Promo codes">
        <div className="list">{PROMOS.map(p => <div key={p.code} className="item"><Icon name="sell" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b mono">{p.code}</div><div className="cap">{fmt(p.discount)} off delivery on {p.appliesTo.join(' and ')} orders</div></div><Button variant="text" color="primary" size="small" onClick={async () => { try { await navigator.clipboard.writeText(p.code); toast('Code copied'); } catch { toast(p.code); } }}>Copy</Button></div>)}</div>
      </Sheet>
      <Sheet open={sheet === 'help'} onClose={() => setSheet(null)} title="Help and support">
        <div className="list"><Row icon="support_agent" label="Chat with support" caption="Usually replies in a few minutes" onClick={() => toast('Support chat opens in the next build')} /><Row icon="call" label="Call GetMe" caption="080 4000 1234 · 7 am – 11 pm" onClick={() => { location.href = 'tel:08040001234'; }} /><Row icon="receipt_long" label="Refunds and disputes" caption="Report from any delivered order" chevron={false} /></div>
      </Sheet>
      <Sheet open={sheet === 'terms'} onClose={() => setSheet(null)} title="Terms and privacy">
        <div className="cap13">GetMe relays chat and calls so phone numbers stay private. Partner locations are shared only during an active order. Item purchases by partners are reimbursed against receipts; refunds are reviewed within 24 hours. Package protection covers loss or damage up to ₹2,000.</div>
        <div className="cap">Full terms of service and privacy policy: getme.example/terms</div>
      </Sheet>
    </>
  );
}
