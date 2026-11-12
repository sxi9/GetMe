import { AppearanceRow } from '../lib/theme';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGS, fmt, type LatLng, type RegionProfile } from '@getme/core';
import { patch, post, uploadFile } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT, type Lang } from '../lib/i18n';
import { regionAt, type GeoHit } from '../lib/geo';
import { disablePush, enablePush, pushPermission } from '../lib/push';
import { Avatar, Body, Button, Chip, Input, MapPicker, Row, Sheet, ToggleRow } from '../ui';
import { useShop } from './state';

type Edit = 'details' | 'hours' | 'settlement' | 'location' | 'community' | null;

export function ProfileScreen() {
  const { shop, setShop, analytics, community, setCommunity } = useShop();
  const { session, signOut, toast, setMe } = useStore();
  const { t, lang, setLang } = useT();
  const err = useErrorToast();
  const nav = useNavigate();
  const [edit, setEdit] = useState<Edit>(null);
  const [f, setF] = useState({ name: '', address: '', cat: '', hours: '', gstin: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinHit, setPinHit] = useState<GeoHit | null>(null);
  const [region, setRegion] = useState<RegionProfile | null>(null);
  const [code, setCode] = useState('');
  const [perm, setPerm] = useState(pushPermission());
  const shopFile = useRef<HTMLInputElement>(null);
  const user = session?.me.user;

  useEffect(() => { if (shop?.pos) regionAt(shop.pos).then(setRegion).catch(() => {}); }, [shop?.pos?.lat, shop?.pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (e: Edit) => { setF({ name: shop?.name ?? '', address: shop?.address ?? '', cat: shop?.cat ?? '', hours: shop?.hours ?? '', gstin: shop?.gstin ?? '' }); if (e === 'location') { setPin(shop?.pos ?? null); setPinHit(null); } setEdit(e); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (edit === 'details' && !f.name.trim()) { toast(t('Enter the shop name')); return; }
    setBusy(true);
    try {
      const body = edit === 'details' ? { name: f.name, address: f.address, cat: f.cat } : edit === 'hours' ? { hours: f.hours } : edit === 'location' ? { pos: pin, address: f.address } : { gstin: f.gstin.trim() || null };
      setShop(await patch('/api/shop', body)); toast(t('Saved')); setEdit(null);
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const pickShopPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setUploading(true);
    try { const url = await uploadFile(file); setShop(await patch('/api/shop', { photoUrl: url })); toast(t('Shop photo updated')); } catch (er) { err(er); } finally { setUploading(false); }
  };
  const togglePush = async (on: boolean) => {
    try {
      if (on) { const p = await enablePush(); setPerm(p); if (p === 'granted') toast(t('Push notifications on')); else if (p === 'unsupported') toast(t('This browser does not support push. In-app alerts still work')); else toast(t('Notifications are blocked in the browser settings')); }
      else { await disablePush(); setPerm(pushPermission()); }
      setMe({ user: await patch('/api/me', { pushEnabled: on }).then(r => r.user) });
    } catch (e) { err(e); }
  };
  const changeLang = async (l: Lang) => { setLang(l); try { await patch('/api/me', { lang: l }); } catch { /* local only */ } };
  const join = async () => {
    if (!code.trim()) return; setBusy(true);
    try { const c = await post('/api/communities/join', { code: code.trim() }); setCommunity(c); toast(t('Joined {name}', { name: c.name })); setEdit(null); setCode(''); } catch (e) { err(e); } finally { setBusy(false); }
  };
  const leave = async () => { setBusy(true); try { await post('/api/communities/leave'); setCommunity(null); toast(t('Left the community')); setEdit(null); } catch (e) { err(e); } finally { setBusy(false); } };
  const pushOn = !!user?.pushEnabled && perm === 'granted';

  return (
    <>
      <Body style={{ paddingBottom: 48 }}>
        <input ref={shopFile} type="file" accept="image/*" capture="environment" hidden onChange={pickShopPhoto} />
        <div className="card" style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
          {shop?.photoUrl ? <img className="photo" src={shop.photoUrl} alt="" /> : <div className="photo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--text-secondary)', fontSize: 13 }}><span className="gm-icon" style={{ fontSize: 28 }}>storefront</span>{t('No shop photo yet')}</div>}
          <div className="row" style={{ padding: '12px 16px' }}>
            <Avatar initials={(user?.name ?? 'S').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()} src={user?.photoUrl} size="lg" />
            <div className="grow"><div className="b ellip">{shop?.name}</div><div className="cap">{t('Shown to customers on your shop card')}</div></div>
            <Button variant="outlined" size="small" icon="photo_camera" onClick={() => shopFile.current?.click()} loading={uploading}>{shop?.photoUrl ? t('Change') : t('Add photo')}</Button>
          </div>
        </div>
        <div className="list">
          <Row icon="person" label={user?.name ?? ''} caption={`${t('Owner')} · ${user?.phone ? '+91 ' + user.phone : user?.email ?? ''}`} chevron={false} />
          <Row icon="storefront" label={shop?.name ?? t('Shop name')} caption={shop?.cat ?? ''} onClick={() => open('details')} />
          <Row icon="location_on" label={t('Shop location')} caption={shop?.address ? `${shop.address}${region ? ' · ' + t(region.name) : ''}` : t('Drop a pin so partners and customers find you')} onClick={() => open('location')} />
          <Row icon="schedule" label={t('Hours')} caption={`${shop?.hours ?? ''} · ${t('all days')}`} onClick={() => open('hours')} />
          <Row icon="account_balance" label={t('Settlements')} caption={`${t('Weekly payout')} · ${t('balance')} ${fmt(analytics?.settlement ?? 0)} · ${shop?.gstin ? 'GST ' + shop.gstin : t('No GST number')}`} onClick={() => open('settlement')} />
          <Row icon="verified" label={shop?.approved ? t('Approved on GetMe') : t('Under review')} caption={shop?.approved ? t('Customers nearby can order from your catalogue') : t('GetMe ops checks new shops within a day')} chevron={false} />
        </div>
        <div className="card" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="tile"><span className="gm-icon" style={{ fontSize: 20 }}>groups</span></div>
            <div className="grow"><div className="b">{community ? community.name : t('Community')}</div><div className="cap">{community ? t('{n} members · code {code}', { n: community.memberCount, code: community.joinCode }) : t('Join your apartment society or village to post offers to residents')}</div></div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {community ? <><Button color="primary" size="small" icon="campaign" onClick={() => nav('/shop/community')}>{t('Notice board')}</Button><Button variant="text" size="small" color="warn" onClick={() => open('community')}>{t('Leave')}</Button></> : <Button color="primary" size="small" icon="group_add" onClick={() => open('community')}>{t('Join with a code')}</Button>}
          </div>
        </div>
        <div className="card" style={{ gap: 12 }}>
          <ToggleRow icon="notifications_active" label={t('Push notifications')} caption={perm === 'unsupported' ? t('Not supported in this browser') : perm === 'denied' ? t('Blocked in browser settings') : pushOn ? t('New orders reach you even when the app is closed') : t('Get new orders even when the app is closed')} checked={pushOn} onChange={togglePush} />
          <div className="divider" />
          <div className="list" style={{ border: 'none' }}><AppearanceRow /></div>
          <div className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <span className="gm-icon" style={{ fontSize: 22, color: 'var(--icon)' }}>translate</span>
            <div className="grow"><div className="b">{t('Language')}</div></div>
          </div>
          <div className="wrap">{LANGS.map(l => <Chip key={l.id} label={l.label} selected={lang === l.id} onClick={() => changeLang(l.id)} />)}</div>
        </div>
        <div className="list">
          <Row icon="help" label={t('Help and support')} caption={t('GetMe Shops partner line · 9 am – 9 pm')} chevron={false} />
          <Row icon="description" label={t('Terms for shops')} caption={t('Commission 8% on catalogue orders · weekly settlement')} chevron={false} />
        </div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>{t('Log out')}</Button>
      </Body>
      <Sheet open={edit === 'details'} onClose={() => setEdit(null)} title={t('Shop details')}>
        <Input label={t('Shop name')} value={f.name} onChange={set('name')} required />
        <Input label={t('Category')} value={f.cat} onChange={set('cat')} placeholder={t('Grocery & vegetables')} />
        <Input label={t('Address')} value={f.address} onChange={set('address')} placeholder="4, 19th Main, HSR Layout Sector 2" prefixIcon="location_on" />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{t('Save')}</Button>
      </Sheet>
      <Sheet open={edit === 'location'} onClose={() => setEdit(null)} title={t('Shop location')}>
        <div className="cap13">{t('Move the map until the pin sits on your shop door. Partners navigate to this point.')}</div>
        <MapPicker value={pin} height={240} onChange={(pos, hit) => { setPin(pos); if (hit) { setPinHit(hit); setF(x => ({ ...x, address: x.address || hit.line })); regionAt(pos).then(setRegion).catch(() => {}); } }} />
        {pinHit && <div className="cap13"><span className="gm-icon" style={{ fontSize: 14, verticalAlign: -2 }}>place</span> {pinHit.line}{pinHit.area ? ` · ${pinHit.area}` : ''}{region ? ` · ${t(region.name)}` : ''}</div>}
        <Input label={t('Address as customers read it')} value={f.address} onChange={set('address')} placeholder={t('Shop no., street, landmark')} prefixIcon="storefront" />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy} disabled={!pin}>{t('Save location')}</Button>
      </Sheet>
      <Sheet open={edit === 'hours'} onClose={() => setEdit(null)} title={t('Opening hours')}>
        <Input label={t('Hours')} value={f.hours} onChange={set('hours')} placeholder="7 am – 10 pm" prefixIcon="schedule" hint={t('Shown to customers on your shop card')} />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{t('Save')}</Button>
      </Sheet>
      <Sheet open={edit === 'settlement'} onClose={() => setEdit(null)} title={t('Settlements and GST')}>
        <div className="card flat" style={{ gap: 4 }}><div className="overline">{t('Settlement balance')}</div><div className="price">{fmt(analytics?.settlement ?? 0)}</div><div className="cap">{t('Paid out weekly to your bank account after 8% commission on catalogue orders.')}</div></div>
        <Input label={t('GST number')} value={f.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" mono hint={t('Optional. Shown on customer invoices.')} />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{t('Save')}</Button>
      </Sheet>
      <Sheet open={edit === 'community'} onClose={() => setEdit(null)} title={community ? t('Leave {name}?', { name: community.name }) : t('Join a community')}>
        {community
          ? <><div className="cap13">{t('You will stop seeing the notice board and residents will no longer see your offers.')}</div><Button color="warn" size="tall" fullWidth onClick={leave} loading={busy}>{t('Leave community')}</Button><Button variant="text" fullWidth onClick={() => setEdit(null)}>{t('Stay')}</Button></>
          : <><Input label={t('Community code')} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SUNRISE" mono hint={t('Ask the society office or the village committee for the code')} onEnter={join} autoFocus /><Button color="primary" size="tall" fullWidth onClick={join} loading={busy}>{t('Join')}</Button></>}
      </Sheet>
    </>
  );
}
