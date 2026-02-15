export const ALEO_CONFIG = {
  programId: import.meta.env.VITE_ALEO_PROGRAM_ID || 'onyxpriv_v3.aleo',
  network: import.meta.env.VITE_ALEO_NETWORK || 'testnet',
  provableApiBase: import.meta.env.VITE_PROVABLE_API_BASE || 'https://api.explorer.provable.com/v1/testnet',
  // v3 uses self-registration (register_brand) — no admin gate needed
  // v2 used admin-only authorize_brand — only worked for deployer
  contractVersion: parseInt(import.meta.env.VITE_CONTRACT_VERSION || '3'),
};

// ========== ALEO API: Record Ciphertext Retrieval ==========
// Fetch the record ciphertext from the Aleo explorer API using block height and commitment.
// Shield wallet returns record metadata (blockHeight, commitment) but not the decrypted data.
// We use the block API to find the full transaction and extract the encrypted record ciphertext,
// which can then be decrypted by the wallet.

interface AleoTransitionOutput {
  type: string;
  id: string;
  value: string;
}

interface AleoTransition {
  program: string;
  function: string;
  outputs?: AleoTransitionOutput[];
}

interface AleoBlockTransaction {
  transaction?: {
    id: string;
    execution?: {
      transitions?: AleoTransition[];
    };
  };
}

/**
 * Fetch the record ciphertext from the Aleo API by looking up the block
 * at the given height and matching the output commitment.
 */
export async function fetchRecordCiphertextFromBlock(
  blockHeight: number,
  programId: string,
  commitment: string
): Promise<{ ciphertext: string; transactionId: string } | null> {
  try {
    const apiBase = ALEO_CONFIG.provableApiBase;
    const url = `${apiBase}/block/${blockHeight}/transactions`;
    console.log('[Aleo] Fetching block transactions:', url);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[Aleo] Block fetch failed:', response.status);
      return null;
    }

    const blockTxs: AleoBlockTransaction[] = await response.json();

    for (const blockTx of blockTxs) {
      const tx = blockTx.transaction;
      if (!tx?.execution?.transitions) continue;

      for (const transition of tx.execution.transitions) {
        if (transition.program !== programId) continue;

        for (const output of transition.outputs || []) {
          if (output.type === 'record' && output.id === commitment) {
            console.log('[Aleo] Found record ciphertext for commitment:', commitment.substring(0, 30) + '...');
            return { ciphertext: output.value, transactionId: tx.id };
          }
        }
      }
    }

    console.warn('[Aleo] No matching record found in block', blockHeight, 'for commitment', commitment.substring(0, 30));
    return null;
  } catch (err) {
    console.warn('[Aleo] fetchRecordCiphertextFromBlock error:', err);
    return null;
  }
}

/**
 * Parse a decrypted Aleo record plaintext string into a key-value map.
 * Example input: "{\n  owner: aleo1xxx.private,\n  tag_hash: 123field.private,\n  ...\n}"
 */
export function parseRecordPlaintext(plaintext: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Match lines like:  field_name: value.private  or  field_name: value.public
  const regex = /(\w+)\s*:\s*([^,}\n]+)/g;
  let match;
  while ((match = regex.exec(plaintext)) !== null) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Strip visibility suffix
    value = value.replace(/\.private$/, '').replace(/\.public$/, '');
    fields[key] = value;
  }
  return fields;
}

export const FEE_LEVELS = {
  LOW: 500000,
  STANDARD: 1000000,
  HIGH: 2000000,
} as const;

export const DEFAULT_FEE = FEE_LEVELS.STANDARD;

export function formatAddress(address: string, chars = 8): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getExplorerUrl(type: 'tx' | 'program' | 'address', id: string): string {
  const base = 'https://testnet.explorer.provable.com';
  switch (type) {
    case 'tx':
      return `${base}/transaction/${id}`;
    case 'program':
      return `${base}/program/${id}`;
    case 'address':
      return `${base}/address/${id}`;
    default:
      return base;
  }
}

// ========== LOCAL STOLEN REGISTRY (Backup for when backend resets) ==========
const STOLEN_STORAGE_KEY = 'onyx_stolen_tags';

interface StolenTagEntry {
  tagHash: string;
  reportedAt: string;
  txId?: string;
  reportedBy?: string;
}

// Get all locally stored stolen tags
export function getLocalStolenTags(): Record<string, StolenTagEntry> {
  try {
    const data = localStorage.getItem(STOLEN_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Save a stolen tag locally
export function saveLocalStolenTag(tagHash: string, txId?: string, reportedBy?: string): void {
  try {
    const tags = getLocalStolenTags();
    tags[tagHash] = {
      tagHash,
      reportedAt: new Date().toISOString(),
      txId,
      reportedBy,
    };
    localStorage.setItem(STOLEN_STORAGE_KEY, JSON.stringify(tags));
    console.log('[Aleo] Saved stolen tag to localStorage:', tagHash);
  } catch (err) {
    console.warn('[Aleo] Failed to save stolen tag locally:', err);
  }
}

// Check if tag is stolen locally
export function isLocallyStolen(tagHash: string): boolean {
  const tags = getLocalStolenTags();
  return !!tags[tagHash];
}

// ========== STOLEN STATUS CHECK ==========
// Check if a tag is marked as stolen - checks BOTH backend AND localStorage
export async function checkStolenStatus(tagHash: string): Promise<boolean> {
  // Guard: skip check if tagHash is empty or invalid
  if (!tagHash || tagHash.trim() === '') {
    return false;
  }

  // First check localStorage (instant, always available)
  if (isLocallyStolen(tagHash)) {
    console.log('[Aleo] Tag found in local stolen registry:', tagHash);
    return true;
  }

  // Then check backend
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const url = `${API_BASE}/artifacts/stolen/check/${encodeURIComponent(tagHash)}`;
    console.log('[Aleo] Checking stolen status via backend:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('[Aleo] Backend stolen check failed:', response.status);
      return false;
    }
    
    const data = await response.json();
    console.log('[Aleo] Stolen status response:', data);
    
    // If backend says stolen, also save locally for redundancy
    if (data.stolen === true) {
      saveLocalStolenTag(tagHash, data.txId, data.reportedBy);
    }
    
    return data.stolen === true;
  } catch (err) {
    console.error('[Aleo] Check stolen error:', err);
    return false;
  }
}
