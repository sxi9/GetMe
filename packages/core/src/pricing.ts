import { ANY_SHOP_BASE_KM, DELIVERY_BASE, DELIVERY_MAX, DELIVERY_MIN, DELIVERY_PER_KM, INSURE_FEE, PK_SIZES, SERVICE_FEE, SHOP_COMMISSION_RATE } from './constants.js';
import type { Fee, Order, OrderItem, PayMethod, RegionProfile } from './types.js';

const round5 = (n: number) => Math.ceil(n / 5) * 5;

/** Delivery fee from the pickup→drop distance (km). Shops' listed fee is this formula on their distance. */
export function deliveryFeeForKm(km: number, surge = 1, region?: Pick<RegionProfile, 'deliveryBase' | 'deliveryPerKm' | 'deliveryMin' | 'deliveryMax' | 'surcharge'>): number {
  const base = region?.deliveryBase ?? DELIVERY_BASE, perKm = region?.deliveryPerKm ?? DELIVERY_PER_KM, min = region?.deliveryMin ?? DELIVERY_MIN, max = region?.deliveryMax ?? DELIVERY_MAX;
  const raw = (base + perKm * km) * (region?.surcharge ?? 1);
  return Math.max(min, Math.min(max, round5(raw * surge)));
}

export function listDeliveryFee(shopKm: number | null, surge = 1, region?: Parameters<typeof deliveryFeeForKm>[2]): number {
  return deliveryFeeForKm(shopKm ?? ANY_SHOP_BASE_KM, surge, region);
}

export function parcelDeliveryFee(size: string): number {
  return PK_SIZES[size]?.price ?? PK_SIZES.Small.price;
}

export interface Promo { code: string; discount: number; appliesTo: ('list' | 'shop' | 'parcel')[]; minDelivery?: number }
export const PROMOS: Promo[] = [
  { code: 'GETME20', discount: 20, appliesTo: ['list', 'shop'] },
  { code: 'FIRSTBOX', discount: 15, appliesTo: ['parcel'] },
];
export function promoFor(code: string | null | undefined, kind: 'list' | 'shop' | 'parcel', deliveryFee: number): { promo: Promo | null; discount: number; reason: string } {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return { promo: null, discount: 0, reason: '' };
  const p = PROMOS.find(x => x.code === c);
  if (!p) return { promo: null, discount: 0, reason: 'Code not valid' };
  if (!p.appliesTo.includes(kind)) return { promo: null, discount: 0, reason: 'Code does not apply to this order' };
  return { promo: p, discount: Math.min(p.discount, deliveryFee), reason: '' };
}

export function itemsTotal(items: OrderItem[]): number | null {
  if (items.some(i => i.price == null)) return null;
  return items.reduce((a, i) => a + (i.price ?? 0) * i.qty, 0);
}

export function makeFee(delivery: number, insure = 0, surge = 1): Fee {
  return { delivery, service: SERVICE_FEE, extra: 0, extraReason: '', insure: insure ? INSURE_FEE : 0, surge };
}

export interface Bill {
  items: number | null;
  known: boolean;
  delivery: number; service: number; extra: number; insure: number; promo: number;
  fees: number;
  total: number;        // fees + (items if known)
  totalLabel: string;   // "₹fees + items" when unknown
  itemsLabel: string;
}

export const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function bill(o: Pick<Order, 'fee' | 'promo' | 'itemCost' | 'itemsTotal' | 'kind'>): Bill {
  const items = o.kind === 'parcel' ? 0 : o.itemCost != null ? o.itemCost : o.itemsTotal;
  const known = items != null;
  const fees = o.fee.delivery + o.fee.service + o.fee.extra + (o.fee.insure || 0) - o.promo;
  const total = (known ? items! : 0) + fees;
  return {
    items, known, delivery: o.fee.delivery, service: o.fee.service, extra: o.fee.extra, insure: o.fee.insure, promo: o.promo, fees, total,
    totalLabel: known ? fmt(total) : fmt(fees) + ' + items',
    itemsLabel: o.kind === 'parcel' ? '—' : known ? fmt(items!) : 'Added after purchase',
  };
}

/**
 * Who pays whom when an order completes.
 * The partner keeps the full delivery fee, extra and tip. For list orders the
 * partner fronted the item cost and is reimbursed. On COD the partner holds all
 * the cash, so only the platform's share (service fee, insurance) is due back.
 */
export interface Settlement {
  pay: PayMethod;
  customerCharge: number;   // charged to UPI/card/wallet, or 0 for COD
  cashCollected: number;    // what the partner collected in cash (COD)
  partnerEarned: number;    // delivery + extra + tip (shown as "earned")
  partnerLedgerDelta: number; // net credit to the partner's GetMe balance
  shopPayout: number;       // catalogue orders: items minus commission
  platformRevenue: number;
}
export function settle(o: Pick<Order, 'fee' | 'promo' | 'itemCost' | 'itemsTotal' | 'kind' | 'pay' | 'tip' | 'shopId'>): Settlement {
  const b = bill(o);
  const items = b.items ?? 0;
  const partnerEarned = o.fee.delivery + o.fee.extra + o.tip;
  const partnerFronted = o.kind === 'list' ? items : 0; // for shop orders the shop is paid by the platform, not the partner
  const shopPayout = o.kind === 'shop' ? Math.round(items * (1 - SHOP_COMMISSION_RATE)) : 0;
  const platformFees = o.fee.service + o.fee.insure - o.promo + (o.kind === 'shop' ? items - shopPayout : 0);
  if (o.pay === 'cod') {
    const cash = b.total + o.tip;
    // partner holds cash; keeps earned + fronted, owes the rest to the platform
    const owed = cash - partnerEarned - partnerFronted;
    return { pay: o.pay, customerCharge: 0, cashCollected: cash, partnerEarned, partnerLedgerDelta: -owed, shopPayout, platformRevenue: platformFees };
  }
  return { pay: o.pay, customerCharge: b.total + o.tip, cashCollected: 0, partnerEarned, partnerLedgerDelta: partnerEarned + partnerFronted, shopPayout, platformRevenue: platformFees };
}
