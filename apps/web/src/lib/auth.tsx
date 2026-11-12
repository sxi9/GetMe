// Sign in (phone → OTP, Google stub, email) shared by the three apps.
import { useState } from 'react';
import type { Role } from '@getme/core';
import { validEmail, validPassword, validPhone, validOtp } from '@getme/core';
import { post } from './api';
import { useStore } from './store';
import { Body, Button, Icon, Input, Header } from '../ui';

const BRAND: Record<Role, { name: string; tagline: string; icon: string }> = {
  customer: { name: 'GetMe', tagline: 'Anything from nearby, brought to your door.', icon: 'near_me' },
  partner: { name: 'GetMe Partner', tagline: 'Earn on your own schedule, one trip at a time.', icon: 'two_wheeler' },
  shop: { name: 'GetMe Shops', tagline: 'Your catalogue, your orders, more customers nearby.', icon: 'storefront' },
  admin: { name: 'GetMe Ops', tagline: 'Verification, shops, refunds and regions.', icon: 'admin_panel_settings' },
};
const DEMO: Record<Role, string> = { customer: '9845012345', partner: '9986044112', shop: '9886071234', admin: '9000000000' };

export function SignIn({ role }: { role: Role }) {
  const { signIn, toast } = useStore();
  const b = BRAND[role];
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [phone, setPhone] = useState(DEMO[role]);
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();

  const sendOtp = async () => {
    if (!validPhone(phone)) { setErr('Enter a 10-digit mobile number'); return; }
    setBusy(true); setErr('');
    try { const r = await post('/api/auth/otp', { phone, role }); setDevCode(r.devCode); setStep('otp'); setOtp(''); toast(r.devCode ? `Your GetMe code is ${r.devCode}` : 'Code sent by SMS'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!validOtp(otp)) { setErr('Enter the 4-digit code'); return; }
    setBusy(true); setErr('');
    try { signIn(await post('/api/auth/verify', { phone, role, code: otp, name })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const google = async () => {
    // Production: open Google Sign-In and send the ID token. Here a stub identity is used.
    setBusy(true);
    try { signIn(await post('/api/auth/google', { role, email: `demo.${role}@gmail.com`, name: role === 'customer' ? 'Demo Customer' : role === 'partner' ? 'Demo Partner' : 'Demo Shop' })); toast('Signed in with Google'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const emailLogin = async () => {
    if (!validEmail(email)) { setErr('Enter a valid email address'); return; }
    if (!validPassword(pw)) { setErr('Enter your password'); return; }
    setBusy(true); setErr('');
    try { signIn(await post('/api/auth/email', { role, email, password: pw })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (step === 'otp') return (
    <>
      <Header title="Verify your number" onBack={() => { setStep('login'); setErr(''); }} />
      <Body style={{ padding: '24px 16px 48px' }}>
        <div style={{ fontSize: 16, lineHeight: '24px' }}>Enter the 4-digit code sent to <strong>+91 {phone}</strong></div>
        <Input label="One-time code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} prefixIcon="password" type="tel" inputMode="numeric" autoFocus error={err} hint={devCode ? `Development build: the code is ${devCode}` : 'Codes expire in 5 minutes'} onEnter={verify} mono />
        <Button color="primary" size="tall" fullWidth onClick={verify} loading={busy}>Verify and continue</Button>
        <Button variant="text" color="primary" fullWidth onClick={sendOtp} disabled={busy}>Resend code</Button>
      </Body>
    </>
  );
  return (
    <>
      <div className="chrome hero">
        <div className="row" style={{ gap: 6 }}><Icon name={b.icon} size={30} color="var(--gm-accent)" /><span style={{ font: '600 32px/40px var(--font-sans)', letterSpacing: -0.5 }}>{b.name}</span></div>
        <div style={{ fontSize: 16, lineHeight: '24px', color: 'rgba(255,255,255,.78)' }}>{b.tagline}</div>
      </div>
      <Body style={{ padding: '24px 16px 48px' }}>
        {mode === 'phone' ? (
          <>
            <Input label="Mobile number" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} prefixIcon="call" prefixText="+91" type="tel" inputMode="numeric" error={err} hint="We will text you a one-time code" onEnter={sendOtp} />
            <Input label="Your name (new accounts)" value={name} onChange={e => setName(e.target.value)} prefixIcon="person" placeholder="Optional for existing accounts" />
            <Button color="primary" size="tall" fullWidth onClick={sendOtp} loading={busy}>Send code</Button>
          </>
        ) : (
          <>
            <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} prefixIcon="mail" type="email" placeholder="you@example.com" />
            <Input label="Password" value={pw} onChange={e => setPw(e.target.value)} prefixIcon="lock" type="password" error={err} onEnter={emailLogin} />
            <Button color="primary" size="tall" fullWidth onClick={emailLogin} loading={busy}>Sign in</Button>
          </>
        )}
        <div className="row" style={{ color: 'var(--text-secondary)', fontSize: 12 }}><div className="divider grow" />or<div className="divider grow" /></div>
        <Button variant="outlined" size="tall" fullWidth icon="account_circle" onClick={google} disabled={busy}>Continue with Google</Button>
        <Button variant="text" color="primary" fullWidth onClick={() => { setMode(mode === 'phone' ? 'email' : 'phone'); setErr(''); }}>{mode === 'phone' ? 'Use email and password instead' : 'Use mobile number instead'}</Button>
        <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--text-secondary)', textAlign: 'center' }}>By continuing you agree to the GetMe terms of service and privacy policy.</div>
      </Body>
    </>
  );
}
