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
 * Load the @provablehq/wasm module (lazy, cached).
 * Falls back gracefully if the module is not available.
 */
async function loadWasm() {
  if (wasmLoaded) return wasmModule;
  // Try @provablehq/wasm first, then fall back to @provablehq/sdk
  try {
    wasmModule = await import('@provablehq/wasm');
    wasmLoaded = true;
    console.log('[Commitment] Loaded @provablehq/wasm');
    return wasmModule;
  } catch {
    // @provablehq/wasm not available — try @provablehq/sdk
    try {
      wasmModule = await import('@provablehq/sdk');
      wasmLoaded = true;
      console.log('[Commitment] Loaded @provablehq/sdk as fallback');
      return wasmModule;
    } catch {
      console.warn('[Commitment] Neither @provablehq/wasm nor @provablehq/sdk available');
      wasmLoaded = true;
      return null;
    }
  }
}

/**
 * Compute BHP256::hash_to_field(value) client-side.
 * Matches the Leo contract's BHP256::hash_to_field(tag_hash).
 *
 * @param fieldValue - The field value to hash (e.g., "123456field" or "123456")
 * @returns The BHP256 hash as a field string, or null if computation fails
 */
export async function computeBHP256Commitment(fieldValue: string): Promise<string | null> {
  // Normalize input to field format
  const input = fieldValue.endsWith('field') ? fieldValue : `${fieldValue}field`;

  try {
    const wasm = await loadWasm();

    // Try multiple WASM API signatures (varies by @provablehq/wasm version)
    if (wasm?.hash_bhp256) {
      return wasm.hash_bhp256(input);
    }
    if (wasm?.hashBHP256) {
      return wasm.hashBHP256(input);
    }
    if (wasm?.Address?.hash_bhp256) {
      return wasm.Address.hash_bhp256(input);
    }
    // @provablehq/sdk may expose BHP256 via different paths
    if (wasm?.default?.hash_bhp256) {
      return wasm.default.hash_bhp256(input);
    }
    if (wasm?.Hasher?.bhp256) {
      return wasm.Hasher.bhp256(input);
    }
    // Try Plaintext-based hashing via SDK
    if (wasm?.Plaintext) {
      try {
        // Some SDK versions expose hash through Plaintext utility
        const result = wasm.Plaintext.hash_bhp256(input);
        if (result) return result;
      } catch { /* continue */ }
    }

    // If no BHP256 function found in WASM/SDK
    console.warn('[Commitment] BHP256 not available in WASM/SDK — use API fallback');
    return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    console.warn('[Commitment] BHP256 computation failed — use API fallback');
    return null;
  }
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
