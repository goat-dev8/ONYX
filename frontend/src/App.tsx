import { FC, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/icons/Icons';

const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Vault = lazy(() => import('./pages/Vault').then((m) => ({ default: m.Vault })));
const Scan = lazy(() => import('./pages/Scan').then((m) => ({ default: m.Scan })));
const Mint = lazy(() => import('./pages/Mint').then((m) => ({ default: m.Mint })));
const Transfer = lazy(() => import('./pages/Transfer').then((m) => ({ default: m.Transfer })));
const Stolen = lazy(() => import('./pages/Stolen').then((m) => ({ default: m.Stolen })));
const Prove = lazy(() => import('./pages/Prove').then((m) => ({ default: m.Prove })));
const Escrow = lazy(() => import('./pages/Escrow').then((m) => ({ default: m.Escrow })));

const PageLoader: FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <LoadingSpinner size={48} className="text-champagne-400" />
  </div>
);

export const App: FC = () => {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/mint" element={<Mint />} />
            <Route path="/transfer" element={<Transfer />} />
            <Route path="/stolen" element={<Stolen />} />
            <Route path="/prove" element={<Prove />} />
            <Route path="/escrow" element={<Escrow />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
};
