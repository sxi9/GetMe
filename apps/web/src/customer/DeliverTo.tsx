// "Deliver to" sheet: saved addresses, current GPS location, pin on the map, add new.
import { useState } from 'react';
import type { Address } from '@getme/core';
import { api } from '../lib/api';
import { currentLocationAddress, fmtAddress, type GpsState } from '../lib/geo';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { Button, Icon, Sheet } from '../ui';
import { AddressEditor } from './AddressEditor';
import { useCustomer } from './state';

export function useGpsHint() {
  const { t } = useT();
  return (s: GpsState) => s === 'asking' ? t('Finding your location…') : s === 'denied' ? t('Location is blocked. Allow it in the browser settings, or pick an address.') : s === 'unavailable' ? t('No GPS on this device. Pick an address or drop a pin.') : '';
}

export function DeliverToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT(); const { session, setMe, toast } = useStore(); const errToast = useErrorToast();
  const { address, setAddress } = useCustomer();
  const [gps, setGps] = useState<GpsState>('idle');
  const [editor, setEditor] = useState<null | 'pin' | 'new'>(null);
  const hint = useGpsHint();
  const saved = session?.me.addresses ?? [];
  const useGps = async () => {
    setGps('asking');
    const r = await currentLocationAddress();
    if ('error' in r) { setGps(r.error); return; }
    setGps('ok'); setAddress(r.address); toast(t('Delivering to your current location')); onClose();
  };
  const choose = (a: Address) => { setAddress(a); onClose(); };
  const saveNew = async (a: Address) => { try { const list = await api('/api/addresses', { method: 'POST', body: { ...a, makeDefault: true } }); setMe({ addresses: list }); setAddress(list[0]); toast(t('Address saved')); setEditor(null); onClose(); } catch (e) { errToast(e); } };
  const usePin = async (a: Address) => { setAddress({ ...a, label: a.label || 'Pinned', source: 'pin' }); setEditor(null); onClose(); };
  const icon = (a: Address) => a.source === 'gps' ? 'my_location' : a.label === 'Home' ? 'home' : a.label === 'Work' ? 'work' : 'location_on';
  return (
    <>
      <Sheet open={open && !editor} onClose={onClose} title={t('Deliver to')}>
        <div className="list">
          <div className="item clickable" onClick={useGps}><Icon name="my_location" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{t('Use my current location')}</div><div className="cap">{hint(gps) || t('GPS position, named for the partner automatically')}</div></div>{gps === 'asking' ? <Icon name="progress_activity" size={20} color="var(--icon)" /> : <Icon name="chevron_right" size={22} color="var(--icon)" />}</div>
          <div className="item clickable" onClick={() => setEditor('pin')}><Icon name="pin_drop" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{t('Pick on the map')}</div><div className="cap">{t('Drop a pin and add a landmark')}</div></div><Icon name="chevron_right" size={22} color="var(--icon)" /></div>
        </div>
        {(gps === 'denied' || gps === 'unavailable') && <div className="cap" style={{ color: 'var(--text-caution)' }}>{hint(gps)} <Button variant="text" color="primary" size="small" onClick={useGps}>{t('Retry')}</Button></div>}
        {address && !address.id && <div className="cap">{t('Current')}: {fmtAddress(address)}</div>}
        <div className="b" style={{ marginTop: 4 }}>{t('Saved addresses')}</div>
        <div className="list">
          {!saved.length && <div className="item"><div className="cap">{t('No saved addresses yet')}</div></div>}
          {saved.map((a: Address) => <div key={a.id} className="item clickable" onClick={() => choose(a)}><Icon name={icon(a)} size={22} color="var(--icon)" /><div className="grow"><div className="b">{t(a.label)}</div><div className="cap">{fmtAddress(a)}</div></div>{address?.id === a.id && <Icon name="check_circle" size={20} color="var(--brand-confirm-rest)" />}</div>)}
        </div>
        <Button variant="outlined" color="primary" fullWidth icon="add_location_alt" onClick={() => setEditor('new')}>{t('Add address')}</Button>
      </Sheet>
      <AddressEditor open={editor === 'new'} onClose={() => setEditor(null)} onSave={saveNew} title={t('Add address')} />
      <AddressEditor open={editor === 'pin'} onClose={() => setEditor(null)} onSave={usePin} title={t('Pick on the map')} saveLabel={t('Deliver here')} initial={{ label: 'Pinned', line: '' }} />
    </>
  );
}
