import { useMemo, FC, ReactNode, useEffect, useState } from 'react';
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';

import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';

import { ALEO_CONFIG } from '../../lib/aleo';

interface Props {
  children: ReactNode;
}

// Check if Leo Wallet extension is installed
const isLeoWalletInstalled = (): boolean => {
  return typeof window !== 'undefined' && !!(window as unknown as { leoWallet?: unknown }).leoWallet;
};

export const WalletProvider: FC<Props> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  // Wait a bit for wallet extensions to initialize
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
      console.log('[WalletProvider] Ready, Leo wallet installed:', isLeoWalletInstalled());
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const wallets = useMemo(() => {
    if (!isReady) return [];
    
    const adapters = [];

    // Only add Leo adapter if extension is detected
    if (isLeoWalletInstalled()) {
      try {
        const leoAdapter = new LeoWalletAdapter({
          appName: 'ONYX',
        });
        console.log('[WalletProvider] LeoWalletAdapter created');
        adapters.push(leoAdapter);
      } catch (err) {
        console.warn('[WalletProvider] Leo adapter init error:', err);
      }
    } else {
      console.log('[WalletProvider] Leo wallet not detected');
    }

    try {
      const shieldAdapter = new ShieldWalletAdapter({
        appName: 'ONYX',
      });
      console.log('[WalletProvider] ShieldWalletAdapter created');
      adapters.push(shieldAdapter);
    } catch (err) {
      console.warn('[WalletProvider] Shield adapter init error:', err);
    }

    return adapters;
  }, [isReady]);

  // Show loading while detecting wallets
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-onyx-950">
        <div className="text-champagne-400 animate-pulse">Loading wallet...</div>
      </div>
    );
  }

  return (
    <AleoWalletProvider
      wallets={wallets}
      autoConnect={false}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[ALEO_CONFIG.programId]}
      onError={(error) => {
        // Completely suppress connection errors - they happen often with Leo Wallet
        if (error.name === 'WalletConnectionError') {
          // Don't log these - they spam the console
          return;
        }
        console.warn('[WalletProvider] Wallet error:', error);
      }}
    >
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </AleoWalletProvider>
  );
};
