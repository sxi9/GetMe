import type { ReactNode } from 'react';
import { useStore } from './store';
import { Toast } from '../ui';

/** The device shell: full-screen on phones, a framed phone on desktop. Renders the toast stack. */
export function Phone({ children, theme }: { children: ReactNode; theme?: string }) {
  const { toasts, dismissToast, onToastClick } = useStore();
  return (
    <div className="phone-wrap">
      <div className="phone" data-gm-theme={theme}>
        {toasts.slice(-1).map(t => <Toast key={t.id} text={t.text} title={t.title} onDone={() => dismissToast(t.id)} onClick={() => onToastClick.current?.(t.orderId)} />)}
        {children}
      </div>
    </div>
  );
}
export function CallOverlay({ name, onEnd }: { name: string; onEnd: () => void }) {
  return (
    <div className="call-overlay">
      <span className="vulpes-icon" style={{ fontSize: 48, color: 'var(--gm-accent)' }}>call</span>
      <div style={{ font: '600 20px/28px var(--font-sans)' }}>Calling {name}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>Calling through GetMe · number stays private</div>
      <button onClick={onEnd} style={{ marginTop: 24, width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'var(--brand-fox-red)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="End call"><span className="vulpes-icon" style={{ fontSize: 30 }}>call_end</span></button>
    </div>
  );
}
