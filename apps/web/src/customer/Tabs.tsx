import { useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '../ui';
import { useT } from '../lib/i18n';
import { useCustomer } from './state';

export function CustomerTabs() {
  const nav = useNavigate(); const loc = useLocation(); const { t } = useT();
  const { activeOrders } = useCustomer();
  const active = loc.pathname.endsWith('/orders') ? 'orders' : loc.pathname.endsWith('/profile') ? 'profile' : loc.pathname.includes('/runs') ? 'runs' : 'home';
  return <TabBar tabs={[{ id: 'home', label: t('Home'), icon: 'home' }, { id: 'runs', label: t('Trips'), icon: 'route' }, { id: 'orders', label: t('Orders'), icon: 'receipt_long' }, { id: 'profile', label: t('Profile'), icon: 'person' }]} active={active} badges={{ orders: activeOrders.length }} onChange={id => nav(id === 'home' ? '/customer' : `/customer/${id}`)} />;
}
