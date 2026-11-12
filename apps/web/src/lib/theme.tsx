// Appearance: light, dark or follow the system. Applies the Vulpes dark tokens
// by setting data-zf-theme on <html>; persisted per device.
import { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n';
import { Chip, Icon } from '../ui';

export type Appearance = 'system' | 'light' | 'dark';
const KEY = 'getme.appearance';
const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function readAppearance(): Appearance { try { const v = localStorage.getItem(KEY) as Appearance | null; return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } }
export function resolveDark(a: Appearance = readAppearance()): boolean { return a === 'dark' || (a === 'system' && !!mq()?.matches); }
export function applyAppearance(a: Appearance = readAppearance()) {
  const dark = resolveDark(a);
  const el = document.documentElement;
  el.setAttribute('data-zf-theme', dark ? 'vulpes-dark' : 'vulpes-light');
  el.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0b1218' : '#002539');
}
/** Call once at startup: applies the saved choice and tracks the OS setting while on "system". */
export function initAppearance() {
  applyAppearance();
  mq()?.addEventListener?.('change', () => { if (readAppearance() === 'system') applyAppearance('system'); });
}
export function useAppearance() {
  const [appearance, set] = useState<Appearance>(readAppearance);
  const setAppearance = useCallback((a: Appearance) => { set(a); try { localStorage.setItem(KEY, a); } catch { /* ignore */ } applyAppearance(a); }, []);
  useEffect(() => { applyAppearance(appearance); }, [appearance]);
  return { appearance, setAppearance, dark: resolveDark(appearance) };
}
/** A settings row: "Appearance · Light / Dark / System" chips. Drop into any profile list. */
export function AppearanceRow() {
  const { t } = useT();
  const { appearance, setAppearance } = useAppearance();
  const opts: { id: Appearance; label: string; icon: string }[] = [{ id: 'light', label: t('Light'), icon: 'light_mode' }, { id: 'dark', label: t('Dark'), icon: 'dark_mode' }, { id: 'system', label: t('System'), icon: 'brightness_auto' }];
  return (
    <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="row" style={{ gap: 12 }}><Icon name="contrast" size={22} color="var(--icon)" /><div className="grow"><div className="b">{t('Appearance')}</div><div className="cap">{t('Dark mode is easier on the eyes at night and saves battery on OLED screens')}</div></div></div>
      <div className="wrap" style={{ paddingLeft: 34 }}>{opts.map(o => <Chip key={o.id} label={o.label} leftIcon={o.icon} selected={appearance === o.id} onClick={() => setAppearance(o.id)} />)}</div>
    </div>
  );
}
