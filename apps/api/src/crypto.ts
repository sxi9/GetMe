// Stablecoin payments. GetMe receives USDT/USDC on an invoice per order; the
// partner and shop are still settled in rupees. Provider by env:
//   CRYPTO_PROVIDER=sim          (default) – in-memory invoices; POST .../simulate marks them paid
//   CRYPTO_PROVIDER=nowpayments  – NOWPAYMENTS_API_KEY + NOWPAYMENTS_IPN_SECRET, webhook at /api/crypto/webhook
// Rates come from CoinGecko with a 5-minute cache and a fixed fallback.
import { createHmac, randomBytes } from 'node:crypto';
import { CRYPTO, toCrypto, type CryptoPayment } from '@getme/core';
import type { Db } from './db.js';

export class Crypto {
  provider: 'sim' | 'nowpayments' = (process.env.CRYPTO_PROVIDER as any) === 'nowpayments' && process.env.NOWPAYMENTS_API_KEY ? 'nowpayments' : 'sim';
  private rateCache: { at: number; rates: Record<string, number> } | null = null;
  constructor(private db: Db) {}

  async rates(): Promise<Record<string, number>> {
    if (this.rateCache && Date.now() - this.rateCache.at < 5 * 60_000) return this.rateCache.rates;
    const cached = this.db.geoGet('crypto:rates');
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=inr', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j: any = await r.json(); const rates = { USDT: Number(j.tether?.inr) || CRYPTO.fallbackRateInr, USDC: Number(j['usd-coin']?.inr) || CRYPTO.fallbackRateInr }; this.rateCache = { at: Date.now(), rates }; this.db.geoPut('crypto:rates', rates); return rates; }
    } catch { /* offline or rate-limited */ }
    const rates = cached ?? { USDT: CRYPTO.fallbackRateInr, USDC: CRYPTO.fallbackRateInr };
    this.rateCache = { at: Date.now(), rates };
    return rates;
  }

  async createInvoice(orderId: string, purpose: 'order' | 'tip', amountInr: number, currency: 'USDT' | 'USDC' = 'USDT'): Promise<CryptoPayment> {
    const rates = await this.rates();
    const rateInr = rates[currency];
    const amountCrypto = toCrypto(amountInr, rateInr);
    const t = Date.now();
    const base: CryptoPayment = { provider: this.provider, invoiceId: '', purpose, currency, network: CRYPTO.networks[currency], amountInr, amountCrypto, rateInr, address: '', payUrl: null, status: 'pending', txHash: null, createdAt: new Date(t).toISOString(), expiresAt: new Date(t + CRYPTO.invoiceTtlMs).toISOString(), paidAt: null };
    if (this.provider === 'nowpayments') {
      const r = await fetch('https://api.nowpayments.io/v1/payment', { method: 'POST', headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY!, 'content-type': 'application/json' }, body: JSON.stringify({ price_amount: amountInr, price_currency: 'inr', pay_currency: currency === 'USDT' ? 'usdttrc20' : 'usdcmatic', order_id: `${orderId}:${purpose}`, order_description: `GetMe ${orderId} ${purpose}`, ipn_callback_url: (process.env.PUBLIC_API_URL ?? '') + '/api/crypto/webhook' }) });
      if (!r.ok) throw new Error('Crypto provider error ' + r.status);
      const j: any = await r.json();
      return { ...base, invoiceId: String(j.payment_id), address: j.pay_address, amountCrypto: Number(j.pay_amount) || amountCrypto, payUrl: j.invoice_url ?? null };
    }
    // simulated: a deterministic-looking address, paid via the simulate endpoint (dev only)
    const addr = (currency === 'USDT' ? 'T' : '0x') + randomBytes(16).toString('hex').slice(0, currency === 'USDT' ? 33 : 40);
    return { ...base, invoiceId: 'sim_' + randomBytes(6).toString('hex'), address: addr, payUrl: null };
  }

  /** Provider status check (NOWPayments); sim invoices change only via simulate/webhook. */
  async refreshStatus(inv: CryptoPayment): Promise<CryptoPayment> {
    if (inv.status === 'paid' || inv.status === 'failed') return inv;
    if (Date.parse(inv.expiresAt) < Date.now() && inv.status === 'pending') return { ...inv, status: 'expired' };
    if (this.provider !== 'nowpayments') return inv;
    try {
      const r = await fetch(`https://api.nowpayments.io/v1/payment/${inv.invoiceId}`, { headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY! }, signal: AbortSignal.timeout(4000) });
      if (!r.ok) return inv;
      const j: any = await r.json();
      return this.applyProviderStatus(inv, j.payment_status, j.payin_hash ?? null);
    } catch { return inv; }
  }
  applyProviderStatus(inv: CryptoPayment, status: string, txHash: string | null): CryptoPayment {
    const map: Record<string, CryptoPayment['status']> = { waiting: 'pending', confirming: 'confirming', confirmed: 'paid', sending: 'paid', partially_paid: 'confirming', finished: 'paid', failed: 'failed', refunded: 'failed', expired: 'expired' };
    const next = map[status] ?? inv.status;
    return { ...inv, status: next, txHash: txHash ?? inv.txHash, paidAt: next === 'paid' ? inv.paidAt ?? new Date().toISOString() : inv.paidAt };
  }
  /** Verify a NOWPayments IPN signature: HMAC-SHA512 over the JSON with sorted keys. */
  verifyWebhook(rawBody: string, signature: string | undefined): boolean {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET; if (!secret || !signature) return false;
    const sorted = JSON.stringify(sortKeys(JSON.parse(rawBody)));
    const h = createHmac('sha512', secret).update(sorted).digest('hex');
    return h === signature;
  }
}
function sortKeys(v: any): any { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') return Object.keys(v).sort().reduce((a: any, k) => { a[k] = sortKeys(v[k]); return a; }, {}); return v; }
