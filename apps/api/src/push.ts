// Outbound channels beyond the socket: Web Push (VAPID) and SMS.
// SMS provider is chosen by env: SMS_PROVIDER=console (default) | msg91 | twilio.
import webpush from 'web-push';
import type { Db } from './db.js';

export class Push {
  publicKey: string;
  constructor(private db: Db, private subject = 'mailto:ops@getme.app') {
    let pub = db.getMeta('vapid_public'), priv = db.getMeta('vapid_private');
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) { pub = process.env.VAPID_PUBLIC_KEY; priv = process.env.VAPID_PRIVATE_KEY; }
    if (!pub || !priv) { const k = webpush.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey; db.setMeta('vapid_public', pub); db.setMeta('vapid_private', priv); }
    this.publicKey = pub;
    webpush.setVapidDetails(this.subject, pub, priv);
  }
  /** Send to every subscription of a user; prunes dead endpoints. Returns how many were delivered. */
  async send(userId: string, payload: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
    const subs = this.db.pushSubs(userId);
    let ok = 0;
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 600 }); ok++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) this.db.delPushSub(s.endpoint); }
    }));
    return ok;
  }
}

export class Sms {
  provider = process.env.SMS_PROVIDER ?? 'console';
  constructor(private db: Db) {}
  async send(phone: string, text: string): Promise<boolean> {
    if (!phone) return false;
    this.db.logSms(phone, text, this.provider);
    try {
      if (this.provider === 'msg91' && process.env.MSG91_AUTH_KEY) {
        const r = await fetch('https://control.msg91.com/api/v5/flow/', { method: 'POST', headers: { authkey: process.env.MSG91_AUTH_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: '91' + phone, text }] }) });
        return r.ok;
      }
      if (this.provider === 'twilio' && process.env.TWILIO_SID) {
        const auth = Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64');
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`, { method: 'POST', headers: { authorization: 'Basic ' + auth, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+91' + phone, From: process.env.TWILIO_FROM ?? '', Body: text }) });
        return r.ok;
      }
      if (process.env.LOG !== '0') console.log(`[sms → +91 ${phone}] ${text}`);
      return true;
    } catch { return false; }
  }
}
