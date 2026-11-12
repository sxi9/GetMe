import type { CSSProperties } from 'react';
export function Avatar({ initials, size = 'md', color = 'var(--brand-primary-rest)', style, onClick }: { initials: string; size?: 'sm' | 'md' | 'lg' | number; color?: string; style?: CSSProperties; onClick?: () => void }) {
  const dim = typeof size === 'number' ? size : { sm: 24, md: 32, lg: 40 }[size];
  const font = typeof size === 'number' ? Math.round(size * 0.4) : { sm: 11, md: 13, lg: 15 }[size];
  return <span onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: dim, height: dim, borderRadius: 'var(--radius-100)', background: color, color: 'var(--text-on-fill)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: font, flexShrink: 0, ...style }}>{initials}</span>;
}
