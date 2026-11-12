import { useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '../ui';
import { useCustomer } from './state';

export function CustomerTabs() {
  const nav = useNavigate(); const loc = useLocation();
  const { activeOrders } = useCustomer();
  const active = loc.pathname.endsWith('/orders') ? 'orders' : loc.pathname.endsWith('/profile') ? 'profile' : 'home';
  return <TabBar tabs={[{ id: 'home', label: 'Home', icon: 'home' }, { id: 'orders', label: 'Orders', icon: 'receipt_long' }, { id: 'profile', label: 'Profile', icon: 'person' }]} active={active} badges={{ orders: activeOrders.length }} onChange={id => nav(id === 'home' ? '/customer' : `/customer/${id}`)} />;
}
