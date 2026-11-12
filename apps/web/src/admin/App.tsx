import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppearanceRow } from '../lib/theme';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { NotificationBell } from '../lib/notifications';
import { Avatar, Button, Icon, Sheet, TopTabs } from '../ui';
import { AdminStateProvider, useAdmin } from './state';
import { LiveScreen } from './Live';
import { VerifyScreen } from './Verify';
import { ShopsScreen } from './Shops';
import { RefundsScreen } from './Refunds';
import { RegionsScreen } from './Regions';

export function AdminApp() {
  return <AdminStateProvider><Shell /></AdminStateProvider>;
}

function Shell() {
  const { t } = useT();
  const { session, signOut, onToastClick, connected } = useStore();
  const { overview } = useAdmin();
  const nav = useNavigate();
  const loc = useLocation();
  const tab = loc.pathname.split('/')[2] || 'live';
  const [profile, setProfile] = useState(false);
  const TABS = [{ id: 'live', label: t('Live') }, { id: 'verify', label: t('Verify') }, { id: 'shops', label: t('Shops') }, { id: 'refunds', label: t('Refunds') }, { id: 'regions', label: t('Regions') }];
  useEffect(() => { onToastClick.current = () => nav('/admin'); return () => { onToastClick.current = null; }; }, [nav, onToastClick]);
  const u = session?.me.user;
  const pending = (overview?.pendingPartners.length ?? 0) + (overview?.pendingShops.length ?? 0) + (overview?.refunds.length ?? 0);
  return (
    <>
      <div className="chrome" style={{ gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 4, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="admin_panel_settings" size={22} color="var(--gm-accent)" /></div>
        <div className="grow"><div className="title ellip">{t('GetMe Ops')}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }} className="ellip">{connected ? t('Live · {n} items need attention', { n: pending }) : t('Reconnecting…')}</div></div>
        <NotificationBell onOpen={() => nav('/admin')} />
        <Avatar initials={(u?.name ?? 'Op').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()} src={u?.photoUrl} size="md" color="rgba(255,255,255,.18)" onClick={() => setProfile(true)} />
      </div>
      <TopTabs tabs={TABS} active={tab} onChange={id => nav(id === 'live' ? '/admin' : `/admin/${id}`)} />
      <Routes>
        <Route index element={<LiveScreen />} />
        <Route path="verify" element={<VerifyScreen />} />
        <Route path="shops" element={<ShopsScreen />} />
        <Route path="refunds" element={<RefundsScreen />} />
        <Route path="regions" element={<RegionsScreen />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      <Sheet open={profile} onClose={() => setProfile(false)} title={u?.name ?? t('Ops')}>
        <div className="cap13">{t('Signed in as GetMe ops')}{u?.phone ? ` · +91 ${u.phone}` : ''}{u?.email ? ` · ${u.email}` : ''}</div>
        <div className="list"><AppearanceRow /></div>
        <Button variant="outlined" color="warn" fullWidth icon="logout" onClick={signOut}>{t('Log out')}</Button>
      </Sheet>
    </>
  );
}
