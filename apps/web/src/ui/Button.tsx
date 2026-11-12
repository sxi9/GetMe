import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';

type Variant = 'filled' | 'outlined' | 'text' | 'protected';
type Color = 'default' | 'primary' | 'warn' | 'confirm';
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: Variant; color?: Color; size?: 'regular' | 'small' | 'tall'; icon?: string; iconRight?: string; fullWidth?: boolean; children?: ReactNode; loading?: boolean;
}
const PALETTE: Record<Color, { main: string; on: string; fill: string }> = {
  default: { main: 'var(--text)', on: 'var(--text)', fill: 'var(--surface)' },
  primary: { main: 'var(--brand-primary-rest)', on: 'var(--text-on-fill)', fill: 'var(--brand-primary-rest)' },
  warn: { main: 'var(--brand-warn-rest)', on: 'var(--text-on-fill)', fill: 'var(--brand-warn-rest)' },
  confirm: { main: 'var(--brand-confirm-rest)', on: 'var(--text-on-fill)', fill: 'var(--brand-confirm-rest)' },
};
export function Button({ variant = 'filled', color = 'default', size = 'regular', icon, iconRight, disabled, fullWidth, children, loading, style, type = 'button', ...rest }: ButtonProps) {
  const small = size === 'small', tall = size === 'tall';
  const p = PALETTE[color];
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-100)', height: small ? 32 : tall ? 48 : 40, minWidth: small ? 32 : 40,
    padding: `0 ${small ? 'var(--space-400)' : 'var(--space-600)'}`, borderRadius: 'var(--radius-100)', border: '1px solid transparent', fontFamily: 'var(--font-sans)',
    fontWeight: tall ? 600 : 400, fontSize: small ? 'var(--size-button-small)' : tall ? 15 : 'var(--size-button)', lineHeight: 1, letterSpacing: 'var(--letter-spacing-button)', cursor: disabled ? 'not-allowed' : 'pointer',
    width: fullWidth ? '100%' : undefined, transition: 'background-color .15s ease, color .15s ease, border-color .15s ease', whiteSpace: 'nowrap', boxSizing: 'border-box', ...style,
  };
  const v: Record<Variant, CSSProperties> = {
    filled: { background: p.fill, color: p.on, borderColor: p.fill },
    protected: { background: color === 'default' ? 'var(--surface)' : p.fill, color: color === 'default' ? 'var(--text)' : p.on, boxShadow: 'var(--elevation-1)' },
    outlined: { background: 'transparent', color: p.main, borderColor: 'var(--surface-border-strong)' },
    text: { background: 'transparent', color: p.main },
  };
  const d: CSSProperties = disabled ? (variant === 'filled' || variant === 'protected' ? { background: 'var(--disabled-button)', color: 'var(--text-disabled)', borderColor: 'transparent', boxShadow: 'none' } : { color: 'var(--text-disabled)', borderColor: 'var(--surface-border)' }) : {};
  return (
    <button type={type} disabled={disabled || loading} style={{ ...base, ...v[variant], ...d }} {...rest}>
      {loading ? <Icon name="progress_activity" size={small ? 16 : 20} style={{ animation: 'gm-spin 1s linear infinite' }} /> : icon && <Icon name={icon} size={small ? 16 : 20} />}
      {children}
      {iconRight && <Icon name={iconRight} size={small ? 16 : 20} />}
      <style>{`@keyframes gm-spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
export function IconButton({ icon, label, color = 'default', size = 'regular', filled, disabled, onClick, style, badge }: { icon: string; label: string; color?: 'default' | 'primary' | 'warn' | 'reverse'; size?: 'regular' | 'small'; filled?: boolean; disabled?: boolean; onClick?: () => void; style?: CSSProperties; badge?: number }) {
  const dim = size === 'small' ? 28 : 32;
  const c = { default: 'var(--icon)', primary: 'var(--brand-primary-rest)', warn: 'var(--brand-warn-rest)', reverse: '#fff' }[color];
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: dim, height: dim, padding: 0, border: 'none', borderRadius: 'var(--radius-100)', background: 'transparent', color: disabled ? 'var(--text-disabled)' : c, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, ...style }}>
      <Icon name={icon} size={size === 'small' ? 18 : 22} filled={filled} />
      {badge ? <span className="badge">{badge}</span> : null}
    </button>
  );
}
