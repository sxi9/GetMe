// GetMe prototype — seed data + pure helpers (shared by the GetMe DC logic class)
export const SHOPS = [
  { id: 'nandini', name: "Nandini's Fresh Mart", cat: 'Grocery & vegetables', dist: '0.6 km', eta: '15–20 min', fee: 35, open: true, items: [
    { id: 'n1', name: 'Tomato', unit: '1 kg', price: 40, cat: 'Vegetables', stock: 24, on: true },
    { id: 'n2', name: 'Onion', unit: '1 kg', price: 35, cat: 'Vegetables', stock: 30, on: true },
    { id: 'n3', name: 'Coriander', unit: '1 bunch', price: 10, cat: 'Vegetables', stock: 12, on: true },
    { id: 'n4', name: 'Amul milk', unit: '500 ml', price: 29, cat: 'Dairy', stock: 18, on: true },
    { id: 'n5', name: 'Curd', unit: '400 g', price: 35, cat: 'Dairy', stock: 9, on: true },
    { id: 'n6', name: 'Eggs', unit: '6 pcs', price: 48, cat: 'Dairy', stock: 3, on: true },
    { id: 'n7', name: 'Basmati rice', unit: '1 kg', price: 120, cat: 'Staples', stock: 15, on: true },
    { id: 'n8', name: 'Toor dal', unit: '1 kg', price: 150, cat: 'Staples', stock: 0, on: false } ] },
  { id: 'balaji', name: 'Sri Balaji Vegetables', cat: 'Vegetables & fruit', dist: '0.9 km', eta: '20–25 min', fee: 40, open: true, items: [
    { id: 'b1', name: 'Potato', unit: '1 kg', price: 30, cat: 'Vegetables', stock: 40, on: true },
    { id: 'b2', name: 'Banana', unit: '6 pcs', price: 36, cat: 'Fruit', stock: 20, on: true },
    { id: 'b3', name: 'Spinach', unit: '1 bunch', price: 15, cat: 'Vegetables', stock: 10, on: true },
    { id: 'b4', name: 'Green chilli', unit: '100 g', price: 12, cat: 'Vegetables', stock: 25, on: true } ] },
  { id: 'apollo', name: 'Apollo Pharmacy', cat: 'Pharmacy', dist: '1.1 km', eta: '20–30 min', fee: 45, open: true, items: [
    { id: 'a1', name: 'Paracetamol 500 mg', unit: '10 tabs', price: 22, cat: 'Medicines', stock: 50, on: true },
    { id: 'a2', name: 'ORS sachets', unit: '5 pcs', price: 60, cat: 'Medicines', stock: 14, on: true },
    { id: 'a3', name: 'Adhesive bandages', unit: '10 pcs', price: 45, cat: 'First aid', stock: 9, on: true } ] },
  { id: 'krishna', name: 'Krishna Bakery', cat: 'Bakery', dist: '1.4 km', eta: '25–30 min', fee: 50, open: false, items: [
    { id: 'k1', name: 'Whole wheat bread', unit: '400 g', price: 45, cat: 'Bakery', stock: 8, on: true },
    { id: 'k2', name: 'Butter biscuits', unit: '200 g', price: 60, cat: 'Bakery', stock: 12, on: true } ] },
];

export const PARTNERS = [
  { id: 'ravi', name: 'Ravi Kumar', initials: 'RK', vehicle: 'Bike', rating: 4.8, trips: 1240, dist: '1.2 km', eta: 12 },
  { id: 'fathima', name: 'Fathima B', initials: 'FB', vehicle: 'Cycle', rating: 4.9, trips: 860, dist: '0.8 km', eta: 14 },
  { id: 'arjun', name: 'Arjun S', initials: 'AS', vehicle: 'Scooter', rating: 4.6, trips: 2105, dist: '2.0 km', eta: 9 },
  { id: 'manoj', name: 'Manoj P', initials: 'MP', vehicle: 'Bike', rating: 4.5, trips: 430, dist: '2.6 km', eta: 18 },
];

export const HISTORY = [
  { id: 'GM-2037', date: 'Yesterday', shopName: 'Sri Balaji Vegetables', count: 5, total: 412, status: 'Delivered', chip: 'success', courier: 'Fathima B' },
  { id: 'GM-2029', date: '8 Nov', shopName: 'Shopping list · any nearby shop', count: 3, total: 286, status: 'Delivered', chip: 'success', courier: 'Ravi Kumar' },
  { id: 'GM-2014', date: '2 Nov', shopName: 'Apollo Pharmacy', count: 2, total: 0, status: 'Cancelled', chip: 'ended', courier: '' },
];

export const SHOP_ORDERS = [
  { id: 'GM-2040', customer: 'Imran S', items: [{ name: 'Amul milk', qty: 2 }, { name: 'Eggs', qty: 1 }], total: 106, status: 'ready', t: '9:12 am', courier: 'Manoj P' },
  { id: 'GM-2039', customer: 'Meera K', items: [{ name: 'Tomato', qty: 2 }, { name: 'Onion', qty: 1 }, { name: 'Coriander', qty: 2 }], total: 135, status: 'preparing', t: '9:05 am', courier: 'Arjun S' },
  { id: 'GM-2036', customer: 'Karthik N', items: [{ name: 'Basmati rice', qty: 1 }], total: 120, status: 'done', t: '8:40 am', courier: 'Fathima B' },
];

export const TRIPS = [
  { id: 'GM-2035', label: "Nandini's Fresh Mart → Koramangala 4th Block", amt: 55, t: '8:52 am' },
  { id: 'GM-2031', label: 'Shopping list · 4 items → HSR Sector 1', amt: 80, t: '8:10 am' },
  { id: 'GM-2027', label: 'Apollo Pharmacy → Agara', amt: 45, t: '7:35 am' },
];

export const ROUTE_SHOP = [[160, 206], [160, 186], [78, 186]];
export const ROUTE_HOME = [[78, 186], [78, 124], [206, 124], [206, 64], [318, 64]];
export const routeD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
export const OTP = '4821';
export const SLOTS = ['Today 6–7 pm', 'Today 8–9 pm', 'Tomorrow 9–10 am'];
export const EXTRAS = [20, 30, 50, 80];
export const REASONS = ['Heavy items', 'Far pickup', 'Rain', 'Peak hours'];
export const TIPS = [0, 10, 20, 50];
export const TAGS = ['On time', 'Polite', 'Careful with items', 'Good updates'];
export const CATS = ['Vegetables', 'Fruit', 'Dairy', 'Staples', 'Bakery', 'Other'];
export const MODES = [
  { id: 'broadcast', label: 'Broadcast to partners nearby', caption: 'First partner to accept takes it. Fastest.' },
  { id: 'offers', label: 'Get offers', caption: 'Partners send a price and ETA. You pick one.' },
  { id: 'choose', label: 'Choose a partner', caption: 'Pick from partners nearby by rating and distance.' },
];
export const PAYS = [
  { id: 'cod', label: 'Cash on delivery', caption: 'Pay the partner when items arrive' },
  { id: 'upi', label: 'UPI', caption: 'priya@okaxis' },
  { id: 'card', label: 'Card', caption: 'HDFC •••• 4421' },
  { id: 'wallet', label: 'GetMe wallet', caption: 'Balance ₹350' },
];
export const PAY_LABEL = { cod: 'Cash on delivery', upi: 'UPI · priya@okaxis', card: 'Card •••• 4421', wallet: 'GetMe wallet' };
export const STATUS_LABEL = { requesting: 'Finding a partner', counter: 'Extra fee requested', to_shop: 'Partner heading to the shop', shopping: 'Buying your items', to_customer: 'On the way to you', arrived: 'Partner at your door', delivered: 'Delivered', cancelled: 'Cancelled' };
export const SEQ = ['requesting', 'counter', 'to_shop', 'shopping', 'to_customer', 'arrived', 'delivered'];
export const C_STEPS = [['Heading to the shop', 'to_shop'], ['Buying your items', 'shopping'], ['On the way to you', 'to_customer'], ['Arrived', 'arrived'], ['Delivered', 'delivered']];
export const D_STEPS = [['To shop', 'to_shop'], ['Shopping', 'shopping'], ['To customer', 'to_customer'], ['Handover', 'arrived']];

export const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');
export const nowStr = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const posAlong = (pts, t) => {
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(L); total += L; }
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, dist / segs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    dist -= segs[i];
  }
  return pts[pts.length - 1];
};

export const TEMPLATES = [
  { label: 'Weekly veggies', items: ['Tomato 1 kg', 'Onion 1 kg', 'Potato 1 kg', 'Coriander'] },
  { label: 'Breakfast basics', items: ['Bread', 'Eggs 6 pcs', 'Milk 500 ml', 'Butter 100 g'] },
  { label: 'Medicines', items: ['Paracetamol 500 mg', 'ORS sachets'] },
];
export const PK_TYPES = ['Documents', 'Keys', 'Food box', 'Clothes', 'Fragile'];
export const PK_SIZES = [['Small', 49, 'Fits a bag · up to 3 kg'], ['Medium', 69, 'Box · up to 8 kg'], ['Large', 99, 'Needs a carrier · up to 15 kg']];
export const P_STEPS = [['Heading to the pickup', 'to_shop'], ['Package picked up', 'shopping'], ['On the way to the receiver', 'to_customer'], ['Arrived at the receiver', 'arrived'], ['Delivered', 'delivered']];

export const C0 = { screen: 'login', loginMode: 'phone', phone: '98450 12345', phoneErr: '', otp: '', otpErr: '', email: '', pw: '', pwErr: '', search: '', newItem: '', list: [], source: 'any', when: 'now', slot: SLOTS[0], budget: '', cart: {}, cartShop: null, coKind: 'list', mode: 'broadcast', pay: 'upi', promo: '', promoApplied: false, promoMsg: '', chatText: '', unread: 0, calling: false, cancelDlg: false, tip: 20, stars: 5, tags: [], notif: true, toast: '', listNote: '', subs: true, anon: false, pkDrop: 'Koramangala 4th Block, near Forum mall', pkName: '', pkPhone: '', pkType: 'Documents', pkSize: 'Small', pkNote: '', pkInsure: false, repeat: false, favs: ['fathima'], sos: false, topup: false, topupAmt: 500, issue: '', lang: 'English', listening: false };
export const D0 = { screen: 'home', phone: '99860 44112', otp: '', otpErr: '', online: true, extra: 30, reason: 'Heavy items', offerPrice: '55', offerEta: '12', offerSent: false, declined: false, checked: {}, itemCost: '', costErr: '', receipt: false, otpInput: '', otpError: '', cash: false, chatText: '', unread: 0, calling: false, custStars: 5, ratedCustomer: false, toast: '', sos: false };
export const S0 = { screen: 'orders', phone: '98860 71234', otp: '', otpErr: '', showAdd: false, nName: '', nPrice: '', nUnit: '', nStock: '', nCat: 'Vegetables', nErr: '', toast: '' };

export const LANGS = ['English', 'ಕನ್ನಡ', 'हिन्दी'];
export const ISSUES = ['Missing item', 'Wrong item', 'Damaged', 'Partner behaviour'];
export const TOPUPS = [200, 500, 1000];
