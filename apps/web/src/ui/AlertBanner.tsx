import type { ReactNode } from 'react';
import { Icon } from './Icon';
const TYPES = {
  neutral: { bg: 'var(--surface-sunken)', fg: 'var(--icon)', icon: 'lightbulb' },
  error: { bg: 'var(--surface-critical-light)', fg: 'var(--text-critical)', icon: 'error' },
  info: { bg: 'var(--surface-info-light)', fg: 'var(--text-info)', icon: 'info' },
  success: { bg: 'var(--surface-success-light)', fg: 'var(--text-success)', icon: 'check_circle' },
  caution: { bg: 'var(--surface-caution-light)', fg: 'var(--text-caution)', icon: 'warning' },
};
export function AlertBanner({ type = 'info', title, children, action, icon, onClick }: { type?: keyof typeof TYPES; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: string; onClick?: () => void }) {
  const t = TYPES[type];
  return (
    <div role="status" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 8px 8px 16px', background: t.bg, borderRadius: 'var(--radius-100)', cursor: onClick ? 'pointer' : undefined }}>
      <Icon name={icon ?? t.icon} size={20} color={t.fg} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, color: t.fg, fontSize: 'var(--size-body-2)', lineHeight: 1.4 }}>{title && <strong style={{ fontWeight: 600 }}>{title} </strong>}{children}</span>
      {action && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{action}</div>}
    </div>
  );
}
