// Native push through Firebase Cloud Messaging HTTP v1 (Android and iOS via
// APNs managed by Firebase). Auth is a service-account JWT exchanged for an
// OAuth token with node:crypto only — no SDK. Set FCM_SERVICE_ACCOUNT_JSON
// (the JSON string or a file path). Without it, native tokens are stored but
// sends are logged only.
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { Db } from './db.js';

interface Sa { client_email: string; private_key: string; project_id: string }
export interface NativeToken { userId: string; token: string; platform: 'android' | 'ios'; app: 'customer' | 'partner' | 'shop'; at: string }

export class Fcm {
  private sa: Sa | null = null;
  private access: { token: string; exp: number } | null = null;
  constructor(private db: Db) {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (raw) { try { this.sa = JSON.parse(existsSync(raw) ? readFileSync(raw, 'utf8') : raw); } catch { console.error('[fcm] FCM_SERVICE_ACCOUNT_JSON is not valid JSON or a readable file'); } }
  }
  get enabled() { return !!this.sa; }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.exp > Date.now() + 60_000) return this.access.token;
    const sa = this.sa!; const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
    if (!r.ok) throw new Error('FCM auth failed ' + r.status);
    const j: any = await r.json();
    this.access = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return this.access.token;
  }

  /** Send to all native tokens of a user. Prunes tokens FCM reports as gone. Returns delivered count. */
  async send(userId: string, payload: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
    const tokens = this.db.nativeTokens(userId);
    if (!tokens.length) return 0;
    if (!this.sa) { if (process.env.LOG !== '0') console.log(`[fcm → ${tokens.length} device(s)] ${payload.title} – ${payload.body}`); return 0; }
    const auth = await this.accessToken();
    let ok = 0;
    await Promise.all(tokens.map(async t => {
      const message = {
        token: t.token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? '/', tag: payload.tag ?? '' },
        android: { priority: 'high', notification: { channel_id: 'getme_orders', sound: 'default', tag: payload.tag } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', 'thread-id': payload.tag } } },
      };
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa!.project_id}/messages:send`, { method: 'POST', headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
      if (r.ok) ok++;
      else if (r.status === 404 || r.status === 410) this.db.delNativeToken(t.token);
    }));
    return ok;
  }
}
