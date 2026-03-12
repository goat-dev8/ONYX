// ================================================================
// BHP256 Commitment Computation Service
// ================================================================
// Uses a standalone ESM worker script to compute BHP256 hashes.
// The @provablehq/sdk is an ESM-only package with heavy WASM, so we
// run it in a child process to avoid compatibility issues with ts-node-dev.

import { execFile } from 'child_process';
import path from 'path';

const WORKER_PATH = path.resolve(__dirname, '../../bhp256-worker.mjs');

// Cache computed commitments to avoid repeated subprocess calls
const commitmentCache = new Map<string, string>();

/**
 * Initialize — just verify the worker file exists.
 */
export async function initBHP256(): Promise<boolean> {
  try {
    const fs = await import('fs');
    if (fs.existsSync(WORKER_PATH)) {
      console.log('[BHP256] Worker script ready at:', WORKER_PATH);
      return true;
    }
    console.warn('[BHP256] Worker script not found:', WORKER_PATH);
    return false;
  } catch {
    return false;
  }
}

/**
 * Compute BHP256::hash_to_field(value) via child process.
 * Matches the Leo contract's BHP256::hash_to_field(tag_hash).
 *
 * @param fieldValue - e.g. "237693431683347" or "237693431683347field"
 * @returns The BHP256 commitment as a field string, or null on failure
 */
export async function computeBHP256(fieldValue: string): Promise<string | null> {
  const key = fieldValue.endsWith('field') ? fieldValue : `${fieldValue}field`;

  // Check cache first
  const cached = commitmentCache.get(key);
  if (cached) return cached;

  return new Promise((resolve) => {
    execFile('node', [WORKER_PATH, fieldValue], {
      timeout: 30000,
      cwd: path.resolve(__dirname, '../..'),
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[BHP256] Worker error:', error.message, stderr);
        resolve(null);
        return;
      }
      const result = stdout.trim();
      if (result && result.endsWith('field')) {
        commitmentCache.set(key, result);
        resolve(result);
      } else {
        console.error('[BHP256] Unexpected output:', result);
        resolve(null);
      }
    });
  });
}
