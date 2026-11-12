import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '../ui';
import { useT } from '../lib/i18n';
import { PartnerProvider, usePartner } from './state';
import { Home, RequestScreen } from './Home';
import { Extra, Offer } from './Extra';
import { Job } from './Job';
import { Chat } from './Chat';
import { Earnings } from './Earnings';
import { Profile } from './Profile';
import { RunDetail, RunNew, RunsList } from './Runs';
import { CommunityBoard } from './Community';

const TABS = [{ id: '/partner', label: 'Home', icon: 'home' }, { id: '/partner/runs', label: 'Trips', icon: 'add_road' }, { id: '/partner/earnings', label: 'Earnings', icon: 'payments' }, { id: '/partner/profile', label: 'Profile', icon: 'person' }];

function Shell() {
  const { t } = useT();
  const loc = useLocation(); const nav = useNavigate(); const { requests } = usePartner();
  const tab = TABS.some(x => x.id === loc.pathname);
  return (
    <>
      <Routes>
        <Route index element={<Home />} />
        <Route path="request/:id" element={<RequestScreen />} />
        <Route path="request/:id/extra" element={<Extra />} />
        <Route path="request/:id/offer" element={<Offer />} />
        <Route path="job" element={<Job />} />
        <Route path="job/chat" element={<Chat />} />
        <Route path="runs" element={<RunsList />} />
        <Route path="runs/new" element={<RunNew />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="community" element={<CommunityBoard />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/partner" replace />} />
      </Routes>
      {tab && <TabBar tabs={TABS.map(x => ({ ...x, label: t(x.label) }))} active={loc.pathname} onChange={nav} badges={{ '/partner': Object.keys(requests).length }} />}
    </>
  );
}
export function PartnerApp() { return <PartnerProvider><Shell /></PartnerProvider>; }
