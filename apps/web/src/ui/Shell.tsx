import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './Button';

/** Navy chrome header. */
export function Header({ title, onBack, children, right, subtitle }: { title?: ReactNode; subtitle?: ReactNode; onBack?: () => void; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="chrome">
      {onBack && <button className="chrome-btn" onClick={onBack} aria-label="Back"><Icon name="arrow_back" size={22} /></button>}
      {children ?? <div className="grow"><div className="title ellip">{title}</div>{subtitle && <div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }}>{subtitle}</div>}</div>}
      {right}
    </div>
  );
}
export function Body({ children, tight, style, pad = true }: { children: ReactNode; tight?: boolean; style?: React.CSSProperties; pad?: boolean }) {
  return <div className={'body' + (tight ? ' tight' : '')} style={{ ...(pad ? {} : { padding: 0 }), ...style }}>{children}</div>;
}
export function TabBar({ tabs, active, onChange, badges = {} }: { tabs: { id: string; label: string; icon: string }[]; active: string; onChange: (id: string) => void; badges?: Record<string, number> }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map(t => <button key={t.id} className={'tab' + (active === t.id ? ' active' : '')} onClick={() => onChange(t.id)} aria-current={active === t.id ? 'page' : undefined}><span style={{ position: 'relative' }}><Icon name={t.icon} size={24} filled={active === t.id} />{badges[t.id] ? <span className="badge">{badges[t.id]}</span> : null}</span>{t.label}</button>)}
    </nav>
  );
}
export function TopTabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return <div className="toptabs" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={active === t.id} className={'toptab' + (active === t.id ? ' active' : '')} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={e => e.stopPropagation()}>
        {title && <div className="between"><div className="h17">{title}</div><IconButton icon="close" label="Close" onClick={onClose} /></div>}
        {children}
      </div>
    </div>
  );
}
export function Toast({ text, title = 'GetMe · now', onClick, onDone, index = 0 }: { text: string; title?: string; onClick?: () => void; onDone: () => void; index?: number }) {
  const t = useRef<number | undefined>(undefined);
  useEffect(() => { window.clearTimeout(t.current); t.current = window.setTimeout(onDone, 4500 + index * 800); return () => window.clearTimeout(t.current); }, [text, onDone, index]);
  return (
    <div className="toast" role="status" style={{ position: 'relative', top: 'auto', left: 'auto', right: 'auto' }} onClick={() => { onClick?.(); onDone(); }}>
      <Icon name="notifications" size={20} color="var(--brand-primary-rest)" />
      <div className="grow"><div style={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div><div style={{ fontSize: 13, lineHeight: '18px' }}>{text}</div></div>
    </div>
  );
}
export function SegmentStepper({ steps, index }: { steps: string[]; index: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="stepper">{steps.map((_, i) => <div key={i} className={'seg' + (i <= index ? ' done' : '')} />)}</div>
      <div style={{ display: 'flex' }}>{steps.map((s, i) => <div key={s} style={{ flex: 1, fontSize: 11, lineHeight: '14px', color: i === index ? 'var(--brand-primary-rest)' : 'var(--text-secondary)', fontWeight: i === index ? 600 : 400, textAlign: i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center' }}>{s}</div>)}</div>
    </div>
  );
}
export function Timeline({ steps, index, times }: { steps: { label: string; key: string }[]; index: number; times: Record<string, string | undefined> }) {
  return (
    <div className="timeline">
      {steps.map((s, i) => (
        <div key={s.key} className="step">
          <div className="dot"><div className={'c' + (i < index ? ' done' : i === index ? ' cur' : '')} />{i < steps.length - 1 && <div className={'l' + (i < index ? ' done' : '')} />}</div>
          <div className="grow" style={{ paddingBottom: 12 }}><div style={{ fontWeight: i <= index ? 600 : 400, color: i <= index ? 'var(--text)' : 'var(--text-secondary)' }}>{s.label}</div>{times[s.key] && <div className="cap">{new Date(times[s.key]!).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>}</div>
        </div>
      ))}
    </div>
  );
}
export function Empty({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 16px', textAlign: 'center' }}><div className="tile" style={{ width: 48, height: 48 }}><Icon name={icon} size={26} /></div><div className="h16">{title}</div>{text && <div className="cap13">{text}</div>}</div>;
}
export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return <div className="col" style={{ gap: 8 }}><div className="between"><div className="h16">{title}</div>{right && <div className="cap">{right}</div>}</div>{children}</div>;
}
export function Money({ v, style }: { v: number; style?: React.CSSProperties }) { return <span className="mono" style={{ fontWeight: 600, ...style }}>{'₹' + Math.round(v).toLocaleString('en-IN')}</span>; }
export function Row({ icon, label, caption, right, onClick, chevron = !!onClick }: { icon?: string; label: ReactNode; caption?: ReactNode; right?: ReactNode; onClick?: () => void; chevron?: boolean }) {
  return (
    <div className={'item' + (onClick ? ' clickable' : '')} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={e => { if (onClick && e.key === 'Enter') onClick(); }}>
      {icon && <Icon name={icon} size={22} color="var(--icon)" />}
      <div className="grow"><div style={{ fontWeight: 600 }}>{label}</div>{caption && <div className="cap">{caption}</div>}</div>
      {right}{chevron && <Icon name="chevron_right" size={22} color="var(--icon)" />}
    </div>
  );
}
