export const digits = (s: string) => (s || '').replace(/\D/g, '');
export const validPhone = (s: string) => digits(s).length === 10;
export const validOtp = (s: string) => /^\d{4}$/.test((s || '').trim());
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
export const validPassword = (s: string) => (s || '').length >= 4;
export const validCost = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
export function validateParcel(p: { drop?: string; receiverName?: string; receiverPhone?: string }): string | null {
  if (!(p.drop || '').trim()) return 'Enter the drop address';
  if (!(p.receiverName || '').trim()) return 'Enter the receiver name';
  if (p.receiverPhone && !validPhone(p.receiverPhone)) return 'Enter a 10-digit receiver number';
  return null;
}
export function validateShopItem(i: { name?: string; price?: unknown }): string | null {
  if (!(i.name || '').trim()) return 'Name and price are required';
  if (!validCost(Number(i.price))) return 'Name and price are required';
  return null;
}
