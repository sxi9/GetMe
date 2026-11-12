import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Radio({ checked, label, caption, onChange, disabled, name }: { checked: boolean; label?: ReactNode; caption?: ReactNode; onChange: () => void; disabled?: boolean; name?: string }) {
  const id = useId();
  const accent = 'var(--brand-primary-rest)';
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input id={id} type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, flexShrink: 0, borderRadius: '50%', border: `2px solid ${checked ? accent : 'var(--surface-border-strong)'}`, transition: 'border-color .12s ease' }}>{checked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />}</span>
      {(label || caption) && <span style={{ display: 'flex', flexDirection: 'column' }}>{label && <span style={{ fontSize: 15, lineHeight: '22px', color: 'var(--text)' }}>{label}</span>}{caption && <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--text-secondary)' }}>{caption}</span>}</span>}
    </label>
  );
}
export function Checkbox({ checked, label, caption, onChange, disabled }: { checked: boolean; label?: ReactNode; caption?: ReactNode; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  const accent = 'var(--brand-primary-rest)';
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, flexShrink: 0, borderRadius: 2, border: `2px solid ${checked ? accent : 'var(--surface-border-strong)'}`, background: checked ? accent : 'transparent', transition: 'all .12s ease' }}>{checked && <Icon name="check" size={16} filled color="var(--text-on-fill)" />}</span>
      {(label || caption) && <span style={{ display: 'flex', flexDirection: 'column' }}>{label && <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text)' }}>{label}</span>}{caption && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{caption}</span>}</span>}
    </label>
  );
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden="true" style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, borderRadius: 999, background: checked ? 'var(--brand-primary-rest)' : 'var(--slider-off)', transition: 'background .15s ease' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'left .15s ease' }} />
      </span>
      {label && <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>}
    </label>
  );
}
/** A full-width toggle row: label + caption on the left, switch on the right. */
export function ToggleRow({ checked, onChange, label, caption, icon }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; caption?: ReactNode; icon?: string }) {
  return (
    <div className="between" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        {icon && <Icon name={icon} size={22} color="var(--icon)" />}
        <div className="grow"><div style={{ fontWeight: 600 }}>{label}</div>{caption && <div className="cap">{caption}</div>}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const btn = (icon: string, fn: () => void, dis: boolean) => <button type="button" disabled={dis} onClick={fn} aria-label={icon === 'add' ? 'Increase' : 'Decrease'} style={{ width: 32, height: 32, border: '1px solid var(--surface-border-strong)', background: 'var(--surface)', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: dis ? 'not-allowed' : 'pointer', color: dis ? 'var(--text-disabled)' : 'var(--brand-primary-rest)', padding: 0 }}><Icon name={icon} size={18} /></button>;
  return <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{btn('remove', () => onChange(Math.max(min, value - 1)), value <= min)}<span className="mono" style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{value}</span>{btn('add', () => onChange(Math.min(max, value + 1)), value >= max)}</div>;
}
export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return <div style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5].map(i => <button key={i} type="button" aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => onChange?.(i)} style={{ border: 'none', background: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default' }}><Icon name="star" size={size} filled={i <= value} color={i <= value ? 'var(--severity-low)' : 'var(--surface-border-strong)'} /></button>)}</div>;
}
