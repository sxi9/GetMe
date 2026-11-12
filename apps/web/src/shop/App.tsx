import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { patch } from '../lib/api';
import { useErrorToast, useStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { NotificationBell } from '../lib/notifications';
import { Icon, Toggle, TopTabs } from '../ui';
import { ShopStateProvider, useShop } from './state';
import { OrdersScreen } from './Orders';
import { ItemsScreen } from './Items';
import { AnalyticsScreen } from './Analytics';
import { ProfileScreen } from './Profile';
import { CommunityScreen } from './Community';

export function ShopApp() {
  return <ShopStateProvider><Shell /></ShopStateProvider>;
}

function Shell() {
  const { shop, setShop } = useShop();
  const { toast, onToastClick } = useStore();
  const { t } = useT();
  const err = useErrorToast();
  const nav = useNavigate();
  const loc = useLocation();
  const tab = loc.pathname.split('/')[2] || 'orders';
  const TABS = [{ id: 'orders', label: t('Orders') }, { id: 'items', label: t('Items') }, { id: 'analytics', label: t('Analytics') }, { id: 'profile', label: t('Profile') }];

  useEffect(() => { onToastClick.current = () => nav('/shop'); return () => { onToastClick.current = null; }; }, [nav, onToastClick]);

  const toggleOpen = async (open: boolean) => {
    try { const s = await patch('/api/shop', { open }); setShop(s); toast(open ? (s.approved ? t('You are open. New orders will come in') : t('Marked open. Customers will see you once the shop is approved')) : t('You are closed. Customers see you as closed')); } catch (e) { err(e); }
  };

  return (
    <>
      <div className="chrome" style={{ gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 4, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>{shop?.photoUrl ? <img src={shop.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="storefront" size={22} color="var(--gm-accent)" />}</div>
        <div className="grow"><div className="title ellip">{shop?.name ?? t('Your shop')}</div><div style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.75)' }} className="ellip">{shop ? `${shop.address || t('Add your address')} · ${shop.hours}` : ''}</div></div>
        <NotificationBell onOpen={() => nav('/shop')} />
        <div style={{ background: 'var(--surface)', borderRadius: 999, padding: '4px 10px 4px 6px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', flexShrink: 0 }}>
          <Toggle checked={!!shop?.open} onChange={toggleOpen} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{shop?.open ? (shop.approved ? t('Open') : t('Open · in review')) : t('Closed')}</span>
        </div>
      </div>
      <TopTabs tabs={TABS} active={tab === 'community' ? 'profile' : tab} onChange={id => nav(id === 'orders' ? '/shop' : `/shop/${id}`)} />
      <Routes>
        <Route index element={<OrdersScreen />} />
        <Route path="items" element={<ItemsScreen />} />
        <Route path="analytics" element={<AnalyticsScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="community" element={<CommunityScreen />} />
        <Route path="*" element={<Navigate to="/shop" replace />} />
      </Routes>
    </>
  );
}
