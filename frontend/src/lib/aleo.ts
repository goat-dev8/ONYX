export const ALEO_CONFIG = {
  programId: import.meta.env.VITE_ALEO_PROGRAM_ID || 'onyxpriv_v1.aleo',
  network: import.meta.env.VITE_ALEO_NETWORK || 'testnet',
  provableApiBase: import.meta.env.VITE_PROVABLE_API_BASE || 'https://api.explorer.provable.com/v1/testnet',
};

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
