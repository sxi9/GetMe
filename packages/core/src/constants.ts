import type { DispatchMode, OrderStatus, PayMethod, RegionProfile } from './types.js';

export const SERVICE_FEE = 5;
export const INSURE_FEE = 9;
export const ANY_SHOP_BASE_KM = 1.2; // "Any nearby shop" is priced as a 1.2 km pickup → ₹45
export const DELIVERY_BASE = 25;
export const DELIVERY_PER_KM = 15;
export const DELIVERY_MIN = 30;
export const DELIVERY_MAX = 150;
export const SHOP_COMMISSION_RATE = 0.08; // platform takes 8% of catalogue items from the shop
export const DAILY_BONUS = { trips: 12, amount: 100 };
export const DEFAULT_FLOAT_LIMIT = 2000;

export const PK_SIZES: Record<string, { price: number; caption: string }> = {
  Small: { price: 49, caption: 'Fits a bag · up to 3 kg' },
  Medium: { price: 69, caption: 'Box · up to 8 kg' },
  Large: { price: 99, caption: 'Needs a carrier · up to 15 kg' },
};
export const PK_TYPES = ['Documents', 'Keys', 'Food box', 'Clothes', 'Fragile'];
export const SLOTS = ['Today 6–7 pm', 'Today 8–9 pm', 'Tomorrow 9–10 am'];
export const EXTRAS = [20, 30, 50, 80];
export const REASONS = ['Heavy items', 'Far pickup', 'Rain', 'Peak hours'];
export const TIPS = [0, 10, 20, 50];
export const TAGS = ['On time', 'Polite', 'Careful with items', 'Good updates'];
export const CATS = ['Vegetables', 'Fruit', 'Dairy', 'Staples', 'Bakery', 'Medicines', 'First aid', 'Other'];
export const ISSUES = ['Missing item', 'Wrong item', 'Damaged', 'Partner behaviour'];
export const TOPUPS = [200, 500, 1000];
export const LANGS: { id: 'en' | 'kn' | 'hi'; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'kn', label: 'ಕನ್ನಡ' },
  { id: 'hi', label: 'हिन्दी' },
];
export const TEMPLATES = [
  { label: 'Weekly veggies', items: ['Tomato 1 kg', 'Onion 1 kg', 'Potato 1 kg', 'Coriander'] },
  { label: 'Breakfast basics', items: ['Bread', 'Eggs 6 pcs', 'Milk 500 ml', 'Butter 100 g'] },
  { label: 'Medicines', items: ['Paracetamol 500 mg', 'ORS sachets'] },
];

export const MODES: { id: DispatchMode; label: string; caption: string }[] = [
  { id: 'broadcast', label: 'Broadcast to partners nearby', caption: 'First partner to accept takes it. Fastest.' },
  { id: 'offers', label: 'Get offers', caption: 'Partners send a price and ETA. You pick one.' },
  { id: 'choose', label: 'Choose a partner', caption: 'Pick from partners nearby by rating and distance.' },
  { id: 'run', label: 'Join a trip to town', caption: 'A partner is already going. Your order rides along for a flat fee.' },
];
export const HANDOFFS: { id: 'in_person' | 'gate' | 'leave_at_door'; label: string; caption: string }[] = [
  { id: 'in_person', label: 'Hand it to me', caption: 'Partner enters your 4-digit code at the door' },
  { id: 'gate', label: 'Leave at the gate / security', caption: 'Partner photographs the handover at the gate' },
  { id: 'leave_at_door', label: 'Leave at the door', caption: 'Partner photographs the delivery at your door' },
];
export const PAYS: { id: PayMethod; label: string }[] = [
  { id: 'cod', label: 'Cash on delivery' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'wallet', label: 'GetMe wallet' },
  { id: 'crypto', label: 'Crypto (USDT / USDC)' },
];
export const CRYPTO = { currencies: ['USDT', 'USDC'] as const, networks: { USDT: 'TRC20', USDC: 'Polygon' } as Record<string, string>, invoiceTtlMs: 30 * 60_000, fallbackRateInr: 84.5 };

export const STATUS_LABEL: Record<OrderStatus, string> = {
  scheduled: 'Riding along on a trip',
  requesting: 'Finding a partner',
  counter: 'Extra fee requested',
  to_shop: 'Partner heading to the shop',
  shopping: 'Buying your items',
  to_customer: 'On the way to you',
  arrived: 'Partner at your door',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  expired: 'No partner found',
};
export const PARCEL_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  to_shop: 'Partner heading to the pickup',
  shopping: 'Package picked up',
  to_customer: 'On the way to the receiver',
  arrived: 'Partner at the receiver',
};

export const C_STEPS: [string, OrderStatus][] = [
  ['Heading to the shop', 'to_shop'], ['Buying your items', 'shopping'], ['On the way to you', 'to_customer'], ['Arrived', 'arrived'], ['Delivered', 'delivered'],
];
export const P_STEPS: [string, OrderStatus][] = [
  ['Heading to the pickup', 'to_shop'], ['Package picked up', 'shopping'], ['On the way to the receiver', 'to_customer'], ['Arrived at the receiver', 'arrived'], ['Delivered', 'delivered'],
];
export const D_STEPS: [string, OrderStatus][] = [['To shop', 'to_shop'], ['Shopping', 'shopping'], ['To customer', 'to_customer'], ['Handover', 'arrived']];

/** Region profiles: how far to look, how long to wait, what to charge. The API picks one by distance from its center. */
export const REGIONS: RegionProfile[] = [
  { id: 'blr-city', name: 'Bengaluru city', kind: 'city', radiusKm: [2, 4, 6], expandEveryMs: 60_000, expireAfterMs: 5 * 60_000, deliveryBase: 25, deliveryPerKm: 15, deliveryMin: 30, deliveryMax: 150, surcharge: 1, defaultPay: 'upi', defaultMode: 'broadcast', center: { lat: 12.9716, lng: 77.5946 }, coverageKm: 25 },
  { id: 'town', name: 'Small town', kind: 'town', radiusKm: [5, 10, 15], expandEveryMs: 5 * 60_000, expireAfterMs: 60 * 60_000, deliveryBase: 30, deliveryPerKm: 12, deliveryMin: 40, deliveryMax: 300, surcharge: 1, defaultPay: 'cod', defaultMode: 'broadcast', center: { lat: 0, lng: 0 }, coverageKm: 0 },
  { id: 'hill', name: 'Hill station', kind: 'hill', radiusKm: [8, 15, 25], expandEveryMs: 10 * 60_000, expireAfterMs: 4 * 60 * 60_000, deliveryBase: 40, deliveryPerKm: 14, deliveryMin: 60, deliveryMax: 500, surcharge: 1.25, defaultPay: 'cod', defaultMode: 'run', center: { lat: 12.4244, lng: 75.7382 }, coverageKm: 60 },
  { id: 'village', name: 'Village', kind: 'village', radiusKm: [10, 20, 30], expandEveryMs: 15 * 60_000, expireAfterMs: 6 * 60 * 60_000, deliveryBase: 30, deliveryPerKm: 10, deliveryMin: 50, deliveryMax: 400, surcharge: 1, defaultPay: 'cod', defaultMode: 'run', center: { lat: 0, lng: 0 }, coverageKm: 0 },
];
export const DEFAULT_REGION_ID = 'village'; // outside every named region we assume the sparsest profile

export const PARTNER_TIERS: { id: 'runner' | 'pro'; label: string; caption: string; floatLimit: number }[] = [
  { id: 'runner', label: 'Community runner', caption: 'Take a few orders when you are going to town anyway. Phone + ID photo.', floatLimit: 1000 },
  { id: 'pro', label: 'Delivery partner', caption: 'Full-time. Licence, vehicle papers and a bank account.', floatLimit: 2000 },
];

/** Dispatch timing (ms). */
export const DISPATCH = {
  /** radius ladder for broadcast/offers: km after n expansions */
  radiusKm: [2, 4, 6],
  /** expand the radius every N ms while no partner has accepted */
  expandEveryMs: 60_000,
  /** give up and mark the order expired after this long in requesting/counter */
  expireAfterMs: 5 * 60_000,
  /** offers go stale after this long */
  offerTtlMs: 3 * 60_000,
  /** choose mode: chosen partner must answer within */
  chooseRespondMs: 60_000,
  /** how long a partner location is trusted */
  locationTtlMs: 2 * 60_000,
  /** max OTP attempts before the partner must call support */
  otpAttempts: 5,
};
