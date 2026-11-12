import type { CSSProperties } from 'react';
export function Icon({ name, size = 20, color, filled, style, className = '' }: { name: string; size?: number; color?: string; filled?: boolean; style?: CSSProperties; className?: string }) {
  return <span className={'gm-icon' + (filled ? ' is-filled' : '') + (className ? ' ' + className : '')} aria-hidden="true" style={{ fontSize: size, color, ...style }}>{name}</span>;
}
