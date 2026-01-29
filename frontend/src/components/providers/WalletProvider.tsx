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
      adapters.push(
        new LeoWalletAdapter({
          appName: 'ONYX',
          programIdPermissions: {
            testnet: [ALEO_CONFIG.programId],
            mainnet: [ALEO_CONFIG.programId],
          },
        })
      );
    } catch (err) {
      console.warn('[WalletProvider] Leo adapter init error:', err);
    }

    try {
      adapters.push(
        new ShieldWalletAdapter({
          appName: 'ONYX',
        })
      );
    } catch (err) {
      console.warn('[WalletProvider] Shield adapter init error:', err);
    }

    return adapters;
  }, []);

  return (
    <AleoWalletProvider
      wallets={wallets}
      autoConnect={true}
      decryptPermission={DecryptPermission.OnChainHistory}
      programs={[ALEO_CONFIG.programId]}
    >
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </AleoWalletProvider>
  );
};
