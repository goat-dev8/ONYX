// ================================================================
// ONYX v4 — BHP256 Commitment Utilities
// ================================================================
//
// Computes client-side BHP256 commitments that match the contract's
// BHP256::hash_to_field(tag_hash) operation.
//
// Used for:
//   - Stolen status checks (stolen_commitments mapping uses hashed keys)
//   - Tag uniqueness verification
//   - Escrow ID obfuscation
//
// The commitment hides the raw tag_hash from public view while allowing
// holders of the tag_hash to compute the lookup key themselves.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModule: any = null;
let wasmLoaded = false;

/**
 * Load the @provablehq/wasm or @provablehq/sdk module (lazy, cached).
 * Falls back gracefully if unavailable.
 */
async function loadWasm() {
  if (wasmLoaded) return wasmModule;
  try {
    wasmModule = await import('@provablehq/wasm');
    wasmLoaded = true;
    console.log('[Commitment] Loaded @provablehq/wasm, exports:', Object.keys(wasmModule).filter(k => /bhp|field/i.test(k)).join(', '));
    return wasmModule;
  } catch {
    try {
      wasmModule = await import('@provablehq/sdk');
      wasmLoaded = true;
      console.log('[Commitment] Loaded @provablehq/sdk, exports:', Object.keys(wasmModule).filter(k => /bhp|field/i.test(k)).join(', '));
      return wasmModule;
    } catch {
      console.warn('[Commitment] Neither @provablehq/wasm nor @provablehq/sdk available');
      wasmLoaded = true;
      return null;
    }
  }
}

/**
 * Try to compute BHP256 using WASM/SDK in the browser.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryWasmBHP256(wasm: any, input: string): string | null {
  // Strategy 1: BHP256 class + Field→bits (correct API for @provablehq/sdk ≥0.9)
  if (wasm?.BHP256 && wasm?.Field?.fromString) {
    try {
      const field = wasm.Field.fromString(input);
      const bits = field.toBitsLe();
      const hasher = new wasm.BHP256();
      const result = hasher.hash(bits);
      const resultStr = result?.toString();
      if (resultStr && resultStr !== '0field') {
        console.log('[Commitment] BHP256 via Field→bits:', resultStr.substring(0, 40) + '...');
        return resultStr;
      }
    } catch (e) {
      console.warn('[Commitment] BHP256+Field failed:', e);
    }
  }

  // Strategy 2: Direct hash functions (older WASM builds)
  const directFns = [
    wasm?.hash_bhp256,
    wasm?.hashBHP256,
    wasm?.Address?.hash_bhp256,
    wasm?.default?.hash_bhp256,
    wasm?.Hasher?.bhp256,
  ];
  for (const fn of directFns) {
    if (typeof fn === 'function') {
      try {
        const result = fn(input);
        if (result) return String(result);
      } catch { /* try next */ }
    }
  }

  return null;
}

/**
 * Fallback: compute BHP256 on the backend server.
 * The backend has @provablehq/sdk running in Node.js where WASM works reliably.
 */
async function computeViaBackend(fieldValue: string): Promise<string | null> {
  const backendBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${backendBase}/artifacts/compute-commitment/${encodeURIComponent(fieldValue)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.commitment) {
        console.log('[Commitment] Got commitment from backend:', data.commitment.substring(0, 40) + '...');
        return data.commitment;
      }
    }
  } catch (e) {
    console.warn('[Commitment] Backend fallback failed:', e);
  }
  return null;
}

/**
 * Compute BHP256::hash_to_field(value) — matches the Leo contract.
 *
 * Strategy order:
 *   1. Client-side WASM (fastest, no network)
 *   2. Backend API fallback (reliable, works in all browsers)
 *
 * @param fieldValue - The field value to hash (e.g., "123456field" or "123456")
 * @returns The BHP256 hash as a field string, or null if all strategies fail
 */
export async function computeBHP256Commitment(fieldValue: string): Promise<string | null> {
  if (!fieldValue || fieldValue.trim() === '') {
    console.warn('[Commitment] Empty field value');
    return null;
  }

  const input = fieldValue.endsWith('field') ? fieldValue : `${fieldValue}field`;
  console.log('[Commitment] Computing BHP256 for:', input);

  // Strategy 1: Client-side WASM
  try {
    const wasm = await loadWasm();
    if (wasm) {
      const result = tryWasmBHP256(wasm, input);
      if (result) return result;
      console.warn('[Commitment] WASM strategies failed, trying backend...');
    }
  } catch (e) {
    console.warn('[Commitment] WASM error:', e);
  }

  // Strategy 2: Backend API fallback
  const backendResult = await computeViaBackend(fieldValue);
  if (backendResult) return backendResult;

  console.warn('[Commitment] All BHP256 strategies failed for:', input);
  return null;
}

/**
 * Compute the tag commitment used as the key in stolen_commitments and tag_uniqueness.
 * In the contract: BHP256::hash_to_field(tag_hash)
 *
 * @param tagHash - The raw tag_hash field value
 * @returns The commitment string, or null if computation fails
 */
export async function computeTagCommitment(tagHash: string): Promise<string | null> {
  return computeBHP256Commitment(tagHash);
}

/**
 * Compute the escrow commitment used as the key in escrow_timestamps.
 * In the contract: BHP256::hash_to_field(escrow_id)
 * where escrow_id = BHP256::hash_to_field(tag_hash + escrow_salt + BHP256::hash_to_field(buyer))
 *
 * @param escrowId - The escrow_id field value from EscrowReceipt
 * @returns The commitment string, or null if computation fails
 */
export async function computeEscrowCommitment(escrowId: string): Promise<string | null> {
  return computeBHP256Commitment(escrowId);
}

/**
 * Check stolen status using commitment-based lookup against the Aleo API.
 * This is the v4 replacement for the raw tag_hash lookup.
 *
 * Flow:
 * 1. Compute BHP256(tag_hash) client-side
 * 2. Query stolen_commitments mapping with the commitment as key
 * 3. If value is "true", the item is stolen
 *
 * @param tagHash - Raw tag_hash to check
 * @param programId - The v4 program ID
 * @param apiBase - Provable API base URL
 * @returns true if item is flagged stolen, false otherwise
 */
export async function checkStolenByCommitment(
  tagHash: string,
  programId: string,
  apiBase: string
): Promise<boolean> {
  try {
    const commitment = await computeTagCommitment(tagHash);
    if (!commitment) {
      // Can't compute commitment locally — fall back to backend
      return false;
    }

    const url = `${apiBase}/program/${programId}/mapping/stolen_commitments/${commitment}`;
    const response = await fetch(url);

    if (!response.ok) {
      return false; // Mapping entry doesn't exist = not stolen
    }

    const value = await response.text();
    return value.includes('true');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return false;
  }
}

/**
 * Check if a tag exists (has been minted) using commitment-based lookup.
 *
 * @param tagHash - Raw tag_hash to check
 * @param programId - The v4 program ID
 * @param apiBase - Provable API base URL
 * @returns true if tag has been minted, false otherwise
 */
export async function checkTagExistsByCommitment(
  tagHash: string,
  programId: string,
  apiBase: string
): Promise<boolean> {
  try {
    const commitment = await computeTagCommitment(tagHash);
    if (!commitment) return false;

    const url = `${apiBase}/program/${programId}/mapping/tag_uniqueness/${commitment}`;
    const response = await fetch(url);

    if (!response.ok) return false;

    const value = await response.text();
    return value.includes('true');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    return false;
  }
}
