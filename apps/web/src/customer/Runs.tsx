// Trips to town announced by partners: list, detail, join.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fmtKm, haversineKm } from '@getme/core';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Avatar, Body, Button, Empty, Header, Icon, Map, StatusChip } from '../ui';
import { CustomerTabs } from './Tabs';
import { dayAt, timeAt, useCustomer } from './state';

export function RunCard({ r, onClick }: { r: any; onClick?: () => void }) {
  const { t } = useT(); const { address } = useCustomer();
  const km = address ? haversineKm(address, r.from) : null;
  return (
    <div className={'card row' + (onClick ? ' clickable' : '')} onClick={onClick}>
      <Avatar initials={r.partner?.initials ?? 'P'} src={r.partner?.photoUrl} size="lg" />
      <div className="grow">
        <div className="b">{r.partnerName.split(' ')[0]} → {r.destination}</div>
        <div className="cap">{dayAt(r.departAt)} {timeAt(r.departAt)} · <span className="mono b">₹{r.feePerOrder}</span> {t('per order')} · {t('{n} seats left', { n: r.seats })}</div>
        <div className="cap"><Icon name="star" size={12} filled color="var(--severity-low)" /> {r.partner?.rating ?? '–'} · {r.partner?.tier === 'runner' ? t('community runner') : t('delivery partner')}{km != null ? ` · ${t('starts {d} from you', { d: fmtKm(km) })}` : ''}</div>
      </div>
      {r.myOrderIds?.length ? <StatusChip status="success" label={t('Joined')} /> : onClick && <Icon name="chevron_right" size={22} color="var(--icon)" />}
    </div>
  );
}

export function Runs() {
  const nav = useNavigate(); const { t } = useT();
  const { runs, refreshRuns } = useCustomer();
  useEffect(() => { refreshRuns().catch(() => {}); }, [refreshRuns]);
  return (
    <>
      <Header title={t('Trips to town')} onBack={() => nav('/customer')} />
      <Body>
        <div className="cap13">{t('Partners and neighbours announce when they are going to town. Add your list and it rides along for a flat fee.')}</div>
        {!runs.length && <Empty icon="route" title={t('No trips announced yet')} text={t('When a partner near you announces a trip, it shows up here and you get a notification.')} />}
        {runs.map(r => <RunCard key={r.id} r={r} onClick={() => nav(`/customer/runs/${r.id}`)} />)}
      </Body>
      <CustomerTabs />
    </>
  );
}

export function RunDetail() {
  const { id } = useParams(); const nav = useNavigate(); const { t } = useT();
  const { runs, setPendingRun, setCoKind, setList, orders, address } = useCustomer();
  const [run, setRun] = useState<any>(runs.find(r => r.id === id) ?? null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/runs/${id}`).then(setRun).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => { const r = runs.find(x => x.id === id); if (r) setRun((cur: any) => ({ ...(cur ?? {}), ...r })); }, [runs, id]);
  const joinable = run && run.status === 'open' && run.seats > 0 && Date.parse(run.cutoffAt) > Date.now();
  const mine = (run?.myOrderIds ?? []).map((oid: string) => orders[oid]).filter(Boolean);
  const join = () => { setPendingRun(run.id); setCoKind('list'); setList(d => ({ ...d, when: 'now' })); nav('/customer/list'); };
  const status: Record<string, [any, string]> = { open: ['progress', t('Taking orders')], closed: ['pending', t('Closed for new orders')], in_progress: ['progress', t('On the way')], done: ['success', t('Completed')], cancelled: ['ended', t('Cancelled')] };
  return (
    <>
      <Header title={run?.label ?? t('Trip')} onBack={() => nav(-1)} right={run && <StatusChip status={status[run.status][0]} label={status[run.status][1]} />} />
      <Body>
        {err && <div className="card">{err}</div>}
        {run && <>
          <RunCard r={run} />
          <Map a={run.from} aIcon="trip_origin" b={run.destinationPos ?? null} bIcon="storefront" me={address ? { lat: address.lat, lng: address.lng } : null} route={run.destinationPos ? [run.from, run.destinationPos] : null} />
          <div className="card flat" style={{ gap: 6, fontSize: 13, lineHeight: '20px' }}>
            <div className="between"><span>{t('Leaves')}</span><span className="b">{dayAt(run.departAt)} {timeAt(run.departAt)}</span></div>
            <div className="between"><span>{t('Add orders until')}</span><span className="b">{timeAt(run.cutoffAt)}</span></div>
            <div className="between"><span>{t('Starts from')}</span><span className="b ellip" style={{ maxWidth: '60%' }}>{run.from.line}</span></div>
            <div className="between"><span>{t('Fee per order')}</span><span className="mono b">₹{run.feePerOrder}</span></div>
            {run.note && <div className="cap" style={{ marginTop: 4 }}>“{run.note}”</div>}
          </div>
          {mine.length > 0 && <div className="col"><div className="b">{t('Your orders on this trip')}</div>{mine.map((o: any) => <div key={o.id} className="card row flat clickable" onClick={() => nav(`/customer/order/${o.id}`)}><Icon name="shopping_basket" size={20} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{o.id}</div><div className="cap">{o.items.length} {t('items')} · {o.bill.totalLabel}</div></div><Icon name="chevron_right" size={22} color="var(--icon)" /></div>)}</div>}
          <div className="cap13">{t('The partner buys your list on the way back and delivers it to you. You pay the items and the trip fee on delivery.')}</div>
        </>}
      </Body>
      {run && <div className="sticky-cta"><Button color="primary" size="tall" fullWidth icon="playlist_add" disabled={!joinable} onClick={join}>{joinable ? t('Add my list to this trip') : t('This trip is no longer taking orders')}</Button></div>}
    </>
  );
}
