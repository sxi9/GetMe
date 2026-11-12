import { useState } from 'react';
import { fmt } from '@getme/core';
import { patch } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { Body, Button, Input, Row, Sheet } from '../ui';
import { useShop } from './state';

type Edit = 'details' | 'hours' | 'settlement' | null;

export function ProfileScreen() {
  const { shop, setShop, analytics } = useShop();
  const { session, signOut, toast } = useStore();
  const err = useErrorToast();
  const [edit, setEdit] = useState<Edit>(null);
  const [f, setF] = useState({ name: '', address: '', cat: '', hours: '', gstin: '' });
  const [busy, setBusy] = useState(false);
  const user = session?.me.user;
  const open = (e: Edit) => { setF({ name: shop?.name ?? '', address: shop?.address ?? '', cat: shop?.cat ?? '', hours: shop?.hours ?? '', gstin: shop?.gstin ?? '' }); setEdit(e); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (edit === 'details' && !f.name.trim()) { toast('Enter the shop name'); return; }
    setBusy(true);
    try {
      const body = edit === 'details' ? { name: f.name, address: f.address, cat: f.cat } : edit === 'hours' ? { hours: f.hours } : { gstin: f.gstin.trim() || null };
      setShop(await patch('/api/shop', body)); toast('Saved'); setEdit(null);
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Body style={{ paddingBottom: 48 }}>
        <div className="list">
          <Row icon="person" label={user?.name ?? ''} caption={`Owner · ${user?.phone ? '+91 ' + user.phone : user?.email ?? ''}`} chevron={false} />
          <Row icon="storefront" label={shop?.name ?? 'Shop name'} caption={shop?.cat ?? ''} onClick={() => open('details')} />
          <Row icon="location_on" label="Address" caption={shop?.address || 'Add your address so partners can find you'} onClick={() => open('details')} />
          <Row icon="schedule" label="Hours" caption={`${shop?.hours ?? ''} · all days`} onClick={() => open('hours')} />
          <Row icon="account_balance" label="Settlements" caption={`Weekly payout · balance ${fmt(analytics?.settlement ?? 0)} · ${shop?.gstin ? 'GST ' + shop.gstin : 'No GST number'}`} onClick={() => open('settlement')} />
        </div>
        <div className="list">
          <Row icon="help" label="Help and support" caption="GetMe Shops partner line · 9 am – 9 pm" chevron={false} />
          <Row icon="description" label="Terms for shops" caption="Commission 8% on catalogue orders · weekly settlement" chevron={false} />
        </div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>Log out</Button>
      </Body>
      <Sheet open={edit === 'details'} onClose={() => setEdit(null)} title="Shop details">
        <Input label="Shop name" value={f.name} onChange={set('name')} required />
        <Input label="Category" value={f.cat} onChange={set('cat')} placeholder="Grocery & vegetables" />
        <Input label="Address" value={f.address} onChange={set('address')} placeholder="4, 19th Main, HSR Layout Sector 2" prefixIcon="location_on" />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>Save</Button>
      </Sheet>
      <Sheet open={edit === 'hours'} onClose={() => setEdit(null)} title="Opening hours">
        <Input label="Hours" value={f.hours} onChange={set('hours')} placeholder="7 am – 10 pm" prefixIcon="schedule" hint="Shown to customers on your shop card" />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>Save</Button>
      </Sheet>
      <Sheet open={edit === 'settlement'} onClose={() => setEdit(null)} title="Settlements and GST">
        <div className="card flat" style={{ gap: 4 }}><div className="overline">Settlement balance</div><div className="price">{fmt(analytics?.settlement ?? 0)}</div><div className="cap">Paid out weekly to your bank account after 8% commission on catalogue orders.</div></div>
        <Input label="GST number" value={f.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" mono hint="Optional. Shown on customer invoices." />
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>Save</Button>
      </Sheet>
    </>
  );
}
