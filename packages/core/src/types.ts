// GetMe domain types — shared by the API and the three role apps.

export type Role = 'customer' | 'partner' | 'shop';
export type OrderKind = 'list' | 'shop' | 'parcel';
export type DispatchMode = 'broadcast' | 'offers' | 'choose';
export type PayMethod = 'cod' | 'upi' | 'card' | 'wallet';
export type Vehicle = 'Bike' | 'Scooter' | 'Cycle';

/** Order lifecycle. `expired` is a terminal state reached when no partner is found in time. */
export type OrderStatus =
  | 'requesting'
  | 'counter'
  | 'to_shop'
  | 'shopping'
  | 'to_customer'
  | 'arrived'
  | 'delivered'
  | 'cancelled'
  | 'expired';

/** Shop-side lifecycle for catalogue orders. Runs beside the partner lifecycle. */
export type ShopOrderStatus = 'new' | 'preparing' | 'ready' | 'handed' | 'done' | 'cancelled';

export const TERMINAL: ReadonlySet<OrderStatus> = new Set(['delivered', 'cancelled', 'expired']);
export const ACTIVE: ReadonlySet<OrderStatus> = new Set(['to_shop', 'shopping', 'to_customer', 'arrived']);
export const OPEN: ReadonlySet<OrderStatus> = new Set(['requesting', 'counter']);

export interface LatLng { lat: number; lng: number }

export interface Address extends LatLng {
  id?: string;
  label: string;        // Home, Work, …
  line: string;         // "12, 27th Main, HSR Layout Sector 2"
  area?: string;        // "HSR Layout, Sector 2"
}

export interface OrderItem {
  name: string;
  qty: number;
  unit: string;               // "1 kg" — empty for free-text list items
  price: number | null;       // null until the partner buys it (list orders)
  itemId?: string;            // catalogue item id for shop orders
  bought?: boolean;           // partner checklist
  unavailable?: boolean;      // partner could not find it
  substitute?: string | null; // what the partner bought instead (requires order.subs)
}

export interface Offer { partnerId: string; partnerName: string; price: number; etaMin: number; at: string }
export interface Counter { partnerId: string; partnerName: string; amount: number; reason: string; at: string }

export interface Fee {
  delivery: number;
  service: number;
  extra: number;
  extraReason: string;
  insure: number;
  surge: number; // multiplier already applied to delivery, kept for display (1 = none)
}

export interface Receiver { name: string; phone: string }

export interface Order {
  id: string;
  kind: OrderKind;
  customerId: string;
  customerName: string;
  anon: boolean;
  shopId: string | null;
  shopName: string;      // "Any nearby shop" / shop name / "Pickup · Home"
  shopPos: LatLng | null; // shop or pickup location (null = any nearby shop until partner picks)
  items: OrderItem[];
  itemsTotal: number | null; // known for shop orders, null for lists until bought
  address: Address;           // drop / customer
  pickup: Address | null;     // parcel pickup
  mode: DispatchMode;
  pay: PayMethod;
  promoCode: string | null;
  promo: number;              // discount amount
  when: 'now' | 'schedule';
  slot: string | null;
  scheduledAt: string | null; // ISO when a scheduled order should dispatch
  budget: number | null;
  subs: boolean;              // substitutes allowed
  repeat: boolean;            // weekly subscription created from this order
  note: string;
  receiver: Receiver | null;
  pkType: string | null;
  pkSize: string | null;
  status: OrderStatus;
  courierId: string | null;
  courierName: string | null;
  chosenId: string | null;    // choose mode: partner the request is addressed to
  offers: Offer[];
  counter: Counter | null;
  declinedIds: string[];
  seenIds: string[];
  fee: Fee;
  itemCost: number | null;    // what the partner paid (list orders)
  receiptUrl: string | null;
  pickupPhotoUrl: string | null;
  otp: string;                // handover code — only ever sent to the customer (and receiver)
  cashCollected: boolean;
  tip: number;
  rating: { stars: number; tags: string[] } | null;          // customer → partner
  customerRating: number | null;                              // partner → customer
  issue: string | null;
  refund: { amount: number; status: 'requested' | 'approved' | 'rejected' } | null;
  cancelReason: string | null;
  cancelledBy: Role | 'system' | null;
  times: Partial<Record<OrderStatus, string>>;
  searchRadiusKm: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShopItem {
  id: string;
  shopId: string;
  name: string;
  unit: string;
  price: number;
  cat: string;
  stock: number;
  on: boolean;
}

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  cat: string;
  address: string;
  hours: string;
  pos: LatLng;
  open: boolean;
  gstin: string | null;
  items: ShopItem[];
  rating: number;
  createdAt: string;
}

export interface Partner {
  id: string;
  userId: string;
  name: string;
  initials: string;
  vehicle: Vehicle;
  plate: string;
  rating: number;
  trips: number;
  online: boolean;
  pos: LatLng | null;
  posAt: string | null;
  area: string;
  verified: boolean;
  activeOrderId: string | null;
  floatLimit: number; // max item cost the partner may front
}

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string | null;
  lang: 'en' | 'kn' | 'hi';
  pushEnabled: boolean;
  referralCode: string;
  createdAt: string;
}

export interface Message {
  id: string;
  orderId: string;
  from: Role;
  type: 'text' | 'photo' | 'location';
  text: string;
  pos?: LatLng | null;
  at: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  label: string;
  weekday: number; // 0–6
  slot: string;    // "around 9:12 am" or a slot label
  template: Pick<Order, 'kind' | 'items' | 'shopId' | 'shopName' | 'mode' | 'pay' | 'address' | 'subs' | 'note' | 'budget'>;
  active: boolean;
  nextRunAt: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  orderId: string | null;
  kind: 'topup' | 'charge' | 'refund' | 'payout' | 'reimburse' | 'cod_due' | 'tip' | 'bonus';
  amount: number; // positive = credit to the user
  note: string;
  at: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  at: string;
}

export type OrderEvent =
  | { type: 'order.created'; order: Order }
  | { type: 'order.updated'; order: Order }
  | { type: 'order.gone'; orderId: string; reason: string }
  | { type: 'offer.added'; orderId: string; offer: Offer }
  | { type: 'counter.proposed'; orderId: string; counter: Counter }
  | { type: 'counter.answered'; orderId: string; approved: boolean }
  | { type: 'order.assigned'; orderId: string; partnerId: string }
  | { type: 'status.changed'; orderId: string; status: OrderStatus }
  | { type: 'location.updated'; orderId: string | null; partnerId: string; pos: LatLng }
  | { type: 'message.sent'; message: Message }
  | { type: 'order.cancelled'; orderId: string; by: Role | 'system' }
  | { type: 'order.completed'; orderId: string }
  | { type: 'notify'; title: string; body: string; orderId: string | null }
  | { type: 'shop.updated'; shop: Shop }
  | { type: 'wallet.updated'; balance: number }
  | { type: 'partner.updated'; partner: Partner };
