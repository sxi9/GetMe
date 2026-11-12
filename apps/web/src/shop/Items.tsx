import { useRef, useState } from 'react';
import { CATS, validateShopItem, type ShopItem } from '@getme/core';
import { del, patch, post, uploadFile } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { Body, Button, Chip, Empty, Icon, Input, Sheet, StatusChip, Toggle } from '../ui';
import { useShop } from './state';

interface Draft { name: string; price: string; unit: string; stock: string; cat: string; photoUrl: string | null }
const empty: Draft = { name: '', price: '', unit: '', stock: '', cat: 'Vegetables', photoUrl: null };

export function ItemsScreen() {
  const { shop, setShop } = useShop();
  const { toast } = useStore();
  const { t } = useT();
  const err = useErrorToast();
  const [sheet, setSheet] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [d, setD] = useState<Draft>(empty);
  const [dErr, setDErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [filter, setFilter] = useState<'all' | 'low' | 'off'>('all');
  const file = useRef<HTMLInputElement>(null);
  const all = shop?.items ?? [];
  const items = all.filter(i => filter === 'all' ? true : filter === 'low' ? i.stock <= 3 : !i.on);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD(x => ({ ...x, [k]: e.target.value }));

  const openAdd = () => { setD(empty); setDErr(''); setEditing(null); setSheet('add'); };
  const openEdit = (it: ShopItem) => { setD({ name: it.name, price: String(it.price), unit: it.unit, stock: String(it.stock), cat: it.cat, photoUrl: it.photoUrl ?? null }); setDErr(''); setEditing(it); setConfirmDel(false); setSheet('edit'); };
  const close = () => { setSheet(null); setConfirmDel(false); };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try { const url = await uploadFile(f); setD(x => ({ ...x, photoUrl: url })); } catch (er) { err(er); } finally { setUploading(false); }
  };
  const save = async () => {
    const v = validateShopItem({ name: d.name, price: d.price }); if (v) { setDErr(t(v)); return; }
    setBusy(true);
    try {
      const body = { name: d.name, price: Number(d.price), unit: d.unit || '1 pc', stock: Number(d.stock) || 0, cat: d.cat, photoUrl: d.photoUrl };
      const s = editing ? await patch(`/api/shop/items/${editing.id}`, body) : await post('/api/shop/items', body);
      setShop(s); toast(editing ? t('Item updated') : t('Item added')); close();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing) return; setBusy(true);
    try { setShop(await del(`/api/shop/items/${editing.id}`)); toast(t('{name} removed', { name: editing.name })); close(); } catch (e) { err(e); } finally { setBusy(false); }
  };
  const restock = async (it: ShopItem) => { try { setShop(await patch(`/api/shop/items/${it.id}`, { restock: 20 })); toast(t('{name} restocked · +20', { name: it.name })); } catch (e) { err(e); } };
  const toggle = async (it: ShopItem, on: boolean) => {
    if (on && it.stock === 0) { toast(t('Restock first — stock is 0'), t('Out of stock')); return; }
    try { setShop(await patch(`/api/shop/items/${it.id}`, { on })); } catch (e) { err(e); }
  };

  const form = (
    <>
      <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
      <div className="row" style={{ gap: 12 }}>
        <div className="thumb" style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }} onClick={() => file.current?.click()} role="button" aria-label={t('Item photo')}>
          {d.photoUrl ? <img src={d.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="add_a_photo" size={24} color="var(--icon)" />}
        </div>
        <div className="grow col" style={{ gap: 4 }}>
          <div className="b">{t('Item photo')}</div>
          <div className="cap">{d.photoUrl ? t('Tap to change') : t('Optional · helps customers spot the item')}</div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="outlined" size="small" icon="photo_camera" onClick={() => file.current?.click()} loading={uploading}>{d.photoUrl ? t('Change') : t('Add photo')}</Button>
            {d.photoUrl && <Button variant="text" size="small" color="warn" onClick={() => setD(x => ({ ...x, photoUrl: null }))}>{t('Remove')}</Button>}
          </div>
        </div>
      </div>
      <Input label={t('Item name')} value={d.name} onChange={set('name')} placeholder={t('e.g. Green grapes')} required error={dErr} autoFocus={sheet === 'add'} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Input label={t('Price (₹)')} value={d.price} onChange={set('price')} placeholder="80" type="tel" inputMode="numeric" required style={{ flex: 1 }} mono />
        <Input label={t('Unit')} value={d.unit} onChange={set('unit')} placeholder="500 g" style={{ flex: 1 }} />
        <Input label={t('Stock')} value={d.stock} onChange={set('stock')} placeholder="20" type="tel" inputMode="numeric" style={{ flex: 1 }} mono />
      </div>
      <div className="col"><div style={{ fontSize: 14, fontWeight: 600 }}>{t('Category')}</div><div className="wrap">{CATS.map(c => <Chip key={c} label={t(c)} selected={d.cat === c} onClick={() => setD(x => ({ ...x, cat: c }))} />)}</div></div>
    </>
  );
  const lowCount = all.filter(i => i.stock <= 3).length, offCount = all.filter(i => !i.on).length;

  return (
    <>
      <Body tight style={{ paddingBottom: 48 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4 }}><div className="grow cap">{t('{n} items · {m} live', { n: all.length, m: all.filter(i => i.on).length })}</div><Button color="primary" size="small" icon="add" onClick={openAdd}>{t('Add item')}</Button></div>
        <div className="wrap" style={{ marginBottom: 4 }}>
          <Chip label={t('All')} selected={filter === 'all'} onClick={() => setFilter('all')} />
          <Chip label={lowCount ? t('Low stock · {n}', { n: lowCount }) : t('Low stock')} leftIcon="flag" selected={filter === 'low'} onClick={() => setFilter('low')} />
          <Chip label={offCount ? t('Hidden · {n}', { n: offCount }) : t('Hidden')} leftIcon="visibility_off" selected={filter === 'off'} onClick={() => setFilter('off')} />
        </div>
        {all.length === 0 && <Empty icon="inventory_2" title={t('No items yet')} text={t('Add your first item. It appears in the customer catalogue right away.')} />}
        {all.length > 0 && items.length === 0 && <Empty icon="task_alt" title={filter === 'low' ? t('Nothing low on stock') : t('Nothing hidden')} />}
        {items.map(it => {
          const out = it.stock === 0, low = it.stock > 0 && it.stock <= 3;
          return (
            <div key={it.id} className="card flat" style={{ padding: '10px 12px 10px 12px', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {it.photoUrl ? <img className="thumb" src={it.photoUrl} alt="" onClick={() => openEdit(it)} style={{ cursor: 'pointer' }} /> : <div className="thumb" onClick={() => openEdit(it)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="image" size={20} color="var(--icon)" /></div>}
              <div className="grow" role="button" tabIndex={0} onClick={() => openEdit(it)} onKeyDown={e => { if (e.key === 'Enter') openEdit(it); }} style={{ cursor: 'pointer', minWidth: 0 }}>
                <div className="b ellip">{it.name}</div>
                <div className="cap">{it.unit} · ₹{it.price} · {t(it.cat)}</div>
                <div style={{ marginTop: 4 }}>
                  {out ? <StatusChip status="ended" label={t('Out of stock')} /> : low ? <StatusChip status="caution" label={t('Low stock · {n}', { n: it.stock })} /> : <span className="cap">{t('{n} in stock', { n: it.stock })}</span>}
                </div>
              </div>
              {(out || low) && <Button variant="outlined" color="primary" size="small" icon="add_box" onClick={() => restock(it)}>{t('Restock')}</Button>}
              <Toggle checked={it.on} onChange={on => toggle(it, on)} />
            </div>
          );
        })}
      </Body>
      <Sheet open={sheet === 'add'} onClose={close} title={t('Add item')}>
        {form}
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{t('Save item')}</Button>
      </Sheet>
      <Sheet open={sheet === 'edit'} onClose={close} title={t('Edit item')}>
        {form}
        <Button color="primary" size="tall" fullWidth onClick={save} loading={busy}>{t('Save changes')}</Button>
        {confirmDel
          ? <div className="col"><div className="cap13" style={{ textAlign: 'center' }}>{t('Remove {name} from your catalogue?', { name: editing?.name ?? '' })}</div><Button color="warn" fullWidth onClick={remove} loading={busy}>{t('Yes, remove it')}</Button><Button variant="text" fullWidth onClick={() => setConfirmDel(false)}>{t('Keep it')}</Button></div>
          : <Button variant="text" color="warn" fullWidth icon="delete" onClick={() => setConfirmDel(true)}>{t('Remove item')}</Button>}
      </Sheet>
    </>
  );
}
