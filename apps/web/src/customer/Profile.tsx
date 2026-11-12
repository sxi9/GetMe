import { AppearanceRow } from '../lib/theme';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGS, TOPUPS, PROMOS, fmt, initials, type Address } from '@getme/core';
import { api, del, patch, uploadFile } from '../lib/api';
import { fmtAddress } from '../lib/geo';
import { useT, type Lang } from '../lib/i18n';
import { disablePush, enablePush, pushPermission } from '../lib/push';
import { useErrorToast, useStore } from '../lib/store';
import { Avatar, Body, Button, Chip, Icon, IconButton, Row, Sheet, Toggle } from '../ui';
import { AddressEditor } from './AddressEditor';
import { CustomerTabs } from './Tabs';
import { JoinCommunity } from './Community';
import { useCustomer } from './state';

export function Profile() {
  const nav = useNavigate(); const { t, lang, setLang } = useT();
  const { session, signOut, setMe, toast, refreshMe } = useStore(); const errToast = useErrorToast();
  const { address, setAddress, board } = useCustomer();
  const me = session!.me; const u = me.user;
  const [sheet, setSheet] = useState<null | 'topup' | 'addresses' | 'pay' | 'promo' | 'help' | 'terms'>(null);
  const [editor, setEditor] = useState<null | { initial?: Partial<Address> }>(null);
  const [topup, setTopup] = useState(500);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(pushPermission());
  const file = useRef<HTMLInputElement>(null);
  const addrs = me.addresses ?? [];
  const community = (me as any).community ?? board?.community ?? null;
  const doTopup = async () => { setBusy(true); try { const r = await api('/api/wallet/topup', { method: 'POST', body: { amount: topup } }); setMe({ wallet: r.balance }); toast(t('{amount} added to your wallet', { amount: fmt(topup) })); setSheet(null); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const saveAddr = async (a: Address) => { try { const list = await api('/api/addresses', { method: 'POST', body: { ...a, makeDefault: !addrs.length || a.id === addrs[0]?.id } }); setMe({ addresses: list }); if (!address || address.id === a.id || !address.id) setAddress(list.find((x: Address) => x.id === a.id) ?? list[0]); toast(t('Address saved')); setEditor(null); } catch (e) { errToast(e); } };
  const rmAddr = async (id: string) => { try { const list = await del(`/api/addresses/${id}`); setMe({ addresses: list }); if (address?.id === id) setAddress(list[0] ?? null); } catch (e) { errToast(e); } };
  const makeDefault = async (a: Address) => { try { const list = await api('/api/addresses', { method: 'POST', body: { ...a, makeDefault: true } }); setMe({ addresses: list }); setAddress(list[0]); } catch (e) { errToast(e); } };
  const setPush = async (v: boolean) => {
    try {
      if (v) { const p = await enablePush(); setPerm(p); if (p === 'denied') toast(t('Notifications are blocked for this site. Allow them in the browser settings.')); else if (p === 'unsupported') toast(t('This browser cannot show push notifications. You will still get SMS for important updates.')); else toast(t('Push notifications on')); }
      else { await disablePush(); }
      const r = await patch('/api/me', { pushEnabled: v }); setMe(r);
    } catch (e) { errToast(e); }
  };
  const changeLang = async (l: Lang) => { setLang(l); try { const r = await patch('/api/me', { lang: l }); setMe(r); } catch (e) { errToast(e); } };
  const photo = async (f: File | undefined) => { if (!f) return; try { const url = await uploadFile(f); setMe(await patch('/api/me', { photoUrl: url })); } catch (e) { errToast(e); } };
  const shareRef = async () => { const text = t('Get ₹50 off your first GetMe order with my code {code}', { code: u.referralCode }); try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(t('Referral code copied')); } } catch { /* cancelled */ } };
  const permLabel = perm === 'granted' ? t('On for this device') : perm === 'denied' ? t('Blocked in the browser') : perm === 'unsupported' ? t('Not supported here · SMS fallback') : t('Order updates, offers and messages');
  const leaveCommunity = async () => { try { await api('/api/communities/leave', { method: 'POST', body: {} }); await refreshMe(); setMe({ community: null } as any); toast(t('Left the community')); } catch (e) { errToast(e); } };
  return (
    <>
      <div className="chrome" style={{ paddingBottom: 20 }}>
        <input ref={file} type="file" accept="image/*" hidden onChange={e => photo(e.target.files?.[0])} />
        <Avatar initials={initials(u.name)} src={u.photoUrl} size={48} onClick={() => file.current?.click()} />
        <div className="grow"><div className="title">{u.name}</div><div style={{ fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,.75)' }}>{u.phone ? '+91 ' + u.phone : ''}{u.phone && u.email ? ' · ' : ''}{u.email ?? ''}</div></div>
        <button className="chrome-btn" onClick={() => file.current?.click()} aria-label={t('Change photo')}><Icon name="photo_camera" size={20} /></button>
      </div>
      <Body>
        <div className="row" style={{ background: 'var(--gm-chrome)', color: '#fff', borderRadius: 8, padding: 16 }}>
          <div className="grow"><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: .4 }}>{t('GetMe wallet')}</div><div className="mono" style={{ font: '600 24px/32px var(--font-mono)' }}>{fmt(me.wallet ?? 0)}</div></div>
          <button onClick={() => setSheet('topup')} style={{ height: 36, padding: '0 14px', border: 'none', borderRadius: 4, background: '#fff', color: 'var(--gm-chrome)', font: '600 13px/1 var(--font-sans)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="add" size={18} />{t('Add money')}</button>
        </div>
        {community ? <div className="card row clickable" onClick={() => nav('/customer/community')}><div className="tile"><Icon name="groups" size={20} /></div><div className="grow"><div className="b">{community.name}</div><div className="cap">{t(community.kind)} · {t('notice board, trips, neighbours')}</div></div><Icon name="chevron_right" size={22} color="var(--icon)" /></div> : <JoinCommunity />}
        <div className="card row flat"><Icon name="card_giftcard" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{t('Invite friends, get ₹50 each')}</div><div className="cap">{t('Code')} <span className="mono b">{u.referralCode}</span> · {t('they get ₹50 off their first order')}</div></div><Button variant="outlined" color="primary" size="small" icon="share" onClick={shareRef}>{t('Share')}</Button></div>
        <div className="list">
          <Row icon="home" label={t('Saved addresses')} caption={addrs.map(a => t(a.label)).join(' · ') || t('Add your first address')} onClick={() => setSheet('addresses')} />
          <Row icon="account_balance_wallet" label={t('Payment methods')} caption={`UPI · ${t('Card')} •••• 4421 · ${t('Wallet')} ${fmt(me.wallet ?? 0)}`} onClick={() => setSheet('pay')} />
          <Row icon="sell" label={t('Promo codes')} caption={PROMOS.map(p => p.code).join(', ') + ' ' + t('available')} onClick={() => setSheet('promo')} />
          <div className="item"><Icon name="notifications" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Push notifications')}</div><div className="cap">{permLabel}</div></div><Toggle checked={u.pushEnabled && perm !== 'denied'} onChange={setPush} /></div>
          <AppearanceRow />
          <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}><div className="row"><Icon name="translate" size={22} color="var(--icon)" /><div className="grow b">{t('Language')}</div></div><div className="wrap" style={{ paddingLeft: 34 }}>{LANGS.map(l => <Chip key={l.id} label={l.label} selected={lang === l.id} onClick={() => changeLang(l.id)} />)}</div></div>
        </div>
        <div className="list"><Row icon="help" label={t('Help and support')} onClick={() => setSheet('help')} /><Row icon="description" label={t('Terms and privacy')} onClick={() => setSheet('terms')} /></div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>{t('Log out')}</Button>
        <div className="cap" style={{ textAlign: 'center' }}>GetMe · Bengaluru · v0.2</div>
      </Body>
      <CustomerTabs />
      <Sheet open={sheet === 'topup'} onClose={() => setSheet(null)} title={t('Add money to wallet')}>
        <div className="cap13">{t('Instant via UPI. Wallet pays automatically on delivery.')}</div>
        <div className="wrap">{TOPUPS.map(v => <Chip key={v} label={fmt(v)} selected={topup === v} onClick={() => setTopup(v)} />)}</div>
        <Button color="primary" size="tall" fullWidth onClick={doTopup} loading={busy}>{t('Add {amount} via UPI', { amount: fmt(topup) })}</Button>
      </Sheet>
      <Sheet open={sheet === 'addresses' && !editor} onClose={() => setSheet(null)} title={t('Saved addresses')}>
        <div className="list">{addrs.map((a, i) => <div key={a.id} className="item clickable" onClick={() => setEditor({ initial: a })}><Icon name={a.label === 'Home' ? 'home' : a.label === 'Work' ? 'work' : 'location_on'} size={22} color="var(--icon)" /><div className="grow"><div className="b">{t(a.label)}{i === 0 ? ` · ${t('default')}` : ''}</div><div className="cap">{fmtAddress(a)}</div>{a.handoff && a.handoff !== 'in_person' && <div className="cap"><Icon name="door_front" size={12} /> {a.handoff === 'gate' ? t('Leave at the gate') : t('Leave at the door')}</div>}</div>{i > 0 && <IconButton icon="push_pin" label={t('Make default')} onClick={() => makeDefault(a)} />}{addrs.length > 1 && <IconButton icon="delete" label={t('Remove')} onClick={() => rmAddr(a.id!)} />}</div>)}
          {!addrs.length && <div className="item"><div className="cap">{t('No saved addresses yet')}</div></div>}</div>
        <Button color="primary" fullWidth icon="add_location_alt" onClick={() => setEditor({})}>{t('Add an address')}</Button>
      </Sheet>
      <AddressEditor open={!!editor} onClose={() => setEditor(null)} initial={editor?.initial} onSave={saveAddr} title={editor?.initial?.id ? t('Edit address') : t('Add address')} />
      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)} title={t('Payment methods')}>
        <div className="list">
          <div className="item"><Icon name="payments" size={22} color="var(--icon)" /><div className="grow"><div className="b">UPI</div><div className="cap">{t('Pay with any UPI app on delivery')}</div></div><Icon name="check_circle" size={20} color="var(--brand-confirm-rest)" /></div>
          <div className="item"><Icon name="credit_card" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Card')} •••• 4421</div><div className="cap">{t('HDFC · charged automatically on delivery')}</div></div></div>
          <div className="item"><Icon name="account_balance_wallet" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('GetMe wallet')}</div><div className="cap">{t('Balance')} {fmt(me.wallet ?? 0)}</div></div></div>
          <div className="item"><Icon name="currency_rupee" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Cash on delivery')}</div><div className="cap">{t('Pay the partner in cash')}</div></div></div>
          <div className="item"><Icon name="currency_bitcoin" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Crypto (USDT / USDC)')}</div><div className="cap">{t('Stablecoin invoice once the bill is final · partners are paid in rupees')}</div></div></div>
        </div>
        <div className="cap">{t('Adding new cards and UPI IDs needs the payment gateway, which is not connected in this build.')}</div>
      </Sheet>
      <Sheet open={sheet === 'promo'} onClose={() => setSheet(null)} title={t('Promo codes')}>
        <div className="list">{PROMOS.map(p => <div key={p.code} className="item"><Icon name="sell" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b mono">{p.code}</div><div className="cap">{t('{amount} off delivery on {kinds} orders', { amount: fmt(p.discount), kinds: p.appliesTo.map(k => t(k)).join(` ${t('and')} `) })}</div></div><Button variant="text" color="primary" size="small" onClick={async () => { try { await navigator.clipboard.writeText(p.code); toast(t('Code copied')); } catch { toast(p.code); } }}>{t('Copy')}</Button></div>)}</div>
      </Sheet>
      <Sheet open={sheet === 'help'} onClose={() => setSheet(null)} title={t('Help and support')}>
        <div className="list"><Row icon="support_agent" label={t('Chat with support')} caption={t('Usually replies in a few minutes')} onClick={() => toast(t('Support chat opens in the next build'))} /><Row icon="call" label={t('Call GetMe')} caption="080 4000 1234 · 7 am – 11 pm" onClick={() => { location.href = 'tel:08040001234'; }} /><Row icon="receipt_long" label={t('Refunds and disputes')} caption={t('Report from any delivered order')} chevron={false} />{community && <Row icon="logout" label={t('Leave {name}', { name: community.name })} onClick={leaveCommunity} chevron={false} />}</div>
      </Sheet>
      <Sheet open={sheet === 'terms'} onClose={() => setSheet(null)} title={t('Terms and privacy')}>
        <div className="cap13">{t('GetMe relays chat and calls so phone numbers stay private. Partner locations are shared only during an active order. Item purchases by partners are reimbursed against receipts; refunds are reviewed within 24 hours. Package protection covers loss or damage up to ₹2,000.')}</div>
        <div className="cap">{t('Full terms of service and privacy policy')}: getme.example/terms</div>
      </Sheet>
    </>
  );
}
