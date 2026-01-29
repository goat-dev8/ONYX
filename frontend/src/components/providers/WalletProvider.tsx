import { useMemo, FC, ReactNode } from 'react';
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

export const WalletProvider: FC<Props> = ({ children }) => {
  const wallets = useMemo(() => {
    const adapters = [];

    try {
      const leoAdapter = new LeoWalletAdapter({
        appName: 'ONYX',
      });
      console.log('[WalletProvider] LeoWalletAdapter created');
      adapters.push(leoAdapter);
    } catch (err) {
      console.warn('[WalletProvider] Leo adapter init error:', err);
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
  }, []);

  return (
    <AleoWalletProvider
      wallets={wallets}
      autoConnect={false}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={[ALEO_CONFIG.programId]}
      onError={(error) => {
        // Ignore connection errors on initial load
        if (error.name === 'WalletConnectionError') {
          console.log('[WalletProvider] Connection attempt failed, user can retry');
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
