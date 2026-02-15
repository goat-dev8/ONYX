// ================================================================
// ONYX v3 → v4 Migration Script
// ================================================================
//
// This script migrates on-chain state from onyxpriv_v3.aleo to onyxpriv_v4.aleo.
//
// What it does:
//   1. Reads all v3 stolen entries (tag_is_stolen mapping)
//   2. Computes BHP256(tag_hash) commitment for each
//   3. Calls bootstrap_stolen(commitment) on v4 to populate stolen_commitments
//   4. Reads all v3 minted tags (from backend DB)
//   5. Calls bootstrap_tag(commitment) for each to populate tag_uniqueness
//
// Prerequisites:
//   - onyxpriv_v4.aleo deployed on testnet
//   - Admin private key available
//   - @provablehq/sdk or snarkos CLI installed
//   - Backend DB accessible (for tag list)
//
// Usage:
//   npx ts-node scripts/migrate_v3_to_v4.ts
//
// NOTE: Records (AssetArtifact, EscrowReceipt, etc.) cannot be migrated
// on-chain — they live in user wallets. Users must re-scan with the v4
// program ID to pick up existing records. New records (MintCertificate,
// ProofToken, etc.) only exist for v4 transactions going forward.

import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ──────────────────────────────────────────────

const CONFIG = {
  v3ProgramId: 'onyxpriv_v3.aleo',
  v4ProgramId: 'onyxpriv_v4.aleo',
  apiBase: 'https://api.explorer.provable.com/v1/testnet',
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || 'APrivateKey1...',
  backendDbPath: path.join(__dirname, '..', 'backend', 'data', 'db.json'),
  network: 1, // testnet
  priorityFee: 100,
  batchDelay: 5000, // ms between transactions
};

// ─── Types ──────────────────────────────────────────────────────

interface BackendDb {
  artifacts: Record<string, {
    tagHash: string;
    stolen: boolean;
    brandAddress: string;
  }>;
  stolenTags: Record<string, {
    tagHash: string;
    txId?: string;
  }>;
}

interface MigrationResult {
  tagHash: string;
  commitment: string;
  txId?: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

async function queryMapping(
  programId: string,
  mapping: string,
  key: string
): Promise<string | null> {
  try {
    const url = `${CONFIG.apiBase}/program/${programId}/mapping/${mapping}/${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  }
}

/**
 * Compute BHP256 hash commitment for a field value.
 * Uses @provablehq/wasm if available, otherwise falls back to snarkos CLI.
 */
async function computeBHP256(fieldValue: string): Promise<string> {
  // Ensure field suffix
  const input = fieldValue.endsWith('field') ? fieldValue : `${fieldValue}field`;

  try {
    // Try WASM first
    const wasm = await import('@provablehq/wasm');
    if (wasm.hash_bhp256) {
      return wasm.hash_bhp256(input);
    }
    if (wasm.hashBHP256) {
      return wasm.hashBHP256(input);
    }
  } catch {
    // WASM not available
  }

  // Fallback to snarkos CLI
  const { execSync } = await import('child_process');
  try {
    const result = execSync(
      `snarkos developer hash --type bhp256 --value "${input}"`,
      { encoding: 'utf-8' }
    ).trim();
    return result;
  } catch (e) {
    throw new Error(`Cannot compute BHP256 hash for ${input}: ${e}`);
  }
}

/**
 * Execute a bootstrap transition on v4.
 */
async function executeBootstrap(
  functionName: 'bootstrap_stolen' | 'bootstrap_tag',
  commitment: string
): Promise<string | null> {
  const { execSync } = await import('child_process');

  try {
    const cmd = [
      'snarkos developer execute',
      `--private-key "${CONFIG.adminPrivateKey}"`,
      `--query "${CONFIG.apiBase}"`,
      `--broadcast "${CONFIG.apiBase}/transaction/broadcast"`,
      `--network ${CONFIG.network}`,
      `--priority-fee ${CONFIG.priorityFee}`,
      CONFIG.v4ProgramId,
      functionName,
      commitment,
    ].join(' ');

    const result = execSync(cmd, { encoding: 'utf-8' });
    const txMatch = result.match(/at1\w+/);
    return txMatch ? txMatch[0] : null;
  } catch (e) {
    console.error(`  ❌ Bootstrap failed: ${e}`);
    return null;
  }
}

// ─── Main Migration ─────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        ONYX v3 → v4 Migration Script              ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');

  // Load backend DB
  let db: BackendDb;
  try {
    const raw = fs.readFileSync(CONFIG.backendDbPath, 'utf-8');
    db = JSON.parse(raw);
  } catch (e) {
    console.error('❌ Cannot read backend DB:', e);
    process.exit(1);
  }

  const results: MigrationResult[] = [];

  // ── Phase 1: Migrate Stolen Entries ────────────────────────────
  console.log('━━━ Phase 1: Migrate Stolen Entries ━━━');

  const stolenTags = Object.values(db.stolenTags || {});
  console.log(`Found ${stolenTags.length} stolen entries to migrate`);

  for (const entry of stolenTags) {
    const { tagHash } = entry;
    console.log(`\n  Processing stolen tag: ${tagHash}`);

    try {
      // Compute commitment
      const commitment = await computeBHP256(tagHash);
      console.log(`  Commitment: ${commitment}`);

      // Check if already migrated
      const existing = await queryMapping(CONFIG.v4ProgramId, 'stolen_commitments', commitment);
      if (existing && existing.includes('true')) {
        console.log('  ⏭️  Already migrated — skipping');
        results.push({ tagHash, commitment, status: 'skipped' });
        continue;
      }

      // Execute bootstrap_stolen
      const txId = await executeBootstrap('bootstrap_stolen', commitment);

      if (txId) {
        console.log(`  ✅ Migrated! TX: ${txId}`);
        results.push({ tagHash, commitment, txId, status: 'success' });
      } else {
        console.log('  ❌ Transaction failed');
        results.push({ tagHash, commitment, status: 'failed', error: 'No TX ID' });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, CONFIG.batchDelay));
    } catch (e) {
      console.error(`  ❌ Error: ${e}`);
      results.push({
        tagHash,
        commitment: 'unknown',
        status: 'failed',
        error: String(e),
      });
    }
  }

  // ── Phase 2: Migrate Tag Uniqueness ────────────────────────────
  console.log('\n━━━ Phase 2: Migrate Tag Uniqueness ━━━');

  const allArtifacts = Object.values(db.artifacts || {});
  console.log(`Found ${allArtifacts.length} artifacts to migrate`);

  for (const artifact of allArtifacts) {
    const { tagHash } = artifact;
    console.log(`\n  Processing tag: ${tagHash}`);

    try {
      const commitment = await computeBHP256(tagHash);
      console.log(`  Commitment: ${commitment}`);

      // Check if already exists
      const existing = await queryMapping(CONFIG.v4ProgramId, 'tag_uniqueness', commitment);
      if (existing && existing.includes('true')) {
        console.log('  ⏭️  Already exists — skipping');
        results.push({ tagHash, commitment, status: 'skipped' });
        continue;
      }

      const txId = await executeBootstrap('bootstrap_tag', commitment);

      if (txId) {
        console.log(`  ✅ Migrated! TX: ${txId}`);
        results.push({ tagHash, commitment, txId, status: 'success' });
      } else {
        console.log('  ❌ Transaction failed');
        results.push({ tagHash, commitment, status: 'failed', error: 'No TX ID' });
      }

      await new Promise(r => setTimeout(r, CONFIG.batchDelay));
    } catch (e) {
      console.error(`  ❌ Error: ${e}`);
      results.push({
        tagHash,
        commitment: 'unknown',
        status: 'failed',
        error: String(e),
      });
    }
  }

  // ── Phase 3: Migrate Brand Registrations ───────────────────────
  console.log('\n━━━ Phase 3: Brand Re-registration ━━━');
  console.log('  Brands must self-register on v4 by calling register_brand().');
  console.log('  This cannot be automated — each brand must sign their own TX.');

  const uniqueBrands = [...new Set(allArtifacts.map(a => a.brandAddress))];
  console.log(`  ${uniqueBrands.length} brand(s) need to re-register:`);
  for (const brand of uniqueBrands) {
    console.log(`    - ${brand}`);
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                MIGRATION SUMMARY                   ║');
  console.log('╠════════════════════════════════════════════════════╣');

  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`║  ✅ Successful: ${successful}`);
  console.log(`║  ❌ Failed:     ${failed}`);
  console.log(`║  ⏭️  Skipped:    ${skipped}`);
  console.log(`║  Total:        ${results.length}`);
  console.log('╚════════════════════════════════════════════════════╝');

  // Save results
  const outputPath = path.join(__dirname, 'migration_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // ── Post-Migration Checklist ───────────────────────────────────
  console.log('\n━━━ Post-Migration Checklist ━━━');
  console.log('  □ Verify stolen_commitments entries on explorer');
  console.log('  □ Verify tag_uniqueness entries on explorer');
  console.log('  □ Have each brand call register_brand() on v4');
  console.log('  □ Update frontend VITE_ALEO_PROGRAM_ID to onyxpriv_v4.aleo');
  console.log('  □ Update backend PROGRAM_ID to onyxpriv_v4.aleo');
  console.log('  □ Users must re-scan wallet records with v4 program ID');
  console.log('  □ Run E2E test suite against v4 contract');
}

main().catch(console.error);
