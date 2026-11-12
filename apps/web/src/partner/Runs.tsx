// Announced trips: "I am going to town at 9, taking orders till 8." Customers attach orders; the partner starts the run and works the orders one by one.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertBanner, Avatar, Body, Button, Chip, Empty, Header, Icon, Input, Map, Money, Sheet, StatusChip, Toggle } from '../ui';
import { api, post } from '../lib/api';
import { fmtAddress, searchPlaces, type GeoHit } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useEvent, useStore } from '../lib/store';
import { firstName, itemsLabel, timeStr, usePartner, whenStr, type RView } from './state';

const RUN_STATUS: Record<string, { label: string; status: 'info' | 'caution' | 'progress' | 'success' | 'ended' }> = {
  open: { label: 'Taking orders', status: 'info' }, closed: { label: 'Closed for orders', status: 'caution' }, in_progress: { label: 'On the trip', status: 'progress' }, done: { label: 'Done', status: 'success' }, cancelled: { label: 'Cancelled', status: 'ended' },
};
export function RunChip({ status }: { status: string }) { const { t } = useT(); const s = RUN_STATUS[status] ?? RUN_STATUS.open; return <StatusChip status={s.status} label={t(s.label)} />; }

function RunCard({ r, onClick }: { r: RView; onClick: () => void }) {
  const { t } = useT();
  return (
    <div className="card clickable" onClick={onClick} style={{ gap: 8 }}>
      <div className="between"><div className="b ellip">{r.label}</div><RunChip status={r.status} /></div>
      <div className="cap13"><Icon name="near_me" size={14} /> {r.destination} · {t('leaves {when}', { when: whenStr(r.departAt) })}</div>
      <div className="row" style={{ gap: 8, fontSize: 13 }}><Icon name="group" size={18} color="var(--icon)" /><span>{t('{n} of {m} seats taken', { n: r.orderIds.length, m: r.capacity })}</span><span className="sec">·</span><Money v={r.feePerOrder} /><span className="cap13">{t('per order')}</span></div>
    </div>
  );
}

/** /partner/runs — my trips. */
export function RunsList() {
  const { t } = useT(); const nav = useNavigate();
  const { runs, refreshRuns } = usePartner();
  const { session } = useStore(); const p = session!.me.partner!;
  useEffect(() => { void refreshRuns(); }, [refreshRuns]);
  const groups = useMemo(() => ({
    live: runs.filter(r => r.status === 'in_progress'),
    upcoming: runs.filter(r => r.status === 'open' || r.status === 'closed').sort((a, b) => Date.parse(a.departAt) - Date.parse(b.departAt)),
    past: runs.filter(r => r.status === 'done' || r.status === 'cancelled').sort((a, b) => Date.parse(b.departAt) - Date.parse(a.departAt)),
  }), [runs]);
  return (
    <>
      <Header title={t('My trips')} subtitle={t('Announce where you are going and take orders along')} />
      <Body>
        {!p.verified ? <AlertBanner type="caution">{t('Finish verification before announcing a trip.')}</AlertBanner>
          : p.activeRunId ? <AlertBanner type="info" action={<Button size="small" variant="text" onClick={() => nav('/partner/job')}>{t('Open')}</Button>}>{t('You are on a trip right now.')}</AlertBanner>
          : <Button color="primary" size="tall" fullWidth icon="add_road" onClick={() => nav('/partner/runs/new')}>{t('Announce a trip')}</Button>}
        {!runs.length && <Empty icon="add_road" title={t('No trips yet')} text={t('Going to the market or town anyway? Announce it and neighbours add their lists for a flat fee each.')} />}
        {groups.live.length > 0 && <div className="col"><div className="overline">{t('In progress')}</div>{groups.live.map(r => <RunCard key={r.id} r={r} onClick={() => nav('/partner/job')} />)}</div>}
        {groups.upcoming.length > 0 && <div className="col"><div className="overline">{t('Upcoming')}</div>{groups.upcoming.map(r => <RunCard key={r.id} r={r} onClick={() => nav(`/partner/runs/${r.id}`)} />)}</div>}
        {groups.past.length > 0 && <div className="col"><div className="overline">{t('Earlier')}</div>{groups.past.map(r => <RunCard key={r.id} r={r} onClick={() => nav(`/partner/runs/${r.id}`)} />)}</div>}
      </Body>
    </>
  );
}

const toLocalInput = (d: Date) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };

/** /partner/runs/new — announce a trip. */
export function RunNew() {
  const { t } = useT(); const nav = useNavigate(); const err = useErrorToast();
  const { session, toast } = useStore(); const { refreshRuns, myPos } = usePartner();
  const community = session!.me.community;
  const [label, setLabel] = useState(''); const [dest, setDest] = useState(''); const [destPos, setDestPos] = useState<GeoHit | null>(null); const [hits, setHits] = useState<GeoHit[]>([]);
  const [depart, setDepart] = useState(toLocalInput(new Date(Date.now() + 2 * 3600_000)));
  const [cutoffMin, setCutoffMin] = useState('30'); const [seats, setSeats] = useState('6'); const [fee, setFee] = useState('40'); const [communityOnly, setCommunityOnly] = useState(!!community); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [e, setE] = useState<Record<string, string>>({});
  useEffect(() => { const q = dest.trim(); if (q.length < 2 || destPos?.line === q) { setHits([]); return; } const id = window.setTimeout(() => searchPlaces(q, myPos).then(setHits).catch(() => setHits([])), 300); return () => window.clearTimeout(id); }, [dest, destPos?.line, myPos]);
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!label.trim()) errs.label = t('Give the trip a name'); if (!dest.trim()) errs.dest = t('Where are you going?');
    const dep = new Date(depart); if (!(dep.getTime() > Date.now())) errs.depart = t('Departure must be in the future');
    if (!(Number(fee) >= 10)) errs.fee = t('At least ₹10 per order');
    setE(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const cutoffAt = new Date(dep.getTime() - Math.max(0, Number(cutoffMin) || 0) * 60000).toISOString();
      const r = await post<RView>('/api/runs', { label: label.trim(), destination: dest.trim(), destinationPos: destPos ? { lat: destPos.lat, lng: destPos.lng } : null, departAt: dep.toISOString(), cutoffAt, capacity: Number(seats) || 6, feePerOrder: Number(fee), communityOnly: communityOnly && !!community, note: note.trim() });
      await refreshRuns(); toast(t('Trip announced. Neighbours nearby have been told.')); nav(`/partner/runs/${r.id}`, { replace: true });
    } catch (x) { err(x); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title={t('Announce a trip')} onBack={() => nav(-1)} />
      <Body>
        <div className="cap13">{t('Tell people where you are going. They add shopping lists to your trip and pay a flat fee each. You buy everything in one go and drop it on the way back.')}</div>
        <Input label={t('Trip name')} value={label} onChange={x => setLabel(x.target.value)} placeholder={t('e.g. Madiwala market run')} error={e.label} />
        <div className="col" style={{ gap: 4 }}>
          <Input label={t('Going to')} value={dest} onChange={x => { setDest(x.target.value); setDestPos(null); }} prefixIcon="near_me" placeholder={t('Market, town or shop')} error={e.dest} hint={destPos ? t('Pinned: {area}', { area: destPos.area }) : undefined} />
          {hits.length > 0 && <div className="list">{hits.slice(0, 5).map((h, i) => <div key={i} className="item clickable" onClick={() => { setDest(h.line); setDestPos(h); setHits([]); }}><Icon name="location_on" size={20} color="var(--icon)" /><div className="grow"><div style={{ fontSize: 13 }}>{h.line}</div><div className="cap">{h.area}</div></div></div>)}</div>}
        </div>
        <Input label={t('Leaves at')} type="datetime-local" value={depart} onChange={x => setDepart(x.target.value)} prefixIcon="schedule" error={e.depart} />
        <div className="grid2">
          <Input label={t('Last call for orders (min before)')} type="tel" inputMode="numeric" value={cutoffMin} onChange={x => setCutoffMin(x.target.value.replace(/\D/g, ''))} prefixIcon="timer" mono />
          <Input label={t('Seats (orders)')} type="tel" inputMode="numeric" value={seats} onChange={x => setSeats(x.target.value.replace(/\D/g, ''))} prefixIcon="group" mono />
        </div>
        <Input label={t('Fee per order (₹)')} type="tel" inputMode="numeric" value={fee} onChange={x => setFee(x.target.value.replace(/\D/g, ''))} prefixIcon="currency_rupee" error={e.fee} hint={t('Flat delivery fee each customer pays you. Item costs are added on top.')} mono />
        {community && <div className="card row flat"><Icon name="apartment" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Only my community')}</div><div className="cap">{t('Show this trip to {name} members only', { name: community.name })}</div></div><Toggle checked={communityOnly} onChange={setCommunityOnly} /></div>}
        <div className="col" style={{ gap: 4 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{t('Note (optional)')}</div><textarea className="ta" value={note} onChange={x => setNote(x.target.value)} placeholder={t('e.g. Vegetables and groceries only, no medicines')} /></div>
        <AlertBanner type="info">{t('Neighbours within 15 km (or your community) get a notification as soon as you announce.')}</AlertBanner>
      </Body>
      <div className="sticky-cta"><Button color="primary" size="tall" fullWidth icon="campaign" loading={busy} onClick={submit}>{t('Announce')}</Button></div>
    </>
  );
}

/** /partner/runs/:id — one trip with its joined orders. */
export function RunDetail() {
  const { t } = useT(); const { id } = useParams(); const nav = useNavigate(); const err = useErrorToast(); const { toast } = useStore();
  const { runs, refreshRuns, myPos } = usePartner();
  const [run, setRun] = useState<RView | null>(() => runs.find(r => r.id === id) ?? null);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const load = () => { if (id) api<RView>(`/api/runs/${id}`).then(setRun).catch(() => {}); };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const r = runs.find(x => x.id === id); if (r) setRun(r); }, [runs, id]);
  useEvent(ev => { if (ev.type === 'run.updated' && ev.run.id === id) load(); if ((ev.type === 'order.updated' || ev.type === 'order.created') && (ev.order as any).runId === id) load(); });
  if (!run) return <><Header title={t('Trip')} onBack={() => nav('/partner/runs')} /><Body><div className="cap">{t('Loading…')}</div></Body></>;
  const act = async (what: 'close' | 'start' | 'cancel') => {
    setBusy(true);
    try {
      const r = await post<RView>(`/api/runs/${run.id}/${what}`);
      setRun(r); await refreshRuns();
      if (what === 'start') { toast(t('Trip started. Work the orders one by one.')); nav('/partner/job'); }
      else if (what === 'close') toast(t('Closed for new orders'));
      else { toast(t('Trip cancelled. Waiting orders go to partners nearby.')); nav('/partner/runs'); }
    } catch (x) { err(x); await refreshRuns(); } finally { setBusy(false); setConfirm(false); }
  };
  const orders = run.orders ?? [];
  const pool = orders.map(o => o.address);
  return (
    <>
      <Header onBack={() => nav('/partner/runs')} right={<RunChip status={run.status} />}>
        <div className="grow"><div className="title">{run.label}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{run.destination} · {t('leaves {when}', { when: whenStr(run.departAt) })}</div></div>
      </Header>
      <Body>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[[t('Seats'), `${run.orderIds.length}/${run.capacity}`], [t('Per order'), `₹${run.feePerOrder}`], [t('Last call'), timeStr(run.cutoffAt)]].map(([k, v]) => <div key={k} className="card flat" style={{ padding: '10px 12px', gap: 0 }}><div className="overline">{k}</div><div className="price" style={{ fontSize: 16 }}>{v}</div></div>)}
        </div>
        {run.note && <div className="cap13">“{run.note}”</div>}
        {run.communityId && <div className="cap13"><Icon name="apartment" size={14} /> {t('Visible to your community only')}</div>}
        {(run.status === 'open' || run.status === 'closed') && (
          <div className="col">
            <Button color="primary" size="tall" fullWidth icon="play_arrow" loading={busy} disabled={!orders.length} onClick={() => act('start')}>{orders.length ? t('Start trip · {n} orders', { n: orders.length }) : t('Start trip (nobody joined yet)')}</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {run.status === 'open' && <Button variant="outlined" style={{ flex: 1 }} disabled={busy} onClick={() => act('close')}>{t('Close for new orders')}</Button>}
              <Button variant="outlined" color="warn" style={{ flex: 1 }} disabled={busy} onClick={() => setConfirm(true)}>{t('Cancel trip')}</Button>
            </div>
          </div>
        )}
        {run.status === 'in_progress' && <Button color="primary" size="tall" fullWidth onClick={() => nav('/partner/job')}>{t('Open the trip')}</Button>}
        <div style={{ flexShrink: 0 }}><Map me={myPos} a={run.destinationPos} aIcon="storefront" pool={pool} /></div>
        <div className="col">
          <div className="between"><div className="h16">{t('Orders on this trip')}</div><div className="cap">{t('{n} joined', { n: orders.length })}</div></div>
          {!orders.length && <div className="drop" style={{ cursor: 'default' }}><Icon name="group" size={26} color="var(--icon)" />{t('Nobody has joined yet. Orders appear here as neighbours add their lists.')}</div>}
          {orders.map(o => (
            <div key={o.id} className="card flat" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}><Avatar initials={o.anon ? 'C' : o.customerName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()} size="sm" /><div className="grow b">{firstName(o)} · {o.id}</div><Chip label={o.pay === 'cod' ? t('Cash') : t('Paid in app')} /></div>
              <div className="cap13">{itemsLabel(o)}</div>
              <div className="cap13"><Icon name="home" size={14} /> {fmtAddress(o.address) || o.address.line}{o.address.handoff && o.address.handoff !== 'in_person' ? ` · ${o.address.handoff === 'gate' ? t('leave at gate') : t('leave at door')}` : ''}</div>
              {o.note && <div className="cap">“{o.note}”</div>}
            </div>
          ))}
        </div>
      </Body>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t('Cancel this trip?')}>
        <div className="cap13">{t('Orders already on the trip are sent to partners nearby instead. Customers are told.')}</div>
        <Button color="warn" size="tall" fullWidth loading={busy} onClick={() => act('cancel')}>{t('Yes, cancel the trip')}</Button>
        <Button variant="text" fullWidth onClick={() => setConfirm(false)}>{t('Keep it')}</Button>
      </Sheet>
    </>
  );
}
