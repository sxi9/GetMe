import type { CSSProperties } from 'react';
export function Avatar({ initials, src, size = 'md', color = 'var(--brand-primary-rest)', style, onClick }: { initials: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | number; color?: string; style?: CSSProperties; onClick?: () => void }) {
  const dim = typeof size === 'number' ? size : { sm: 24, md: 32, lg: 40 }[size];
  const font = typeof size === 'number' ? Math.round(size * 0.4) : { sm: 11, md: 13, lg: 15 }[size];
  return <span onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: dim, height: dim, borderRadius: 'var(--radius-100)', background: src ? 'var(--surface-sunken)' : color, color: 'var(--text-on-fill)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: font, flexShrink: 0, overflow: 'hidden', ...style }}>{src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}</span>;
}
