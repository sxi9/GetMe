import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertBanner, Avatar, Body, Button, Header, Icon, Map, Toggle } from '../ui';
import { post, API_URL } from '../lib/api';
import { NotificationBell } from '../lib/notifications';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { RequestCard } from './RequestCard';
import { RunChip } from './Runs';
import { phaseLabel, usePartner, whenStr } from './state';

export function Home() {
  const { t } = useT();
  const { session, setMe, toast } = useStore(); const err = useErrorToast();
  const p = session!.me.partner!;
  const { requests, active, activeRun, runs, earnings, myPos, gps, sim, setSim, mine } = usePartner();
  const nav = useNavigate();
  const list = useMemo(() => Object.values(requests).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [requests]);
  const pool = useMemo(() => list.map(o => o.shopPos ?? o.pickup ?? o.address), [list]);
  const upcoming = useMemo(() => runs.filter(r => r.status === 'open' || r.status === 'closed').sort((a, b) => Date.parse(a.departAt) - Date.parse(b.departAt)), [runs]);
  const toggle = async (on: boolean) => { try { setMe({ partner: await post('/api/partner/online', { online: on }) }); toast(on ? t('You are online in {area}', { area: p.area }) : t('You are offline. New requests paused')); } catch (e) { err(e); } };
  const live = active && active.status !== 'delivered' ? active : null;
  const sub = !p.verified ? t('Finish verification to go online') : p.online ? `${t('Taking requests in {area}', { area: p.area })}${list.length ? ` · ${t('{n} open nearby', { n: list.length })}` : ''}` : t('Go online to see requests');
  return (
    <>
      <Header right={<NotificationBell onOpen={n => { if (!n.orderId) { nav('/partner/runs'); return; } if (mine[n.orderId]) nav('/partner/job'); else if (requests[n.orderId]) nav(`/partner/request/${n.orderId}`); }} />}>
        <Avatar initials={p.initials} src={p.photoUrl ? API_URL + p.photoUrl : null} size="md" />
        <div className="grow"><div className="title">{p.name}</div><div className="row" style={{ gap: 4, fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}><Icon name="star" size={14} filled color="var(--severity-low)" />{p.rating} · {t(p.vehicle)} · {p.area}</div></div>
      </Header>
      <Body>
        {!p.verified && <AlertBanner type="caution" icon="verified_user" action={<Button size="small" variant="text" onClick={() => nav('/partner/profile')}>{p.verification === 'pending' ? t('View') : t('Upload')}</Button>}>{p.verification === 'pending' ? t('Documents under review. You can go online once GetMe ops approves them.') : p.verification === 'rejected' ? t('Verification not approved. Upload clearer documents to go online.') : t('Finish verification to go online. Upload your ID and a selfie to start.')}</AlertBanner>}
        <div className="card row">
          <div className="grow"><div className="b">{p.online ? t('You are online') : t('You are offline')}</div><div className="cap">{sub}</div></div>
          <Toggle checked={p.online} onChange={toggle} disabled={!p.verified} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[[t('Today'), `₹${earnings?.today ?? 0}`], [t('Trips'), String(earnings?.trips ?? 0)], [t('Tips'), `₹${earnings?.tips ?? 0}`]].map(([k, v]) => <div key={k} className="card flat" style={{ padding: '10px 12px', gap: 0 }}><div className="overline">{k}</div><div className="price">{v}</div></div>)}
        </div>
        {list.length >= 2 && <div className="card row flat"><Icon name="local_fire_department" size={22} color="var(--severity-medium)" /><div className="grow"><div className="b">{t('Busy nearby')}</div><div className="cap">{t('{n} open requests in {area} · accept quickly to keep your streak', { n: list.length, area: p.area })}</div></div></div>}
        {activeRun && (
          <div className="card row clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav('/partner/job')}>
            <Icon name="add_road" size={24} color="var(--brand-primary-rest)" />
            <div className="grow"><div className="b">{t('On a trip')} · {activeRun.label}</div><div className="cap13">{live ? `${live.id} · ${t(phaseLabel(live))}` : t('{n} orders', { n: activeRun.orderIds.length })}</div></div>
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>
        )}
        {live && !activeRun && (
          <div className="card row clickable" style={{ borderColor: 'var(--brand-primary-rest)' }} onClick={() => nav('/partner/job')}>
            <Icon name="local_shipping" size={24} color="var(--brand-primary-rest)" />
            <div className="grow"><div className="b">{t('Active job')} · {live.id}</div><div className="cap13">{t(phaseLabel(live))} · {t('earn ₹{n}', { n: live.earn })}</div></div>
            <Icon name="chevron_right" size={22} color="var(--icon)" />
          </div>
        )}
        {upcoming.slice(0, 2).map(r => (
          <div key={r.id} className="card row clickable" onClick={() => nav(`/partner/runs/${r.id}`)}>
            <Icon name="add_road" size={24} color="var(--gm-chrome)" />
            <div className="grow"><div className="b ellip">{t('Your trip')} · {r.label}</div><div className="cap13">{t('leaves {when}', { when: whenStr(r.departAt) })} · {t('{n} of {m} seats taken', { n: r.orderIds.length, m: r.capacity })}</div></div>
            <RunChip status={r.status} />
          </div>
        ))}
        {p.verified && !activeRun && !upcoming.length && <div className="card row clickable flat" onClick={() => nav('/partner/runs/new')}><div className="tile"><Icon name="add_road" size={20} /></div><div className="grow"><div className="b">{t('Going to town anyway?')}</div><div className="cap">{t('Announce a trip. Neighbours add their lists and pay a flat fee each.')}</div></div><Icon name="chevron_right" size={22} color="var(--icon)" /></div>}
        {p.online && list.map(o => <RequestCard key={o.id} o={o} />)}
        {p.online && !list.length && !live && !activeRun && <div className="drop" style={{ padding: 20, cursor: 'default' }}><Icon name="radar" size={28} color="var(--icon)" />{t('No requests right now. Stay online — new requests appear here.')}</div>}
        {!p.online && p.verified && <AlertBanner type="neutral">{t('You are offline. Requests are paused until you go online.')}</AlertBanner>}
        <div style={{ flexShrink: 0 }}><Map me={myPos} meHeading={p.heading} meVehicle={p.vehicle} pool={pool} /></div>
        {(gps === 'unavailable' || gps === 'denied') && <div className="between cap"><span>{gps === 'denied' ? t('Location blocked in the browser') : t('No GPS on this device')} · {t('position is simulated')}</span><Toggle checked={sim} onChange={setSim} label={t('Simulate')} /></div>}
      </Body>
    </>
  );
}

/** /partner/request/:id — one request on its own screen (opened from a toast). */
export function RequestScreen() {
  const { t } = useT();
  const { id } = useParams(); const nav = useNavigate();
  const { requests, myPos } = usePartner();
  const o = id ? requests[id] : undefined;
  return (
    <>
      <Header title={o ? t('Request {id}', { id: o.id }) : t('Request')} onBack={() => nav('/partner')} />
      <Body>
        {o ? <><RequestCard o={o} /><div style={{ flexShrink: 0 }}><Map me={myPos} a={o.shopPos ?? o.pickup ?? null} aIcon={o.kind === 'parcel' ? 'inventory_2' : 'storefront'} b={o.address} bIcon={o.kind === 'parcel' ? 'person_pin_circle' : 'home'} route={[o.shopPos ?? o.pickup ?? myPos, o.address]} /></div></> : <AlertBanner type="neutral">{t('This request is no longer open.')}</AlertBanner>}
      </Body>
    </>
  );
}
