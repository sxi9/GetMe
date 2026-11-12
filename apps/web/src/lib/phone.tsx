import type { ReactNode } from 'react';
import { useStore } from './store';
import { Toast } from '../ui';

/** The device shell: full-screen on phones, a framed phone on desktop. Renders the toast stack. */
export function Phone({ children, theme }: { children: ReactNode; theme?: string }) {
  const { toasts, dismissToast, onToastClick, online, queue } = useStore();
  return (
    <div className="phone-wrap">
      <div className="phone" data-gm-theme={theme}>
        <div className="toast-stack">
          {toasts.slice(-3).map((t, i) => <Toast key={t.id} text={t.text} title={t.title} index={i} onDone={() => dismissToast(t.id)} onClick={() => onToastClick.current?.(t.orderId, t.url)} />)}
        </div>
        {(!online || queue.length > 0) && <div className="offline-bar" role="status"><span className="gm-icon" style={{ fontSize: 16 }}>{online ? 'sync' : 'cloud_off'}</span>{online ? `Sending ${queue.length} saved action${queue.length === 1 ? '' : 's'}…` : queue.length ? `Offline · ${queue.length} action${queue.length === 1 ? '' : 's'} will send when you are back online` : 'Offline · showing the last known state'}</div>}
        {children}
      </div>
    </div>
  );
}
export function CallOverlay({ name, onEnd }: { name: string; onEnd: () => void }) {
  return (
    <div className="call-overlay">
      <span className="gm-icon" style={{ fontSize: 48, color: 'var(--gm-accent)' }}>call</span>
      <div style={{ font: '600 20px/28px var(--font-sans)' }}>Calling {name}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>Calling through GetMe · number stays private</div>
      <button onClick={onEnd} style={{ marginTop: 24, width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'var(--brand-danger)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="End call"><span className="gm-icon" style={{ fontSize: 30 }}>call_end</span></button>
    </div>
  );
}
