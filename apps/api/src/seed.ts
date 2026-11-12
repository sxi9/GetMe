// Seed data from the design handoff (design/getme-data.js), turned into real records.
import { DEFAULT_FLOAT_LIMIT, deliveryFeeForKm, haversineKm, initials, type Partner, type Shop, type User } from '@getme/core';
import type { Db } from './db.js';
import { now, uid } from './ids.js';

export const HOME = { lat: 12.9121, lng: 77.6446 }; // HSR Layout Sector 2
export const KORAMANGALA = { lat: 12.9339, lng: 77.6210 };

const SHOPS = [
  { id: 'nandini', name: "Nandini's Fresh Mart", cat: 'Grocery & vegetables', address: '27th Main, HSR Layout Sector 2', hours: '7 am – 10 pm', pos: { lat: 12.9165, lng: 77.6480 }, gstin: '29ABCDE1234F1Z5', items: [
    ['Tomato', '1 kg', 40, 'Vegetables', 24], ['Onion', '1 kg', 35, 'Vegetables', 30], ['Coriander', '1 bunch', 10, 'Vegetables', 12], ['Amul milk', '500 ml', 29, 'Dairy', 18],
    ['Curd', '400 g', 35, 'Dairy', 9], ['Eggs', '6 pcs', 48, 'Dairy', 3], ['Basmati rice', '1 kg', 120, 'Staples', 15], ['Toor dal', '1 kg', 150, 'Staples', 0] ] },
  { id: 'balaji', name: 'Sri Balaji Vegetables', cat: 'Vegetables & fruit', address: '24th Main, HSR Layout', hours: '6 am – 9 pm', pos: { lat: 12.9185, lng: 77.6395 }, gstin: null, items: [
    ['Potato', '1 kg', 30, 'Vegetables', 40], ['Banana', '6 pcs', 36, 'Fruit', 20], ['Spinach', '1 bunch', 15, 'Vegetables', 10], ['Green chilli', '100 g', 12, 'Vegetables', 25] ] },
  { id: 'apollo', name: 'Apollo Pharmacy', cat: 'Pharmacy', address: '19th Main, HSR Layout Sector 1', hours: '8 am – 11 pm', pos: { lat: 12.9040, lng: 77.6385 }, gstin: '29AAACA1234A1Z1', items: [
    ['Paracetamol 500 mg', '10 tabs', 22, 'Medicines', 50], ['ORS sachets', '5 pcs', 60, 'Medicines', 14], ['Adhesive bandages', '10 pcs', 45, 'First aid', 9] ] },
  { id: 'krishna', name: 'Krishna Bakery', cat: 'Bakery', address: 'Agara main road', hours: '8 am – 8 pm', pos: { lat: 12.9230, lng: 77.6520 }, gstin: null, items: [
    ['Whole wheat bread', '400 g', 45, 'Bakery', 8], ['Butter biscuits', '200 g', 60, 'Bakery', 12] ] },
];

const PARTNERS: { id: string; name: string; phone: string; vehicle: Partner['vehicle']; plate: string; rating: number; trips: number; pos: { lat: number; lng: number } }[] = [
  { id: 'ravi', name: 'Ravi Kumar', phone: '9986044112', vehicle: 'Bike', plate: 'KA 05 MJ 4521', rating: 4.8, trips: 1240, pos: { lat: 12.9080, lng: 77.6500 } },
  { id: 'fathima', name: 'Fathima B', phone: '9986044113', vehicle: 'Cycle', plate: '', rating: 4.9, trips: 860, pos: { lat: 12.9150, lng: 77.6400 } },
  { id: 'arjun', name: 'Arjun S', phone: '9986044114', vehicle: 'Scooter', plate: 'KA 03 HR 8812', rating: 4.6, trips: 2105, pos: { lat: 12.9250, lng: 77.6350 } },
  { id: 'manoj', name: 'Manoj P', phone: '9986044115', vehicle: 'Bike', plate: 'KA 51 AB 1234', rating: 4.5, trips: 430, pos: { lat: 12.8950, lng: 77.6600 } },
];

export function seed(db: Db) {
  if (db.getMeta('seeded')) return;
  const t = now();
  const user = (id: string, role: User['role'], name: string, phone: string, email: string | null = null): User =>
    ({ id, role, name, phone, email, lang: 'en', pushEnabled: true, referralCode: name.split(' ')[0].toUpperCase() + '50', createdAt: t });

  // customer
  const priya = user('u_priya', 'customer', 'Priya Menon', '9845012345', 'priya@example.com');
  db.putUser(priya);
  db.putAddress(priya.id, { id: 'addr_home', label: 'Home', line: '12, 27th Main, HSR Layout Sector 2', area: 'HSR Layout, Sector 2', ...HOME });
  db.putAddress(priya.id, { id: 'addr_work', label: 'Work', line: 'Prestige Tech Park, Kadubeesanahalli', area: 'Marathahalli', lat: 12.9353, lng: 77.6975 });
  db.putLedger({ id: uid('l_'), userId: priya.id, orderId: null, kind: 'topup', amount: 350, note: 'Welcome balance', at: t });
  db.toggleFavourite(priya.id, 'fathima');

  // shops + owners
  for (const s of SHOPS) {
    const owner = user('u_shop_' + s.id, 'shop', s.name + ' owner', s.id === 'nandini' ? '9886071234' : '98860712' + String(SHOPS.indexOf(s) + 40));
    db.putUser(owner);
    const shop: Shop = { id: s.id, ownerId: owner.id, name: s.name, cat: s.cat, address: s.address, hours: s.hours, pos: s.pos, open: s.id !== 'krishna', gstin: s.gstin, rating: 4.4, createdAt: t,
      items: s.items.map(([name, unit, price, cat, stock], i) => ({ id: s.id[0] + (i + 1), shopId: s.id, name: name as string, unit: unit as string, price: price as number, cat: cat as string, stock: stock as number, on: (stock as number) > 0 })) };
    db.putShop(shop);
  }

  // partners
  for (const p of PARTNERS) {
    const u = user('u_' + p.id, 'partner', p.name, p.phone);
    db.putUser(u);
    const partner: Partner = { id: p.id, userId: u.id, name: p.name, initials: initials(p.name), vehicle: p.vehicle, plate: p.plate, rating: p.rating, trips: p.trips, online: p.id !== 'ravi', pos: p.pos, posAt: t, area: 'HSR Layout', verified: true, activeOrderId: null, floatLimit: DEFAULT_FLOAT_LIMIT };
    db.putPartner(partner);
    db.putLedger({ id: uid('l_'), userId: u.id, orderId: null, kind: 'payout', amount: 0, note: 'Account opened', at: t });
  }
  db.setMeta('order_no', '2040');
  db.setMeta('seeded', t);
}

export function shopDistanceKm(shop: Shop, from: { lat: number; lng: number }) { return haversineKm(shop.pos, from); }
export function shopFee(shop: Shop, from: { lat: number; lng: number }) { return deliveryFeeForKm(shopDistanceKm(shop, from)); }
