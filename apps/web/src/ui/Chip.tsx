import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';

export function Chip({ label, selected, leftIcon, rightIcon, onClick, onRemove, disabled, style }: { label: ReactNode; selected?: boolean; leftIcon?: string; rightIcon?: string; onClick?: () => void; onRemove?: () => void; disabled?: boolean; style?: CSSProperties }) {
  const interactive = !!onClick;
  return (
    <span role={interactive ? 'button' : undefined} tabIndex={interactive && !disabled ? 0 : undefined} aria-pressed={interactive ? !!selected : undefined} onClick={disabled ? undefined : onClick}
      onKeyDown={e => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick?.(); } }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-100)', height: 26, padding: '0 var(--space-200)', borderRadius: 'var(--radius-full)', border: `1px solid ${selected ? 'var(--brand-primary-rest)' : 'var(--surface-border-strong)'}`,
        background: disabled ? 'var(--fill-tertiary)' : selected ? 'var(--brand-primary-active-alpha)' : 'var(--surface)', color: disabled ? 'var(--text-disabled)' : selected ? 'var(--brand-primary-rest)' : 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: 'var(--size-body-2)', fontWeight: selected ? 600 : 400, lineHeight: 1, cursor: disabled ? 'not-allowed' : interactive ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none', ...style }}>
      {leftIcon && <Icon name={leftIcon} size={16} />}{label}{rightIcon && <Icon name={rightIcon} size={16} />}
      {onRemove && <button type="button" aria-label={`Remove ${label}`} onClick={e => { e.stopPropagation(); onRemove(); }} style={{ display: 'inline-flex', border: 'none', background: 'transparent', padding: 0, marginRight: -2, cursor: 'pointer', color: 'inherit' }}><Icon name="close" size={16} /></button>}
    </span>
  );
}

const STATUS: Record<string, { icon: string; color: string }> = {
  info: { icon: 'info', color: 'var(--brand-primary-rest)' }, success: { icon: 'check_circle', color: 'var(--brand-confirm-rest)' }, fail: { icon: 'dangerous', color: 'var(--severity-high)' },
  critical: { icon: 'report', color: 'var(--severity-critical)' }, high: { icon: 'new_releases', color: 'var(--severity-high)' }, medium: { icon: 'report_problem', color: 'var(--severity-medium)' },
  low: { icon: 'error', color: 'var(--severity-low)' }, caution: { icon: 'flag', color: 'var(--severity-low)' }, progress: { icon: 'timelapse', color: 'var(--brand-primary-rest)' },
  pending: { icon: 'pending', color: 'var(--status-icon-neutral)' }, todo: { icon: 'play_circle', color: 'var(--status-icon-neutral)' }, ended: { icon: 'disabled_by_default', color: 'var(--status-icon-neutral)' },
  draft: { icon: 'trip_origin', color: 'var(--status-icon-neutral)' }, archived: { icon: 'inventory_2', color: 'var(--status-icon-neutral)' },
};
export type Status = keyof typeof STATUS;
export function StatusChip({ status = 'info', label, variant = 'chip', style }: { status?: Status; label: string; variant?: 'chip' | 'inline'; style?: CSSProperties }) {
  const s = STATUS[status] ?? STATUS.info;
  if (variant === 'inline') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--size-body-2)', ...style }}><Icon name={s.icon} size={18} color={s.color} />{label}</span>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', borderRadius: 'var(--radius-full)', background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color, fontSize: 'var(--size-body-2)', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', ...style }}><Icon name={s.icon} size={16} />{label}</span>;
}
