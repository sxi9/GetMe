export { fmt } from './pricing.js';
export const timeStr = (iso: string | number | Date = new Date()) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const dateStr = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, t)) return 'Today';
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('');
export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
