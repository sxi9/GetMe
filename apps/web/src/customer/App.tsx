import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomerProvider } from './state';
import { Home } from './Home';
import { ListScreen } from './ListScreen';
import { PackageScreen } from './PackageScreen';
import { Catalogue } from './Catalogue';
import { Checkout } from './Checkout';
import { OrderScreen } from './OrderScreen';
import { ChatScreen } from './ChatScreen';
import { Orders } from './Orders';
import { Profile } from './Profile';
import { RunDetail, Runs } from './Runs';
import { CommunityScreen } from './Community';

export function CustomerApp() {
  return (
    <CustomerProvider>
      <Routes>
        <Route index element={<Home />} />
        <Route path="list" element={<ListScreen />} />
        <Route path="package" element={<PackageScreen />} />
        <Route path="shop/:id" element={<Catalogue />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="order/:id" element={<OrderScreen />} />
        <Route path="order/:id/chat" element={<ChatScreen />} />
        <Route path="orders" element={<Orders />} />
        <Route path="profile" element={<Profile />} />
        <Route path="runs" element={<Runs />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="community" element={<CommunityScreen />} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
      </Routes>
    </CustomerProvider>
  );
}
