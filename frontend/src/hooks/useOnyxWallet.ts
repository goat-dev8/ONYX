import { useCallback, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { ALEO_CONFIG, DEFAULT_FEE, fetchRecordCiphertextFromBlock, parseRecordPlaintext } from '../lib/aleo';
import {
  USDCX_PROGRAM_ID,
  generateSalt,
  generateFreezeListProof,
  getFreezeListCount,
  findSuitableUsdcxRecord,
} from '../lib/usdcx';
import { useUserStore } from '../stores/userStore';

// Shared wallet executor type
interface WalletExecutor {
  executeTransaction: (options: {
    program: string;
    function: string;
    inputs: (string | { id: string } | { record: string })[];
    fee: number;
    privateFee?: boolean;
  }) => Promise<{ transactionId: string }>;
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array } | string>;
  requestRecords?: (programId: string, includePlaintext?: boolean) => Promise<unknown[]>;
  decrypt?: (cipherText: string, tpk?: string, programId?: string, functionName?: string, index?: number) => Promise<string>;
  transactionStatus?: (txId: string) => Promise<string | { status: string }>;
}

// Extract record input from artifact for wallet transactions.
// For custom program records (EscrowReceipt, AssetArtifact) with Shield wallet,
// prefer recordCiphertext — Shield wallet decrypts internally during proving and
// handles _version correctly. For credits.aleo records, plaintext works fine.
function getRecordInput(
  artifact: { _plaintext?: string; _raw?: Record<string, unknown> }
): string | { id: string } | null {
  const raw = artifact._raw;
  // 1. Leo wallet record ID (Leo wallet handles everything internally)
  if (raw?.id && typeof raw.id === 'string') return { id: raw.id };

  //    create_escrow (which works). _version is preserved for proof validity.
  if (raw?.recordPlaintext && typeof raw.recordPlaintext === 'string') {
    console.log('[OnyxWallet] Using recordPlaintext (Shield wallet native)');
    return raw.recordPlaintext as string;
  }

  // 3. Shield wallet ciphertext fallback
  if (raw?.recordCiphertext && typeof raw.recordCiphertext === 'string') {
    console.log('[OnyxWallet] Using recordCiphertext (Shield wallet fallback)');
    return raw.recordCiphertext as string;
  }

  // 4. Leo wallet ciphertext
  if (raw?.ciphertext && typeof raw.ciphertext === 'string') {
    console.log('[OnyxWallet] Using ciphertext from wallet');
    return raw.ciphertext as string;
  }

  // 5. Generic plaintext (set by decrypt strategies)
  if (raw?.plaintext && typeof raw.plaintext === 'string') return raw.plaintext as string;

  // 6. Our constructed/decrypted plaintext (fallback)
  if (artifact._plaintext) {
    console.log('[OnyxWallet] Using constructed _plaintext:', artifact._plaintext.substring(0, 120));
    return artifact._plaintext;
  }
  console.warn('[OnyxWallet] getRecordInput: no usable record input found');
  return null;
}

// Construct a credits.aleo record plaintext from wallet record object fields.
// Leo Wallet V2 returns records as objects with {owner, data, nonce, ciphertext, ...}
// but does NOT include a `plaintext` property. The Aleo prover requires the plaintext,
// NOT the ciphertext. So we build it from the structured fields.
function constructCreditsPlaintext(rec: Record<string, unknown>): string | null {
  // Get owner
  let owner = rec.owner as string | undefined;
  if (!owner || typeof owner !== 'string') return null;
  if (!owner.endsWith('.private')) owner += '.private';

  // Get microcredits from data.microcredits or top-level
  let mcRaw: string | undefined;
  const data = rec.data as Record<string, unknown> | undefined;
  if (data?.microcredits !== undefined) {
    mcRaw = String(data.microcredits);
  } else if (rec.microcredits !== undefined) {
    mcRaw = String(rec.microcredits);
  }
  if (!mcRaw) return null;

  // Parse the numeric value from formats like "15000000u64.private", "15000000u64", "15000000"
  const numMatch = mcRaw.match(/(\d[\d_]*)/);
  if (!numMatch) return null;
  const mcValue = numMatch[1].replace(/_/g, '');

  // Get nonce (crucial — must be the exact group element)
  let nonce = String(rec.nonce || rec._nonce || '0group.public');
  if (!nonce.includes('group')) nonce += 'group.public';
  else if (!nonce.endsWith('.public')) nonce += '.public';

  const pt = `{\n  owner: ${owner},\n  microcredits: ${mcValue}u64.private,\n  _nonce: ${nonce}\n}`;
  console.log('[OnyxWallet] Constructed credits plaintext:', pt);
  return pt;
}

// Extract a usable plaintext string from a raw credits record.
// NEVER returns ciphertext — ciphertext causes "Failed to parse input" errors.
function extractCreditsRecordInput(r: unknown): string | null {
  if (typeof r === 'string') return r; // record is its own plaintext
  if (!r || typeof r !== 'object') return null;
  const rec = r as Record<string, unknown>;

  // 1. Direct plaintext property (some wallet adapters include this)
  if (rec.plaintext && typeof rec.plaintext === 'string') return rec.plaintext;
  if (rec._plaintext && typeof rec._plaintext === 'string') return rec._plaintext;

  // 2. Construct plaintext from record fields (Leo Wallet V2 format)
  const constructed = constructCreditsPlaintext(rec);
  if (constructed) return constructed;

  // 3. Do NOT return ciphertext — it causes "Failed to parse input" errors
  console.warn('[OnyxWallet] Cannot extract plaintext from record, keys:', Object.keys(rec));
  return null;
}

// Parse microcredits from a credits record (handles many wallet adapter formats)
function parseMicrocredits(r: unknown): number {
  if (typeof r === 'string') {
    // Record is a plaintext string like "{ owner: ..., microcredits: 13000000u64.private, ... }"
    const match = r.match(/microcredits\s*:\s*([\d_]+)u64/);
    return match ? parseInt(match[1].replace(/_/g, ''), 10) : 0;
  }
  if (!r || typeof r !== 'object') return 0;
  const rec = r as Record<string, unknown>;

  // 1. Structured data.microcredits
  const data = rec.data as Record<string, unknown> | undefined;
  if (data?.microcredits) {
    return parseInt(String(data.microcredits).replace(/u64|\.private/g, ''), 10) || 0;
  }

  // 2. Top-level microcredits
  if (rec.microcredits !== undefined) {
    if (typeof rec.microcredits === 'number') return rec.microcredits;
    return parseInt(String(rec.microcredits).replace(/u64|\.private/g, ''), 10) || 0;
  }

  // 3. Parse from plaintext string
  const pt = (rec.plaintext || rec._plaintext) as string | undefined;
  if (pt && typeof pt === 'string') {
    const match = pt.match(/microcredits\s*:\s*([\d_]+)u64/);
    if (match) return parseInt(match[1].replace(/_/g, ''), 10);
  }

  return 0;
}

// Find a suitable private credits record from the wallet
async function findCreditsRecord(
  executor: WalletExecutor,
  minAmount: number
): Promise<string | null> {
  if (!executor.requestRecords) {
    console.warn('[OnyxWallet] Wallet does not support requestRecords');
    return null;
  }

  try {
    const rawRecords = await executor.requestRecords('credits.aleo');
    console.log('[OnyxWallet] Credits records returned:', rawRecords?.length, rawRecords);

    if (!rawRecords || !Array.isArray(rawRecords) || rawRecords.length === 0) {
      console.warn('[OnyxWallet] No credits records returned');
      return null;
    }

    // First pass: find a record with enough balance
    let fallbackRecord: string | null = null;
    for (const r of rawRecords) {
      const rec = r as Record<string, unknown>;
      // Skip spent records
      if (rec.spent === true) continue;

      const mc = parseMicrocredits(r);
      let input = extractCreditsRecordInput(r);

      // If plaintext extraction failed, try decrypting the ciphertext via wallet
      if (!input && executor.decrypt) {
        const ct = (rec.ciphertext || rec.recordCiphertext) as string | undefined;
        if (ct && typeof ct === 'string') {
          try {
            input = await executor.decrypt(ct);
            console.log('[OnyxWallet] Decrypted record plaintext:', input);
          } catch (e) {
            console.warn('[OnyxWallet] Decrypt failed for record:', e);
          }
        }
      }

      if (!input) continue;

      // Save first non-spent record as fallback (in case amount parsing fails)
      if (!fallbackRecord) fallbackRecord = input;

      if (mc >= minAmount) {
        console.log('[OnyxWallet] Found credits record with', mc, 'microcredits');
        return input;
      }
    }

    // If we found records but none had enough parsed balance,
    // return the fallback — the wallet will validate the actual balance
    if (fallbackRecord) {
      console.warn('[OnyxWallet] No record with parsed balance >=', minAmount, '— using fallback record');
      return fallbackRecord;
    }

    console.warn('[OnyxWallet] All records are spent or unparseable');
    return null;
  } catch (err) {
    console.error('[OnyxWallet] Error fetching credits records:', err);
    return null;
  }
}

// Module-level lock to prevent concurrent authenticate() calls.
// Multiple components/effects (and React StrictMode) can trigger auth
// simultaneously, causing the backend nonce to be overwritten before
// the first verify completes.
let _authInProgress: Promise<boolean> | null = null;

// Parse an Aleo record plaintext string into structured data fields.
// Handles both Leo wallet and Shield wallet formats.
// Example: "{ owner: aleo1xxx.private, tag_hash: 123field.private, model_id: 42u64.private, ... }"
// Extract a single field value from a raw record, trying all possible locations.
function extractRecordField(record: Record<string, unknown>, fieldName: string): string {
  // 1. Structured data object
  const data = record.data as Record<string, string> | undefined;
  if (data && data[fieldName]) return data[fieldName];

  // 2. Top-level property on the record (some wallets flatten fields)
  const topLevel = record[fieldName];
  if (topLevel && typeof topLevel === 'string') return topLevel;

  // 3. Parse from plaintext string
  const pt = (record.plaintext || record._plaintext) as string | undefined;
  if (pt && typeof pt === 'string') {
    const regex = new RegExp(`${fieldName}\\s*:\\s*([^,}\\n]+)`);
    const match = pt.match(regex);
    if (match && match[1]) return match[1].trim();
  }

  return '';
}

export function useOnyxWallet() {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const { setUser, logout } = useUserStore();

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  const getExecutor = useCallback((): WalletExecutor | null => {
    if (!wallet.connected) return null;
    const w = wallet as unknown as WalletExecutor;
    return typeof w.executeTransaction === 'function' ? w : null;
  }, [wallet]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!wallet.connected || !walletAddress) {
      toast.error('Please connect your wallet first');
      return false;
    }

    // If another auth call is already running, wait for it instead of
    // starting a second one (which would overwrite the nonce).
    if (_authInProgress) {
      return _authInProgress;
    }

    const doAuth = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const { nonce, message } = await api.getNonce(walletAddress);

      const walletAny = wallet as unknown as WalletExecutor;
      if (!walletAny.signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      toast.loading('Please sign the message in your wallet...', { id: 'sign' });
      const messageBytes = new TextEncoder().encode(message);
      const signResult = await walletAny.signMessage(messageBytes);
      toast.dismiss('sign');

      let signatureString: string;
      if (typeof signResult === 'string') {
        signatureString = signResult;
      } else if (signResult && typeof signResult === 'object' && 'signature' in signResult) {
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
          brand: result.brand
            ? { address: result.address, displayName: result.brand.displayName }
            : undefined,
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
    }; // end doAuth

    _authInProgress = doAuth();
    try {
      return await _authInProgress;
    } finally {
      _authInProgress = null;
    }
  }, [wallet, walletAddress, setUser]);

  // ========== Core Transitions ==========

  // Self-register as a brand on-chain (v3 — any user can call)
  const executeRegisterBrand = useCallback(
    async (): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Registering brand on-chain...', { id: 'tx-register-brand' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'register_brand',
          inputs: [],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-register-brand');

        if (response?.transactionId) {
          toast.success('Brand registered on-chain!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-register-brand');
        console.error('[OnyxWallet] Register brand error:', err);
        toast.error(err instanceof Error ? err.message : 'Brand registration failed');
        return null;
      }
    },
    [getExecutor]
  );

  // Legacy: authorize brand (v2 admin-only — kept for backward compatibility)
  const executeAuthorizeBrand = useCallback(
    async (brandAddress: string): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Authorizing brand on-chain...', { id: 'tx-auth-brand' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'authorize_brand',
          inputs: [brandAddress],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-auth-brand');

        if (response?.transactionId) {
          toast.success('Brand authorized on-chain!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-auth-brand');
        console.error('[OnyxWallet] Authorize brand error:', err);
        toast.error(err instanceof Error ? err.message : 'Brand authorization failed');
        return null;
      }
    },
    [getExecutor]
  );

  const executeMint = useCallback(
    async (
      tagHash: string,
      serialHash: string,
      modelId: number,
      initialOwner: string
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor || !walletAddress) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-mint' });

        const response = await executor.executeTransaction({
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
        });

        toast.dismiss('tx-mint');

        if (response?.transactionId) {
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
    [getExecutor, walletAddress]
  );

  const executeTransfer = useCallback(
    async (
      artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string },
      newOwner: string
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(artifact);
      if (!recordInput) {
        toast.error('Record not available. Please reconnect wallet.');
        return null;
      }

      try {
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-transfer' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'transfer_artifact',
          inputs: [recordInput, newOwner],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

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
    [getExecutor]
  );

  const executeReportStolen = useCallback(
    async (
      artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string }
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(artifact);
      if (!recordInput) {
        toast.error('Record not available. Please reconnect wallet.');
        return null;
      }

      try {
        toast.loading('Waiting for wallet confirmation...', { id: 'tx-stolen' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'report_stolen',
          inputs: [recordInput],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

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
    [getExecutor]
  );

  const executeProveForResale = useCallback(
    async (
      artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string },
      salt: string,
      verifierAddress?: string
    ): Promise<{ txId: string; token: string } | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(artifact);
      if (!recordInput) {
        toast.error('Record not available. Please reconnect wallet.');
        return null;
      }

      // v4 requires a verifier address for private proof delivery
      const verifier = verifierAddress || walletAddress;
      if (!verifier) {
        toast.error('Verifier address required for v4 private proofs');
        return null;
      }

      try {
        toast.loading('Generating private proof...', { id: 'tx-prove' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'prove_for_resale',
          inputs: [recordInput, `${salt}field`, verifier],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-prove');

        if (response?.transactionId) {
          const proofToken = `onyx_proof_${response.transactionId.slice(0, 20)}`;
          toast.success('Private proof generated! ProofChallenge sent to verifier.');
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
    [getExecutor, walletAddress]
  );

  // ========== Escrow System (credits.aleo) ==========

  const executeCreateEscrow = useCallback(
    async (
      tagHash: string,
      amount: number,
      sellerAddress: string,
      escrowSalt: string
    ): Promise<{ txId: string; escrowId: string } | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Finding credits record for escrow...', { id: 'tx-escrow-create' });

        const creditsRecordInput = await findCreditsRecord(executor, amount);

        if (!creditsRecordInput) {
          toast.dismiss('tx-escrow-create');
          toast.error('No private credits record found. Please shield credits first (convert public to private).');
          return null;
        }

        toast.loading('Creating escrow deposit...', { id: 'tx-escrow-create' });

        // Contract signature: create_escrow(pay_record, tag_hash, amount, seller, escrow_salt)
        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'create_escrow',
          inputs: [
            creditsRecordInput,      // pay_record: credits.aleo/credits (FIRST!)
            `${tagHash}field`,       // tag_hash
            `${amount}u64`,          // amount in microcredits
            sellerAddress,           // seller address
            `${escrowSalt}field`,    // unique salt
          ],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-escrow-create');

        if (response?.transactionId) {
          toast.success('Escrow created! Credits deposited.');
          return {
            txId: response.transactionId,
            escrowId: `escrow_${response.transactionId.slice(0, 16)}`,
          };
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-escrow-create');
        console.error('[OnyxWallet] Create escrow error:', err);
        toast.error(err instanceof Error ? err.message : 'Escrow creation failed');
        return null;
      }
    },
    [getExecutor]
  );

  const executeReleaseEscrow = useCallback(
    async (
      receipt: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string } }
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(receipt);
      if (!recordInput) {
        toast.error('Escrow receipt not available.');
        return null;
      }

      try {
        toast.loading('Releasing escrow — proving may take 5-10 min...', { id: 'tx-escrow-release' });

        console.log('[OnyxWallet] release_escrow — input type:', typeof recordInput === 'string' ? (recordInput.startsWith('record1') ? 'ciphertext' : 'plaintext') : 'object', '| fee: public');

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'release_escrow',
          inputs: [recordInput],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        console.log('[OnyxWallet] release_escrow response:', response?.transactionId);
        toast.dismiss('tx-escrow-release');

        if (response?.transactionId) {
          const txId = response.transactionId;
          console.log('[OnyxWallet] release_escrow txId:', txId);

          // Shield wallet returns shield_... IDs for pending proves — NOT real on-chain TXs
          // Poll transactionStatus 
          if (txId.startsWith('shield_') || !txId.startsWith('at1')) {
            console.warn('[OnyxWallet] Got wallet pending ID (not confirmed yet):', txId);
            toast.loading('Proving in progress — this may take 5-10 min...', { id: 'tx-escrow-release', duration: 600000 });

            const walletAny = wallet as unknown as WalletExecutor;
            if (walletAny.transactionStatus) {
              let attempts = 0;
              const MAX_ATTEMPTS = 180; // ~6 min at 2s intervals
              while (attempts < MAX_ATTEMPTS) {
                attempts++;
                await new Promise(r => setTimeout(r, 2000));
                try {
                  const statusRes = await walletAny.transactionStatus(txId);
                  const statusStr = typeof statusRes === 'string'
                    ? statusRes.toLowerCase()
                    : (statusRes as { status: string })?.status?.toLowerCase();
                  console.log(`[OnyxWallet] release_escrow poll #${attempts}: status=${statusStr}`);

                  if (statusStr === 'completed' || statusStr === 'finalized' || statusStr === 'accepted') {
                    toast.dismiss('tx-escrow-release');
                    toast.success(`Escrow released! Transaction confirmed on-chain.`);
                    return txId;
                  } else if (statusStr === 'rejected' || statusStr === 'failed') {
                    toast.dismiss('tx-escrow-release');
                    toast.error('Transaction was rejected on-chain.');
                    return null;
                  }
                } catch (pollErr) {
                  console.warn('[OnyxWallet] Status poll error:', pollErr);
                }
              }
              toast.dismiss('tx-escrow-release');
              toast.success('Transaction submitted. Check Shield wallet Activity for final status.', { duration: 10000 });
            } else {
              toast.dismiss('tx-escrow-release');
              toast.success('Transaction submitted to wallet for proving. Check Shield wallet Activity tab.', { duration: 10000 });
            }
          } else {
            toast.success(`Escrow released! TX: ${txId.substring(0, 20)}...`);
          }
          return txId;
        }

        console.warn('[OnyxWallet] release_escrow: No transactionId in response:', response);
        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-escrow-release');
        console.error('[OnyxWallet] Release escrow error:', err instanceof Error ? err.message : err);
        toast.error(err instanceof Error ? err.message : 'Escrow release failed');
        return null;
      }
    },
    [getExecutor]
  );

  const executeRefundEscrow = useCallback(
    async (
      receipt: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string } }
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(receipt);
      if (!recordInput) {
        toast.error('Escrow receipt not available.');
        return null;
      }

      try {
        toast.loading('Refunding escrow — proving may take 5-10 min...', { id: 'tx-escrow-refund' });

        console.log('[OnyxWallet] refund_escrow input:', typeof recordInput === 'string' ? recordInput.substring(0, 200) + '...' : recordInput);
        console.log('[OnyxWallet] refund_escrow calling executeTransaction at', new Date().toISOString());

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'refund_escrow',
          inputs: [recordInput],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        console.log('[OnyxWallet] refund_escrow response:', JSON.stringify(response, null, 2));
        console.log('[OnyxWallet] refund_escrow completed at', new Date().toISOString());
        toast.dismiss('tx-escrow-refund');

        if (response?.transactionId) {
          toast.success('Escrow refunded! Credits returned.');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-escrow-refund');
        console.error('[OnyxWallet] Refund escrow error:', err);
        toast.error(err instanceof Error ? err.message : 'Escrow refund failed');
        return null;
      }
    },
    [getExecutor]
  );

  // ========== Bounty System ==========

  const executeReportStolenWithBounty = useCallback(
    async (
      artifact: { _plaintext?: string; _raw?: { id?: string; ciphertext?: string }; tagHash: string },
      bountyAmount: number
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      const recordInput = getRecordInput(artifact);
      if (!recordInput) {
        toast.error('Record not available. Please reconnect wallet.');
        return null;
      }

      try {
        toast.loading('Finding credits for bounty deposit...', { id: 'tx-bounty' });

        const creditsInput = await findCreditsRecord(executor, bountyAmount);

        if (!creditsInput) {
          toast.dismiss('tx-bounty');
          toast.error('No private credits record found. Please shield credits first.');
          return null;
        }

        toast.loading('Reporting stolen with bounty...', { id: 'tx-bounty' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'report_stolen_with_bounty',
          inputs: [recordInput, creditsInput, `${bountyAmount}u64`],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-bounty');

        if (response?.transactionId) {
          toast.success('Stolen report filed with bounty!');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-bounty');
        console.error('[OnyxWallet] Report stolen with bounty error:', err);
        toast.error(err instanceof Error ? err.message : 'Bounty report failed');
        return null;
      }
    },
    [getExecutor]
  );

  // ========== Verification Payments (Credits) ==========

  const executePayVerification = useCallback(
    async (
      tagHash: string,
      amount: number,
      seller: string,
      saltOverride?: string
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Finding credits for verification payment...', { id: 'tx-pay-verify' });

        const creditsInput = await findCreditsRecord(executor, amount + DEFAULT_FEE);

        if (!creditsInput) {
          toast.dismiss('tx-pay-verify');
          toast.error('No private credits record found. Please shield credits first.');
          return null;
        }

        // Generate salt and payment secret
        const salt = saltOverride || generateSalt();
        const paymentSecret = generateSalt(); // Random field for replay prevention

        toast.loading('Submitting verification payment...', { id: 'tx-pay-verify' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'pay_verification',
          inputs: [
            creditsInput,
            tagHash,
            `${amount}u64`,
            seller,
            salt,
            paymentSecret,
          ],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-pay-verify');

        if (response?.transactionId) {
          toast.success('Verification payment sent!');
          console.log('[OnyxWallet] pay_verification tx:', response.transactionId, 'salt:', salt);
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-pay-verify');
        console.error('[OnyxWallet] Pay verification error:', err);
        toast.error(err instanceof Error ? err.message : 'Verification payment failed');
        return null;
      }
    },
    [getExecutor]
  );

  // ========== Verification Payments (USDCx) ==========
  // Single cross-program call: our contract calls test_usdcx_stablecoin.aleo/transfer_private internally

  const executePayVerificationUsdcx = useCallback(
    async (
      tagHash: string,
      amount: bigint,
      seller: string,
      saltOverride?: string
    ): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Finding USDCx token for payment...', { id: 'tx-pay-usdcx' });

        // Fetch USDCx token records
        if (!executor.requestRecords) {
          toast.dismiss('tx-pay-usdcx');
          toast.error('Wallet does not support record requests');
          return null;
        }

        const usdcxRecords = await executor.requestRecords(USDCX_PROGRAM_ID, true) as Record<string, unknown>[];
        const tokenRecord = await findSuitableUsdcxRecord(
          usdcxRecords,
          amount,
          executor.decrypt
        );

        if (!tokenRecord) {
          toast.dismiss('tx-pay-usdcx');
          toast.error(`No USDCx record with sufficient balance (need ${amount} microUSDCx)`);
          return null;
        }

        // Get token record input for cross-program call (same priority as getRecordInput)
        const tokenRec = tokenRecord as Record<string, unknown>;
        const tokenInput = tokenRec.recordPlaintext   // Shield wallet native plaintext
          || tokenRec.plaintext
          || (tokenRec as { id?: string }).id
          || tokenRec.recordCiphertext;

        if (!tokenInput) {
          toast.dismiss('tx-pay-usdcx');
          toast.error('Cannot extract USDCx token record');
          return null;
        }

        // Generate freeze-list compliance proofs
        toast.loading('Generating freeze-list compliance proofs...', { id: 'tx-pay-usdcx' });

        const freezeCount = await getFreezeListCount();
        const buyerProof = await generateFreezeListProof(
          walletAddress || '',
          freezeCount
        );
        const sellerProof = await generateFreezeListProof(seller, freezeCount);

        // Generate payment salt and secret
        const salt = saltOverride || generateSalt();
        const paymentSecret = generateSalt();

        // Single cross-program call — contract handles USDCx transfer internally
        toast.loading('Processing USDCx payment...', { id: 'tx-pay-usdcx' });

        const response = await executor.executeTransaction({
          program: ALEO_CONFIG.programId,
          function: 'pay_verification_usdcx',
          inputs: [
            tokenInput as string,
            seller,
            `${amount}u128`,
            salt,
            paymentSecret,
            tagHash,
            `[${buyerProof}, ${sellerProof}]`,
          ],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-pay-usdcx');

        if (response?.transactionId) {
          toast.success('USDCx verification payment complete!');
          console.log('[OnyxWallet] pay_verification_usdcx tx:', response.transactionId, 'salt:', salt);
          return response.transactionId;
        }

        throw new Error('USDCx payment failed');
      } catch (err) {
        toast.dismiss('tx-pay-usdcx');
        console.error('[OnyxWallet] USDCx pay verification error:', err);
        toast.error(err instanceof Error ? err.message : 'USDCx payment failed');
        return null;
      }
    },
    [getExecutor, walletAddress]
  );

  // ========== Credits Public → Private Conversion ==========

  const convertPublicToPrivate = useCallback(
    async (amount: number): Promise<string | null> => {
      const executor = getExecutor();
      if (!executor) {
        toast.error('Wallet not connected');
        return null;
      }

      try {
        toast.loading('Converting public credits to private...', { id: 'tx-convert' });

        const recipient = walletAddress;
        if (!recipient) {
          toast.dismiss('tx-convert');
          toast.error('Wallet address not available');
          return null;
        }

        const response = await executor.executeTransaction({
          program: 'credits.aleo',
          function: 'transfer_public_to_private',
          inputs: [recipient, `${amount}u64`],
          fee: DEFAULT_FEE,
          privateFee: false,
        });

        toast.dismiss('tx-convert');

        if (response?.transactionId) {
          toast.success('Credits converted to private! They will be available after confirmation.');
          return response.transactionId;
        }

        throw new Error('No transaction ID returned');
      } catch (err) {
        toast.dismiss('tx-convert');
        console.error('[OnyxWallet] Convert public to private error:', err);
        toast.error(err instanceof Error ? err.message : 'Conversion failed');
        return null;
      }
    },
    [getExecutor, walletAddress]
  );

  // ========== Record Fetching ==========

  const fetchRecords = useCallback(async (): Promise<unknown[]> => {
    if (!wallet.connected) return [];

    const walletAny = wallet as unknown as WalletExecutor;
    if (!walletAny.requestRecords) {
      console.warn('[OnyxWallet] Wallet does not support requestRecords');
      return [];
    }

    try {
      // Pass includePlaintext=true so wallets return decrypted record data
      const records = await walletAny.requestRecords(ALEO_CONFIG.programId, true);
      if (!Array.isArray(records)) {
        console.warn('[OnyxWallet] Records is not an array:', records);
        return [];
      }

      // Full JSON dump of ALL records for diagnostic purposes
      for (let i = 0; i < records.length; i++) {
        try {
          console.log(`[OnyxWallet] Full raw record[${i}] dump:`, JSON.stringify(records[i], null, 2));
        } catch { console.log(`[OnyxWallet] Record[${i}] not serializable, keys:`, Object.keys(records[i] as Record<string, unknown>)); }
      }

      // Log raw records for debugging wallet-specific formats
      console.log('[OnyxWallet] Raw records from wallet:', records.length, records.map((r: unknown) => {
        const rec = r as Record<string, unknown>;
        return { keys: Object.keys(rec), recordName: rec.recordName, spent: rec.spent, hasData: !!rec.data, hasPlaintext: !!rec.plaintext, hasCiphertext: !!rec.ciphertext };
      }));

      type WalletRecord = Record<string, unknown> & {
        spent?: boolean;
        recordName?: string;
        plaintext?: string;
        ciphertext?: string;
        owner?: string;
        data?: Record<string, string>;
        nonce?: string;
        blockHeight?: number;
        commitment?: string;
        functionName?: string;
      };

      // Filter: unspent records that belong to our program.
      // Shield wallet may use recordName OR functionName — accept both patterns.
      const validRecords = (records as WalletRecord[]).filter((r) => {
        if (r.spent) return false;
        // Accept by recordName (Leo wallet style) — v4 adds MintCertificate, ProofToken, ProofChallenge, BountyPledge
        if (r.recordName === 'AssetArtifact' || r.recordName === 'EscrowReceipt' || r.recordName === 'BuyerReceipt' || r.recordName === 'SellerReceipt' || r.recordName === 'MintCertificate' || r.recordName === 'ProofToken' || r.recordName === 'ProofChallenge' || r.recordName === 'BountyPledge') return true;
        // Accept by functionName (Shield wallet style — knows the function that created the record)
        if (r.functionName === 'mint_artifact' || r.functionName === 'create_escrow' || r.functionName === 'pay_verification' || r.functionName === 'pay_verification_usdcx' || r.functionName === 'prove_for_resale' || r.functionName === 'report_stolen_with_bounty' || r.functionName === 'release_escrow' || r.functionName === 'refund_escrow') return true;
        // Fallback: if no recordName/functionName but record has commitment, include it
        if (!r.recordName && !r.functionName && r.commitment) return true;
        return false;
      });

      console.log('[OnyxWallet] Valid records after filter:', validRecords.length, '/', records.length);

      // Process each record: try wallet fields, then decrypt, then Aleo API fallback
      const processed = [];
      for (const record of validRecords) {
        const rec = record as WalletRecord;

        // Strategy 1: Try to extract fields directly from wallet data
        // AssetArtifact fields
        let brand = extractRecordField(rec as Record<string, unknown>, 'brand');
        let tag_hash = extractRecordField(rec as Record<string, unknown>, 'tag_hash');
        let serial_hash = extractRecordField(rec as Record<string, unknown>, 'serial_hash');
        let model_id = extractRecordField(rec as Record<string, unknown>, 'model_id');
        let nonce_seed = extractRecordField(rec as Record<string, unknown>, 'nonce_seed');
        // EscrowReceipt fields
        let escrow_id = extractRecordField(rec as Record<string, unknown>, 'escrow_id');
        let amount = extractRecordField(rec as Record<string, unknown>, 'amount');
        let seller = extractRecordField(rec as Record<string, unknown>, 'seller');
        // BuyerReceipt / SellerReceipt fields
        let payment_hash = extractRecordField(rec as Record<string, unknown>, 'payment_hash');
        let token_type = extractRecordField(rec as Record<string, unknown>, 'token_type');
        // v4 new record fields
        let tag_commitment = extractRecordField(rec as Record<string, unknown>, 'tag_commitment');
        let artifact_hash = extractRecordField(rec as Record<string, unknown>, 'artifact_hash');
        let proof_token = extractRecordField(rec as Record<string, unknown>, 'token');

        // Strategy 2: If wallet gave us a ciphertext field, try to decrypt it
        if (!tag_hash && rec.ciphertext && walletAny.decrypt) {
          try {
            const decrypted = await walletAny.decrypt(rec.ciphertext, undefined, ALEO_CONFIG.programId);
            if (decrypted) {
              rec.plaintext = decrypted;
              console.log('[OnyxWallet] Decrypted inline ciphertext:', decrypted.substring(0, 120));
              const parsed = parseRecordPlaintext(decrypted);
              brand = brand || parsed.brand || '';
              tag_hash = tag_hash || parsed.tag_hash || '';
              serial_hash = serial_hash || parsed.serial_hash || '';
              model_id = model_id || parsed.model_id || '';
              nonce_seed = nonce_seed || parsed.nonce_seed || '';
              escrow_id = escrow_id || parsed.escrow_id || '';
              amount = amount || parsed.amount || '';
              seller = seller || parsed.seller || '';
              payment_hash = payment_hash || parsed.payment_hash || '';
              token_type = token_type || parsed.token_type || '';
              tag_commitment = tag_commitment || parsed.tag_commitment || '';
              artifact_hash = artifact_hash || parsed.artifact_hash || '';
              proof_token = proof_token || parsed.token || '';
            }
          } catch (e) {
            console.warn('[OnyxWallet] Inline decrypt failed:', e);
          }
        }

        // Strategy 3: Aleo API — fetch ciphertext from the blockchain using block height + commitment
        if (!tag_hash && rec.blockHeight && rec.commitment && walletAny.decrypt) {
          try {
            console.log('[OnyxWallet] Fetching record from Aleo API (block:', rec.blockHeight, 'commitment:', rec.commitment.substring(0, 30) + '...)');
            const result = await fetchRecordCiphertextFromBlock(
              rec.blockHeight,
              ALEO_CONFIG.programId,
              rec.commitment
            );
            if (result?.ciphertext) {
              console.log('[OnyxWallet] Got ciphertext from API, decrypting...');
              const decrypted = await walletAny.decrypt(result.ciphertext);
              if (decrypted) {
                rec.plaintext = decrypted;
                console.log('[OnyxWallet] Decrypted via Aleo API:', decrypted.substring(0, 200));
                const parsed = parseRecordPlaintext(decrypted);
                brand = parsed.brand || '';
                tag_hash = parsed.tag_hash || '';
                serial_hash = parsed.serial_hash || '';
                model_id = parsed.model_id || '';
                nonce_seed = parsed.nonce_seed || '';
                escrow_id = parsed.escrow_id || '';
                amount = parsed.amount || '';
                seller = parsed.seller || '';
                payment_hash = parsed.payment_hash || '';
                token_type = parsed.token_type || '';
                tag_commitment = parsed.tag_commitment || '';
                artifact_hash = parsed.artifact_hash || '';
                proof_token = parsed.token || '';
              }
            }
          } catch (e) {
            console.warn('[OnyxWallet] Aleo API decrypt fallback failed:', e);
          }
        }

        const data = { brand, tag_hash, serial_hash, model_id, nonce_seed, escrow_id, amount, seller, payment_hash, token_type, tag_commitment, artifact_hash, proof_token };

        // Determine record type based on extracted fields
        const isEscrowReceipt = !!escrow_id || rec.recordName === 'EscrowReceipt' || rec.functionName === 'create_escrow';
        const isBuyerReceipt = !!payment_hash || rec.recordName === 'BuyerReceipt' || rec.functionName === 'pay_verification' || rec.functionName === 'pay_verification_usdcx';
        // v4 new record types
        const isMintCertificate = rec.recordName === 'MintCertificate' || (!!tag_commitment && !!model_id && !escrow_id && !payment_hash && !proof_token);
        const isProofToken = rec.recordName === 'ProofToken' || (!!proof_token && !!artifact_hash);
        const isProofChallenge = rec.recordName === 'ProofChallenge' || (!!proof_token && !!tag_commitment && !artifact_hash);
        const isBountyPledge = rec.recordName === 'BountyPledge' || rec.functionName === 'report_stolen_with_bounty';

        // Build plaintext string if not available but we have extracted fields
        let plaintext = rec.plaintext;
        if (!plaintext && isEscrowReceipt && escrow_id) {
          plaintext = `{
  owner: ${rec.owner || ''}.private,
  escrow_id: ${escrow_id},
  tag_hash: ${tag_hash},
  amount: ${amount},
  seller: ${seller},
  _nonce: ${rec.nonce || '0group.public'}
}`;
        } else if (!plaintext && isBuyerReceipt && payment_hash) {
          plaintext = `{
  owner: ${rec.owner || ''}.private,
  seller: ${seller},
  tag_hash: ${tag_hash},
  payment_hash: ${payment_hash},
  amount: ${amount},
  token_type: ${token_type},
  _nonce: ${rec.nonce || '0group.public'}
}`;
        } else if (!plaintext && (tag_hash || brand)) {
          plaintext = `{
  owner: ${rec.owner || ''}.private,
  brand: ${brand},
  tag_hash: ${tag_hash},
  serial_hash: ${serial_hash},
  model_id: ${model_id},
  nonce_seed: ${nonce_seed},
  _nonce: ${rec.nonce || '0group.public'}
}`;
        }

        console.log('[OnyxWallet] Processed record:', { owner: rec.owner, data, isEscrowReceipt, isBuyerReceipt, hasPlaintext: !!plaintext, commitment: rec.commitment?.substring(0, 20) });

        processed.push({
          ...rec,
          data,
          _fromWallet: true,
          _isEscrowReceipt: isEscrowReceipt,
          _isBuyerReceipt: isBuyerReceipt,
          _isMintCertificate: isMintCertificate,
          _isProofToken: isProofToken,
          _isProofChallenge: isProofChallenge,
          _isBountyPledge: isBountyPledge,
          _raw: rec,
          _plaintext: plaintext,
          _commitment: rec.commitment,
          _blockHeight: rec.blockHeight,
        });
      }

      return processed;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('INVALID_PARAMS') || errorMessage.includes('NOT_GRANTED')) {
        console.log('[OnyxWallet] Wallet record permissions not granted — using backend artifacts only');
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
    // Brand registration (v3 — any user can self-register)
    executeRegisterBrand,
    // Legacy admin-only brand auth (v2 — kept for backward compatibility)
    executeAuthorizeBrand,
    // Core
    executeMint,
    executeTransfer,
    executeReportStolen,
    executeProveForResale,
    // Escrow
    executeCreateEscrow,
    executeReleaseEscrow,
    executeRefundEscrow,
    // Bounty
    executeReportStolenWithBounty,
    // Verification Payments (real credits.aleo + USDCx)
    executePayVerification,
    executePayVerificationUsdcx,
    convertPublicToPrivate,
    // Records
    fetchRecords,
    // Auth
    logout,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
  };
}
