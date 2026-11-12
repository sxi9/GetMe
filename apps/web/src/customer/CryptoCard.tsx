// "Pay with crypto" card for orders paid in USDT / USDC. The invoice exists once
// the final bill is known (status to_customer); before that a one-line note.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { fmt } from '@getme/core';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useErrorToast, useStore } from '../lib/store';
import { Button, Chip, Icon, StatusChip } from '../ui';
import { useCustomer } from './state';

export function CryptoCard({ o }: { o: any }) {
  const { t } = useT(); const { toast } = useStore(); const errToast = useErrorToast();
  const { patchOrder } = useCustomer();
  const c = o.crypto;
  const [qr, setQr] = useState<string>('');
  const [now, setNow] = useState(Date.now());
  const [provider, setProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/crypto/rates').then(r => setProvider(r.provider)).catch(() => {}); }, []);
  useEffect(() => { if (c?.address) QRCode.toDataURL(c.address, { margin: 1, width: 180 }).then(setQr).catch(() => setQr('')); else setQr(''); }, [c?.address]);
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const live = c && (c.status === 'pending' || c.status === 'confirming');
  useEffect(() => { if (!live) return; const h = setInterval(() => api(`/api/orders/${o.id}/crypto`).then(patchOrder).catch(() => {}), 8000); return () => clearInterval(h); }, [live, o.id, patchOrder]);
  const invoice = async (currency?: 'USDT' | 'USDC') => { setBusy(true); try { patchOrder(await api(`/api/orders/${o.id}/crypto`, { method: 'POST', body: { currency: currency ?? c?.currency ?? 'USDT' } })); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const simulate = async () => { setBusy(true); try { patchOrder(await api(`/api/orders/${o.id}/crypto/simulate`, { method: 'POST', body: {} })); toast(t('Payment confirmed')); } catch (e) { errToast(e); } finally { setBusy(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(c.address); toast(t('Address copied')); } catch { toast(c.address); } };
  if (o.pay !== 'crypto') return null;
  if (!c) return <div className="card row flat"><Icon name="currency_bitcoin" size={22} color="var(--brand-primary-rest)" /><div className="grow"><div className="b">{t('Crypto (USDT / USDC)')}</div><div className="cap">{t('Crypto invoice is created once the final bill is known')}</div></div></div>;
  const left = Math.max(0, Math.floor((Date.parse(c.expiresAt) - now) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  const chip = c.status === 'paid' ? <StatusChip status="success" label={t('Paid')} /> : c.status === 'confirming' ? <StatusChip status="progress" label={t('Confirming on chain')} /> : c.status === 'pending' ? <StatusChip status="pending" label={t('Waiting for payment')} /> : c.status === 'expired' ? <StatusChip status="ended" label={t('Expired')} /> : <StatusChip status="fail" label={t('Failed')} />;
  return (
    <div className="card" style={{ borderColor: c.status === 'paid' ? 'var(--brand-confirm-rest)' : 'var(--brand-primary-rest)' }}>
      <div className="between"><div className="row" style={{ gap: 8 }}><Icon name="currency_bitcoin" size={22} color="var(--brand-primary-rest)" /><div className="h16">{t('Pay with crypto')}</div></div>{chip}</div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        {qr && c.status !== 'paid' && <img src={qr} alt="" width={120} height={120} style={{ borderRadius: 4, border: '1px solid var(--surface-border)', flexShrink: 0 }} />}
        <div className="grow col" style={{ gap: 4 }}>
          <div className="mono" style={{ font: '600 20px/26px var(--font-mono)' }}>{c.amountCrypto} {c.currency}</div>
          <div className="cap13">{fmt(c.amountInr)} · {t('1 {cur} = ₹{rate}', { cur: c.currency, rate: c.rateInr })}</div>
          <div className="cap">{t('Network')}: {c.network}</div>
          {c.status === 'paid' && c.txHash && <div className="cap"><Icon name="check_circle" size={14} color="var(--brand-confirm-rest)" /> {t('tx')} <span className="mono">{String(c.txHash).slice(0, 10)}…</span></div>}
          {live && <div className="cap mono"><Icon name="timer" size={14} /> {t('expires in')} {mm}:{ss}</div>}
        </div>
      </div>
      {c.status !== 'paid' && <>
        <div className="row" style={{ gap: 6, background: 'var(--surface-sunken)', borderRadius: 4, padding: '6px 10px' }}><span className="mono grow ellip" style={{ fontSize: 12 }}>{c.address}</span><Button variant="text" color="primary" size="small" icon="content_copy" onClick={copy}>{t('Copy')}</Button></div>
        <div className="wrap">{(['USDT', 'USDC'] as const).map(cur => <Chip key={cur} label={cur} selected={c.currency === cur} onClick={() => { if (cur !== c.currency && !busy) invoice(cur); }} disabled={c.status === 'confirming'} />)}</div>
        <div className="row" style={{ gap: 8 }}>
          {c.payUrl && <Button color="primary" fullWidth style={{ flex: 1 }} icon="account_balance_wallet" onClick={() => window.open(c.payUrl, '_blank', 'noopener')}>{t('Open wallet app')}</Button>}
          {(c.status === 'expired' || c.status === 'failed') && <Button variant="outlined" color="primary" fullWidth style={{ flex: 1 }} icon="refresh" onClick={() => invoice()} loading={busy}>{t('Get a new invoice')}</Button>}
          {provider === 'sim' && live && <Button variant="outlined" fullWidth style={{ flex: 1 }} icon="science" onClick={simulate} loading={busy}>{t('Simulate payment')}</Button>}
        </div>
        <div className="cap">{t('Send exactly the amount shown on the {network} network. Partners and shops are paid in rupees by GetMe.', { network: c.network })}</div>
      </>}
    </div>
  );
}
