import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '../ui';
import { PartnerProvider, usePartner } from './state';
import { Home, RequestScreen } from './Home';
import { Extra, Offer } from './Extra';
import { Job } from './Job';
import { Chat } from './Chat';
import { Earnings } from './Earnings';
import { Profile } from './Profile';

const TABS = [{ id: '/partner', label: 'Home', icon: 'home' }, { id: '/partner/earnings', label: 'Earnings', icon: 'payments' }, { id: '/partner/profile', label: 'Profile', icon: 'person' }];

function Shell() {
  const loc = useLocation(); const nav = useNavigate(); const { requests } = usePartner();
  const tab = TABS.some(t => t.id === loc.pathname);
  return (
    <>
      <Routes>
        <Route index element={<Home />} />
        <Route path="request/:id" element={<RequestScreen />} />
        <Route path="request/:id/extra" element={<Extra />} />
        <Route path="request/:id/offer" element={<Offer />} />
        <Route path="job" element={<Job />} />
        <Route path="job/chat" element={<Chat />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/partner" replace />} />
      </Routes>
      {tab && <TabBar tabs={TABS} active={loc.pathname} onChange={nav} badges={{ '/partner': Object.keys(requests).length }} />}
    </>
  );
}
export function PartnerApp() { return <PartnerProvider><Shell /></PartnerProvider>; }
