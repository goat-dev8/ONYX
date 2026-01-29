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

// Check if a tag is marked as stolen - uses backend registry
// Note: On-chain mapping uses BHP256::hash_to_field(tag_hash) as key,
// which we can't easily compute in the browser, so we use backend registry
export async function checkStolenStatus(tagHash: string): Promise<boolean> {
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
    return data.stolen === true;
  } catch (err) {
    console.error('[Aleo] Check stolen error:', err);
    return false;
  }
}
