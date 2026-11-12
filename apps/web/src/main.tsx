import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import './styles/app.css';
import { StoreProvider, useStore } from './lib/store';
import { SignIn } from './lib/auth';
import { Phone } from './lib/phone';
import { Icon } from './ui';
import { CustomerApp } from './customer/App';
import { PartnerApp } from './partner/App';
import { ShopApp } from './shop/App';
import { TrackPage } from './track';
import type { Role } from '@getme/core';

function RoleApp({ role }: { role: Role }) {
  return (
    <StoreProvider role={role}>
      <Gate role={role} />
    </StoreProvider>
  );
}
function Gate({ role }: { role: Role }) {
  const { session } = useStore();
  return <Phone>{!session ? <SignIn role={role} /> : role === 'customer' ? <CustomerApp /> : role === 'partner' ? <PartnerApp /> : <ShopApp />}</Phone>;
}
function Landing() {
  const roles: { to: string; icon: string; title: string; text: string }[] = [
    { to: '/customer', icon: 'near_me', title: 'GetMe', text: 'Customer app · lists, shops, packages' },
    { to: '/partner', icon: 'two_wheeler', title: 'GetMe Partner', text: 'Delivery partner app · requests, jobs, earnings' },
    { to: '/shop', icon: 'storefront', title: 'GetMe Shops', text: 'Shop owner app · orders, items, analytics' },
  ];
  return (
    <div className="landing">
      <div className="col" style={{ width: '100%', maxWidth: 420, gap: 16 }}>
        <div className="row" style={{ gap: 10 }}><Icon name="near_me" size={28} color="var(--brand-primary-rest)" /><span className="h23" style={{ color: 'var(--brand-fox-blue)' }}>GetMe</span></div>
        <div className="cap13">Local delivery for Bengaluru. Three apps, one backend. Open each app in its own tab to run a live order across roles.</div>
        <div className="list">{roles.map(r => <Link key={r.to} to={r.to} className="item clickable" style={{ textDecoration: 'none', color: 'inherit' }}><div className="tile"><Icon name={r.icon} size={20} /></div><div className="grow"><div className="b">{r.title}</div><div className="cap">{r.text}</div></div><Icon name="chevron_right" size={22} color="var(--icon)" /></Link>)}</div>
        <div className="cap">Demo accounts sign in with code 1234. Customer 98450 12345 · Partner 99860 44112 · Shop 98860 71234.</div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/customer/*" element={<RoleApp role="customer" />} />
        <Route path="/partner/*" element={<RoleApp role="partner" />} />
        <Route path="/shop/*" element={<RoleApp role="shop" />} />
        <Route path="/track/:token" element={<TrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
