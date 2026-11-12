// GetMe domain types — shared by the API and the three role apps.

export type Role = 'customer' | 'partner' | 'shop' | 'admin';
export type OrderKind = 'list' | 'shop' | 'parcel';
export type DispatchMode = 'broadcast' | 'offers' | 'choose' | 'run';
export type PayMethod = 'cod' | 'upi' | 'card' | 'wallet' | 'crypto';
export type Vehicle = 'Bike' | 'Scooter' | 'Cycle';

/** Order lifecycle. `expired` is a terminal state reached when no partner is found in time. */
export type OrderStatus =
  | 'scheduled'
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
/** Assigned but not started: orders attached to a partner's announced run. */
export const WAITING: ReadonlySet<OrderStatus> = new Set(['scheduled']);

export interface LatLng { lat: number; lng: number }

/** How the partner hands the order over at the door. */
export type Handoff = 'in_person' | 'gate' | 'leave_at_door';

export interface Address extends LatLng {
  id?: string;
  label: string;        // Home, Work, Current location, …
  line: string;         // "12, 27th Main, HSR Layout Sector 2" — or a landmark description in a village
  area?: string;        // "HSR Layout, Sector 2"
  landmark?: string;    // "opposite the temple", "blue gate after the bus stop"
  building?: string;    // apartment / society name
  tower?: string;       // "Tower B"
  floor?: string;       // "3rd floor"
  flat?: string;        // "B-304"
  gatePhotoUrl?: string | null; // photo of the door / gate so the partner recognises it
  directions?: string;  // free text or voice-to-text directions for the partner
  handoff?: Handoff;    // default in_person
  communityId?: string | null;
  source?: 'gps' | 'pin' | 'typed' | 'saved';
  accuracyM?: number;   // GPS accuracy when captured
}

/** Dispatch and pricing defaults for a kind of place. Snapshotted onto each order. */
export interface RegionProfile {
  id: string;
  name: string;           // "Bengaluru city", "Kodagu hills", "Village"
  kind: 'city' | 'town' | 'hill' | 'village';
  radiusKm: number[];     // search radius ladder
  expandEveryMs: number;
  expireAfterMs: number;
  deliveryBase: number;   // ₹
  deliveryPerKm: number;  // ₹/km
  deliveryMin: number;
  deliveryMax: number;
  surcharge: number;      // multiplier, e.g. 1.25 for hills
  defaultPay: PayMethod;
  defaultMode: DispatchMode;
  center: LatLng;
  coverageKm: number;     // profile applies within this distance of center
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
  runId: string | null;       // attached to a partner's announced run
  regionId: string;
  dispatch: { radiusKm: number[]; expandEveryMs: number; expireAfterMs: number };
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
  podPhotoUrl: string | null; // proof of delivery (required for leave_at_door / gate handoff)
  crypto: CryptoPayment | null; // set when pay === 'crypto' and the final bill is known
  idempotencyKeys: string[];  // client keys already applied (offline replay safety)
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
  photoUrl?: string | null;
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
  photoUrl: string | null;
  approved: boolean;
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

export type PartnerTier = 'runner' | 'pro';

export interface Partner {
  id: string;
  userId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  tier: PartnerTier;          // runner = neighbour doing a market trip (light KYC, low float); pro = full-time
  documents: { kind: 'id' | 'licence' | 'rc' | 'selfie'; url: string; at: string }[];
  verification: 'none' | 'pending' | 'verified' | 'rejected';
  verificationNote: string | null;
  communityId: string | null;
  activeRunId: string | null;
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
  photoUrl?: string | null;
  communityId?: string | null;
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

/** A partner's announced trip: "Going to Madikeri market at 9, taking orders till 8." Orders attach to it. */
export interface Run {
  id: string;
  partnerId: string;
  partnerName: string;
  label: string;            // "Madikeri market run"
  destination: string;      // where they are going
  destinationPos: LatLng | null;
  from: Address;            // where the run starts / returns to
  departAt: string;         // ISO
  cutoffAt: string;         // last time to attach an order
  capacity: number;         // max orders
  feePerOrder: number;      // flat delivery fee for the run
  communityId: string | null; // visible only to a community when set
  status: 'open' | 'closed' | 'in_progress' | 'done' | 'cancelled';
  orderIds: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** An apartment society or a village: members, runs and a notice board. */
export interface Community {
  id: string;
  name: string;
  kind: 'apartment' | 'village' | 'town';
  address: string;
  pos: LatLng;
  joinCode: string;
  adminIds: string[];
  memberCount: number;
  regionId: string;
  createdAt: string;
}
export interface Announcement {
  id: string;
  communityId: string;
  authorId: string;
  authorName: string;
  text: string;
  runId: string | null;
  at: string;
}

/** A stablecoin invoice for one order (or its tip). GetMe receives the crypto; partners and shops are settled in rupees. */
export type CryptoStatus = 'pending' | 'confirming' | 'paid' | 'expired' | 'failed';
export interface CryptoPayment {
  provider: 'sim' | 'nowpayments';
  invoiceId: string;
  purpose: 'order' | 'tip';
  currency: 'USDT' | 'USDC';
  network: string;          // e.g. "TRC20", "Polygon"
  amountInr: number;
  amountCrypto: number;     // in `currency`
  rateInr: number;          // INR per 1 unit at invoice time
  address: string;          // pay-to address
  payUrl: string | null;    // hosted checkout / wallet deep link
  status: CryptoStatus;
  txHash: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
}

export interface PushSubscriptionRecord { userId: string; endpoint: string; keys: { p256dh: string; auth: string }; at: string }

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
  | { type: 'run.updated'; run: Run }
  | { type: 'announcement'; announcement: Announcement }
  | { type: 'shop.updated'; shop: Shop }
  | { type: 'wallet.updated'; balance: number }
  | { type: 'partner.updated'; partner: Partner };
