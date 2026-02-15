import { FC, ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import {
  LogoIcon,
  VaultIcon,
  ScanIcon,
  DiamondIcon,
  MintIcon,
  ShieldIcon,
} from '../icons/Icons';
import { useUserStore } from '../../stores/userStore';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: 'Home', icon: DiamondIcon },
  { path: '/vault', label: 'Vault', icon: VaultIcon },
  { path: '/mint', label: 'Mint', icon: MintIcon },
  { path: '/scan', label: 'Scan', icon: ScanIcon },
  { path: '/escrow', label: 'Escrow', icon: ShieldIcon },
];

// Clear wallet adapter cached state
const clearWalletCache = () => {
  try {
    // Clear wallet adapter localStorage keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('wallet') || key.includes('Wallet') || key.includes('aleo'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      if (key !== 'user-storage') { // Keep our own user store
        localStorage.removeItem(key);
      }
    });
    console.log('[Layout] Cleared wallet cache keys:', keysToRemove);
  } catch (e) {
    console.warn('[Layout] Error clearing wallet cache:', e);
  }
};

export const Layout: FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const wallet = useWallet();
  const { user, isAuthenticated, logout } = useUserStore();
  const prevAddressRef = useRef<string | null>(null);
  const wasConnectedRef = useRef<boolean>(false);

  // Get wallet address
  const walletAddress = wallet.connected ? (wallet as unknown as { address: string }).address : null;

  // Clear auth when wallet changes or disconnects
  useEffect(() => {
    // If was connected but now disconnected, clear everything
    if (wasConnectedRef.current && !wallet.connected) {
      console.log('[Layout] Wallet disconnected, clearing auth and cache');
      logout();
      clearWalletCache();
      prevAddressRef.current = null;
      wasConnectedRef.current = false;
      return;
    }

    // Track connection state
    if (wallet.connected) {
      wasConnectedRef.current = true;
    }

    // If wallet address changed to a different one, clear auth
    if (walletAddress && prevAddressRef.current && walletAddress !== prevAddressRef.current) {
      console.log('[Layout] Wallet address changed from', prevAddressRef.current, 'to', walletAddress);
      logout();
    }

    // If connected wallet doesn't match persisted user, clear stale state
    if (walletAddress && isAuthenticated && user?.address && walletAddress !== user.address) {
      console.log('[Layout] Connected wallet', walletAddress, 'does not match stored user', user.address, '— clearing stale auth');
      logout();
    }

    // Update previous address
    if (walletAddress) {
      prevAddressRef.current = walletAddress;
    }
  }, [wallet.connected, walletAddress, isAuthenticated, user?.address, logout]);

  return (
    <div className="marble-bg relative min-h-screen">
      <div className="grain" />

      <header className="fixed left-0 right-0 top-0 z-50">
        <div className="nav-glass mx-4 mt-4 rounded-2xl border border-champagne-500/20 bg-white/5 backdrop-blur-xl">
          <nav className="flex items-center justify-between px-6 py-4">
            <Link to="/" className="flex items-center gap-3">
              <LogoIcon size={36} />
              <span className="font-heading text-xl font-semibold gold-gradient-text">
                ONYX
              </span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? 'text-champagne-300'
                        : 'text-white/60 hover:text-white/90'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 -z-10 rounded-lg bg-white/5"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-3 relative z-[100]">
              {isAuthenticated && wallet.connected && (
                <span className="hidden rounded-full bg-champagne-500/20 px-3 py-1 text-xs text-champagne-400 sm:inline">
                  {user?.role === 'brand' ? user.brand?.displayName : 'User'}
                </span>
              )}
              <WalletMultiButton />
            </div>
          </nav>
        </div>
      </header>

      <main className="px-4 pb-8 pt-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-white/40">
          <p>Powered by Aleo • Zero-Knowledge Privacy</p>
        </div>
      </footer>
    </div>
  );
};
