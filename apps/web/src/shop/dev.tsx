// Standalone dev harness for the shop app (open /src/shop/dev.html?tab=items). Not part of the production bundle.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../styles/app.css';
import { StoreProvider, useStore } from '../lib/store';
import { SignIn } from '../lib/auth';
import { Phone } from '../lib/phone';
import { ShopApp } from './App';

const tab = new URLSearchParams(location.search).get('tab');
function Gate() { const { session } = useStore(); return <Phone>{session ? <Routes><Route path="/shop/*" element={<ShopApp />} /></Routes> : <SignIn role="shop" />}</Phone>; }
createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter initialEntries={[tab ? `/shop/${tab}` : '/shop']}><StoreProvider role="shop"><Gate /></StoreProvider></MemoryRouter></StrictMode>);
