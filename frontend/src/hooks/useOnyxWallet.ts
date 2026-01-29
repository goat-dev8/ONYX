import { useCallback, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { ALEO_CONFIG, DEFAULT_FEE } from '../lib/aleo';
import { useUserStore } from '../stores/userStore';

export function useOnyxWallet() {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const { setUser, logout } = useUserStore();

  const walletAddress = wallet.connected ? (wallet as unknown as { address: string }).address : null;

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!wallet.connected || !walletAddress) {
      toast.error('Please connect your wallet first');
      return false;
    }

    setLoading(true);
    try {
      const { nonce, message } = await api.getNonce(walletAddress);

      const walletAny = wallet as unknown as {
        signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array } | string>;
      };

      if (!walletAny.signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      toast.loading('Please sign the message in your wallet...', { id: 'sign' });
      
      // Leo wallet expects Uint8Array for message
      const messageBytes = new TextEncoder().encode(message);
      const signResult = await walletAny.signMessage(messageBytes);
      toast.dismiss('sign');

      // Handle both string and object signature formats
      let signatureString: string;
      if (typeof signResult === 'string') {
        signatureString = signResult;
      } else if (signResult && typeof signResult === 'object' && 'signature' in signResult) {
        // Convert Uint8Array to base64 string
        const sigBytes = signResult.signature;
        signatureString = btoa(String.fromCharCode(...sigBytes));
      } else {
        signatureString = JSON.stringify(signResult);
      }

      const result = await api.verifySignature(walletAddress, signatureString, nonce);

      if (result.success && result.token) {
        localStorage.setItem('onyx_token', result.token);
        setUser({
          address: result.address,
          role: result.role as 'user' | 'brand',
          brand: result.brand ? { address: result.address, displayName: result.brand.displayName } : undefined,
          brandName: result.brand?.displayName,
          token: result.token,
        });
        toast.success('Authenticated successfully!');
        return true;
      }

      throw new Error('Authentication failed');
    } catch (err) {
      toast.dismiss('sign');
      console.error('[OnyxWallet] Auth error:', err);
      toast.error(err instanceof Error ? err.message : 'Authentication failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [wallet, walletAddress, setUser]);

  const executeMint = useCallback(
    async (
      tagHash: string,
      serialHash: string,
      modelId: number,
      initialOwner: string
    ): Promise<string | null> => {
      if (!wallet.connected || !walletAddress) {
        toast.error('Wallet not connected');
        return null;
      }

      const walletAny = wallet as unknown as {
        executeTransaction: (options: {
          program: string;
          function: string;
          inputs: string[];
          fee: number;
          privateFee?: boolean;
        }) => Promise<{ transactionId: string }>;
      };

      if (!walletAny.executeTransaction) {
        toast.error('Wallet does not support transactions');
        return null;
      }

      try {
        const txOptions = {
          program: ALEO_CONFIG.programId,
          function: 'mint_artifact',
          inputs: [
            `${tagHash}field`,
            `${serialHash}field`,
            `${modelId}u64`,
            initialOwner,
          ],
          fee: DEFAULT_FEE,
          privateFee: false,
        };

        console.log('[OnyxWallet] Submitting mint transaction:', txOptions);
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-mint' });

        const response = await walletAny.executeTransaction(txOptions);
        toast.dismiss('tx-mint');

        if (response?.transactionId) {
          console.log('[OnyxWallet] Mint tx submitted:', response.transactionId);
          toast.success('Mint transaction submitted!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-mint');
        console.error('[OnyxWallet] Mint error:', err);
        toast.error(err instanceof Error ? err.message : 'Mint failed');
        return null;
      }
    },
    [wallet, walletAddress]
  );

  const executeTransfer = useCallback(
    async (artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string }, newOwner: string): Promise<string | null> => {
      if (!wallet.connected) {
        toast.error('Wallet not connected');
        return null;
      }

      const walletAny = wallet as unknown as {
        executeTransaction: (options: {
          program: string;
          function: string;
          inputs: (string | { id: string } | { record: string })[];
          fee: number;
        }) => Promise<{ transactionId: string }>;
        requestRecordPlaintexts: (programId: string) => Promise<unknown[]>;
      };

      if (!walletAny.executeTransaction) {
        toast.error('Wallet does not support transactions');
        return null;
      }

      try {
        // Try different methods to get the record for the transaction
        let recordInput: string | { id: string } | { record: string };
        
        // Method 1: Use record ID if available (Leo Wallet style)
        if (artifact._raw?.id) {
          recordInput = { id: artifact._raw.id };
          console.log('[OnyxWallet] Using record ID:', artifact._raw.id);
        }
        // Method 2: Use ciphertext if available
        else if (artifact._raw?.ciphertext) {
          recordInput = artifact._raw.ciphertext;
          console.log('[OnyxWallet] Using ciphertext');
        }
        // Method 3: Use plaintext if available
        else if (artifact._plaintext) {
          recordInput = artifact._plaintext;
          console.log('[OnyxWallet] Using plaintext');
        }
        else {
          toast.error('Record not available. Please reconnect wallet.');
          return null;
        }

        const txOptions = {
          program: ALEO_CONFIG.programId,
          function: 'transfer_artifact',
          inputs: [recordInput, newOwner],
          fee: DEFAULT_FEE,
        };

        console.log('[OnyxWallet] Submitting transfer:', txOptions);
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-transfer' });

        const response = await walletAny.executeTransaction(txOptions);
        toast.dismiss('tx-transfer');

        if (response?.transactionId) {
          toast.success('Transfer submitted!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-transfer');
        console.error('[OnyxWallet] Transfer error:', err);
        toast.error(err instanceof Error ? err.message : 'Transfer failed');
        return null;
      }
    },
    [wallet]
  );

  const executeReportStolen = useCallback(
    async (artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string }): Promise<string | null> => {
      if (!wallet.connected) {
        toast.error('Wallet not connected');
        return null;
      }

      const walletAny = wallet as unknown as {
        executeTransaction: (options: {
          program: string;
          function: string;
          inputs: (string | { id: string })[];
          fee: number;
        }) => Promise<{ transactionId: string }>;
      };

      if (!walletAny.executeTransaction) {
        toast.error('Wallet does not support transactions');
        return null;
      }

      try {
        // Try different methods to get the record for the transaction
        let recordInput: string | { id: string };
        
        if (artifact._raw?.id) {
          recordInput = { id: artifact._raw.id };
        } else if (artifact._raw?.ciphertext) {
          recordInput = artifact._raw.ciphertext;
        } else if (artifact._plaintext) {
          recordInput = artifact._plaintext;
        } else {
          toast.error('Record not available. Please reconnect wallet.');
          return null;
        }

        const txOptions = {
          program: ALEO_CONFIG.programId,
          function: 'report_stolen',
          inputs: [recordInput],
          fee: DEFAULT_FEE,
        };

        console.log('[OnyxWallet] Submitting report stolen:', txOptions);
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-stolen' });

        const response = await walletAny.executeTransaction(txOptions);
        toast.dismiss('tx-stolen');

        if (response?.transactionId) {
          toast.success('Report submitted!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-stolen');
        console.error('[OnyxWallet] Report stolen error:', err);
        toast.error(err instanceof Error ? err.message : 'Report failed');
        return null;
      }
    },
    [wallet]
  );

  const executeProveForResale = useCallback(
    async (artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string }, salt: string): Promise<{ txId: string; token: string } | null> => {
      if (!wallet.connected) {
        toast.error('Wallet not connected');
        return null;
      }

      const walletAny = wallet as unknown as {
        executeTransaction: (options: {
          program: string;
          function: string;
          inputs: (string | { id: string })[];
          fee: number;
        }) => Promise<{ transactionId: string }>;
      };

      if (!walletAny.executeTransaction) {
        toast.error('Wallet does not support transactions');
        return null;
      }

      try {
        // Try different methods to get the record for the transaction
        let recordInput: string | { id: string };
        
        if (artifact._raw?.id) {
          recordInput = { id: artifact._raw.id };
        } else if (artifact._raw?.ciphertext) {
          recordInput = artifact._raw.ciphertext;
        } else if (artifact._plaintext) {
          recordInput = artifact._plaintext;
        } else {
          toast.error('Record not available. Please reconnect wallet.');
          return null;
        }

        const txOptions = {
          program: ALEO_CONFIG.programId,
          function: 'prove_for_resale',
          inputs: [recordInput, `${salt}field`],
          fee: DEFAULT_FEE,
        };

        console.log('[OnyxWallet] Submitting prove for resale:', txOptions);
        toast.loading('Generating proof...', { id: 'tx-prove' });

        const response = await walletAny.executeTransaction(txOptions);
        toast.dismiss('tx-prove');

        if (response?.transactionId) {
          const proofToken = `proof_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          toast.success('Proof generated!');
          return { txId: response.transactionId, token: proofToken };
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-prove');
        console.error('[OnyxWallet] Prove error:', err);
        toast.error(err instanceof Error ? err.message : 'Proof generation failed');
        return null;
      }
    },
    [wallet]
  );

  const fetchRecords = useCallback(async (): Promise<unknown[]> => {
    if (!wallet.connected) {
      return [];
    }

    const walletAny = wallet as unknown as {
      requestRecords: (programId: string) => Promise<unknown[]>;
    };

    if (!walletAny.requestRecords) {
      console.warn('[OnyxWallet] Wallet does not support requestRecords');
      return [];
    }

    try {
      // Leo Wallet may throw INVALID_PARAMS or NOT_GRANTED if permissions not granted
      // This is expected behavior - users can still use backend-stored artifacts
      const records = await walletAny.requestRecords(ALEO_CONFIG.programId);
      console.log('[OnyxWallet] Fetched records from wallet:', records);

      if (!Array.isArray(records)) {
        console.warn('[OnyxWallet] Records is not an array:', records);
        return [];
      }

      const validRecords = (records as Array<{ 
        spent?: boolean; 
        recordName?: string; 
        plaintext?: string;
        ciphertext?: string;
        owner?: string;
        data?: {
          brand?: string;
          tag_hash?: string;
          serial_hash?: string;
          model_id?: string;
          nonce_seed?: string;
          _version?: string;
        };
        nonce?: string;
      }>).filter(
        (r) => !r.spent && r.recordName === 'AssetArtifact'
      );

      return validRecords.map((record) => {
        // If plaintext is provided, use it. Otherwise reconstruct from data
        let plaintext = record.plaintext;
        
        if (!plaintext && record.data) {
          // Reconstruct the record plaintext in Aleo format
          // Format: { owner: address.private, field1: value.private, ... }
          const d = record.data;
          plaintext = `{
  owner: ${record.owner}.private,
  brand: ${d.brand || ''},
  tag_hash: ${d.tag_hash || ''},
  serial_hash: ${d.serial_hash || ''},
  model_id: ${d.model_id || ''},
  nonce_seed: ${d.nonce_seed || ''},
  _nonce: ${record.nonce || '0group.public'}
}`;
          console.log('[OnyxWallet] Reconstructed plaintext:', plaintext);
        }
        
        return {
          ...record,
          _fromWallet: true,
          _raw: record,
          _plaintext: plaintext,
        };
      });
    } catch (err) {
      // INVALID_PARAMS or NOT_GRANTED errors are expected when wallet doesn't have
      // record permissions for this program. Backend artifacts are the primary source.
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('INVALID_PARAMS') || errorMessage.includes('NOT_GRANTED')) {
        console.log('[OnyxWallet] Wallet record permissions not granted - using backend artifacts only');
      } else {
        console.error('[OnyxWallet] Fetch records error:', err);
      }
      return [];
    }
  }, [wallet]);

  return {
    wallet,
    walletAddress,
    connected: wallet.connected,
    connecting: wallet.connecting,
    loading,
    authenticate,
    executeMint,
    executeTransfer,
    executeReportStolen,
    executeProveForResale,
    fetchRecords,
    logout,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
  };
}
