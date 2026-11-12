import { Icon, Sheet } from '../ui';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';

export function SafetySheet({ open, onClose, onCall }: { open: boolean; onClose: () => void; onCall: () => void }) {
  const { toast } = useStore(); const { t } = useT();
  const rows = [
    { icon: 'support_agent', color: 'var(--brand-primary-rest)', label: t('Call GetMe safety line'), sub: t('24×7 · answered in under a minute'), pick: () => { onClose(); onCall(); } },
    { icon: 'share_location', color: 'var(--brand-primary-rest)', label: t('Share live trip with a contact'), sub: t('Sends a tracking link by SMS'), pick: () => { onClose(); toast(t('Trip link sent to your emergency contact')); } },
    { icon: 'emergency', color: 'var(--brand-warn-rest)', label: t('Call 112'), sub: t('Police, ambulance, fire'), pick: () => { onClose(); toast(t('Dialling 112 · your location is attached')); window.location.href = 'tel:112'; } },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={t('Safety')}>
      <div className="cap13">{t('Your live location is shared with GetMe safety while a job is active.')}</div>
      {rows.map(r => <button key={r.label} onClick={r.pick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--surface-border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}><Icon name={r.icon} size={22} color={r.color} /><div className="grow"><div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div><div className="cap">{r.sub}</div></div></button>)}
    </Sheet>
  );
}
