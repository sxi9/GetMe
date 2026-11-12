import { useState } from 'react';
import { CATS, validateShopItem, type ShopItem } from '@getme/core';
import { del, patch, post } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { Body, Button, Chip, Empty, Input, Sheet, StatusChip, Toggle } from '../ui';
import { useShop } from './state';

interface Draft { name: string; price: string; unit: string; stock: string; cat: string }
const empty: Draft = { name: '', price: '', unit: '', stock: '', cat: 'Vegetables' };

export function ItemsScreen() {
  const { shop, setShop } = useShop();
  const { toast } = useStore();
  const err = useErrorToast();
  const [sheet, setSheet] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [d, setD] = useState<Draft>(empty);
  const [dErr, setDErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const items = shop?.items ?? [];
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD(x => ({ ...x, [k]: e.target.value }));

  const openAdd = () => { setD(empty); setDErr(''); setEditing(null); setSheet('add'); };
  const openEdit = (it: ShopItem) => { setD({ name: it.name, price: String(it.price), unit: it.unit, stock: String(it.stock), cat: it.cat }); setDErr(''); setEditing(it); setConfirmDel(false); setSheet('edit'); };
  const close = () => { setSheet(null); setConfirmDel(false); };

  const save = async () => {
    const v = validateShopItem({ name: d.name, price: d.price }); if (v) { setDErr(v); return; }
    setBusy(true);
    try {
      const body = { name: d.name, price: Number(d.price), unit: d.unit || '1 pc', stock: Number(d.stock) || 0, cat: d.cat };
      const s = editing ? await patch(`/api/shop/items/${editing.id}`, body) : await post('/api/shop/items', body);
      setShop(s); toast(editing ? 'Item updated' : 'Item added'); close();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing) return; setBusy(true);
    try { setShop(await del(`/api/shop/items/${editing.id}`)); toast(`${editing.name} removed`); close(); } catch (e) { err(e); } finally { setBusy(false); }
  };
  const restock = async (it: ShopItem) => { try { setShop(await patch(`/api/shop/items/${it.id}`, { restock: 20 })); toast(`${it.name} restocked · +20`); } catch (e) { err(e); } };
  const toggle = async (it: ShopItem, on: boolean) => {
    if (on && it.stock === 0) { toast('Restock first — stock is 0', 'Out of stock'); return; }
    try { setShop(await patch(`/api/shop/items/${it.id}`, { on })); } catch (e) { err(e); }
  };

  const form = (
    <>
      <Input label="Item name" value={d.name} onChange={set('name')} placeholder="e.g. Green grapes" required error={dErr} autoFocus={sheet === 'add'} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Input label="Price (₹)" value={d.price} onChange={set('price')} placeholder="80" type="tel" inputMode="numeric" required style={{ flex: 1 }} mono />
        <Input label="Unit" value={d.unit} onChange={set('unit')} placeholder="500 g" style={{ flex: 1 }} />
        <Input label="Stock" value={d.stock} onChange={set('stock')} placeholder="20" type="tel" inputMode="numeric" style={{ flex: 1 }} mono />
      </div>
      <div className="col"><div style={{ fontSize: 14, fontWeight: 600 }}>Category</div><div className="wrap">{CATS.map(c => <Chip key={c} label={c} selected={d.cat === c} onClick={() => setD(x => ({ ...x, cat: c }))} />)}</div></div>
    </>
  );

  return (
    <>
      <Body tight style={{ paddingBottom: 48 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4 }}><div className="grow cap">{items.length} items · {items.filter(i => i.on).length} live</div><Button color="primary" size="small" icon="add" onClick={openAdd}>Add item</Button></div>
        {items.length === 0 && <Empty icon="inventory_2" title="No items yet" text="Add your first item. It appears in the customer catalogue right away." />}
        {items.map(it => {
          const out = it.stock === 0, low = it.stock > 0 && it.stock <= 3;
          return (
            <div key={it.id} className="card flat" style={{ padding: '10px 12px 10px 14px', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <div className="grow" role="button" tabIndex={0} onClick={() => openEdit(it)} onKeyDown={e => { if (e.key === 'Enter') openEdit(it); }} style={{ cursor: 'pointer' }}>
                <div className="b">{it.name}</div>
                <div className="cap">{it.unit} · ₹{it.price} · {it.cat}</div>
                <div style={{ marginTop: 4 }}>
                  {out ? <StatusChip status="ended" label="Out of stock" /> : low ? <StatusChip status="caution" label={`Low stock · ${it.stock}`} /> : <span className="cap">{it.stock} in stock</span>}
                </div>
              </div>
              {(out || low) && <Button variant="outlined" color="primary" size="small" icon="add_box" onClick={() => restock(it)}>Restock</Button>}
              <Toggle checked={it.on} onChange={on => toggle(it, on)} />
            </div>
          );
        })}
      </Body>
      <Sheet open={sheet === 'add'} onClose={close} title="Add item">
        {form}
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>Save item</Button>
      </Sheet>
      <Sheet open={sheet === 'edit'} onClose={close} title="Edit item">
        {form}
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>Save changes</Button>
        {confirmDel
          ? <div className="col"><div className="cap13" style={{ textAlign: 'center' }}>Remove {editing?.name} from your catalogue?</div><Button color="warn" fullWidth onClick={remove} loading={busy}>Yes, remove it</Button><Button variant="text" fullWidth onClick={() => setConfirmDel(false)}>Keep it</Button></div>
          : <Button variant="text" color="warn" fullWidth icon="delete" onClick={() => setConfirmDel(true)}>Remove item</Button>}
      </Sheet>
    </>
  );
}
