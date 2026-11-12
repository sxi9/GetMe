import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'style'> {
  label?: string; hint?: string; error?: string; prefixIcon?: string; suffixIcon?: string; suffix?: ReactNode; prefixText?: string; style?: CSSProperties; mono?: boolean; onEnter?: () => void;
}
export function Input({ label, hint, error, prefixIcon, suffixIcon, suffix, prefixText, disabled, required, id, style, mono, onEnter, onKeyDown, ...rest }: InputProps) {
  const auto = useId(); const inputId = id ?? auto;
  const invalid = !!error;
  const border = invalid ? 'var(--brand-warn-rest)' : 'var(--surface-border-strong)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-sans)', ...style }}>
      {label && <label htmlFor={inputId} style={{ fontSize: 'var(--size-body-2)', fontWeight: 600, color: 'var(--text)' }}>{label}{required && <span style={{ color: 'var(--brand-warn-rest)' }}> *</span>}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', background: disabled ? 'var(--fill-tertiary)' : 'var(--surface)', border: `1px solid ${border}`, borderRadius: 'var(--radius-100)', transition: 'border-color .15s ease, box-shadow .15s ease' }}
        onFocusCapture={e => { if (!invalid) { e.currentTarget.style.borderColor = 'var(--focus-ring)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--focus-ring)'; } }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}>
        {prefixIcon && <Icon name={prefixIcon} size={20} color="var(--icon)" />}
        {prefixText && <span style={{ color: 'var(--text-secondary)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{prefixText}</span>}
        <input id={inputId} disabled={disabled} required={required} aria-invalid={invalid} onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } onKeyDown?.(e); }}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 'var(--size-input)', lineHeight: 'var(--lh-input)', padding: 0, width: '100%' }} {...rest} />
        {suffixIcon && <Icon name={suffixIcon} size={20} color="var(--icon)" />}
        {suffix}
      </div>
      {(error || hint) && <span style={{ fontSize: 'var(--size-caption)', lineHeight: 'var(--lh-caption)', color: invalid ? 'var(--brand-warn-rest)' : 'var(--text-secondary)' }}>{error || hint}</span>}
    </div>
  );
}
