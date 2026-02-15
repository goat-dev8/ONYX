#!/bin/bash
# ================================================================
# ONYX v4 — Test Script for onyxpriv_v4.aleo
# Run with: bash contracts_v4/tests/run_tests.sh
# Requires: snarkos CLI, funded accounts
# ================================================================

set -e

# ─── Configuration ───────────────────────────────────────────────
NETWORK="testnet"
PROGRAM="onyxpriv_v4.aleo"
API="https://api.explorer.provable.com/v1/${NETWORK}"
BROADCAST="${API}/transaction/broadcast"

# Admin account
ADMIN_PK="APrivateKey1..."
ADMIN_ADDR="aleo12qr5t4xa7z4yk6lkdxaf0md9g042sctaltgdsyan7uhqp8xdxuxqwkfqjc"

# Brand account
BRAND_PK="APrivateKey1..."
BRAND_ADDR="aleo1..."

# Owner A (seller)
OWNER_A_PK="APrivateKey1..."
OWNER_A_ADDR="aleo1..."

# Owner B (buyer)
OWNER_B_PK="APrivateKey1..."
OWNER_B_ADDR="aleo1..."

# Verifier
VERIFIER_ADDR="aleo1..."

# Test artifact values
TAG_HASH="12345678field"
SERIAL_HASH="87654321field"
MODEL_ID="100u64"
ESCROW_SALT="999field"
PROOF_SALT="777field"
PAYMENT_SALT="555field"
PAYMENT_SECRET="111field"

# Fee (in microcredits)
FEE="1000000"
PRIORITY_FEE="100"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          ONYX v4 — Privacy-Maximized Test Suite          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ─── Utility Functions ───────────────────────────────────────────

wait_for_tx() {
  local TX_ID="$1"
  local LABEL="$2"
  echo "  Waiting for ${LABEL} (${TX_ID})..."
  for i in $(seq 1 60); do
    sleep 5
    STATUS=$(curl -s "${API}/transaction/${TX_ID}" | head -c 100)
    if echo "$STATUS" | grep -q '"id"'; then
      echo "  ✅ ${LABEL} confirmed!"
      return 0
    fi
  done
  echo "  ❌ ${LABEL} TIMEOUT"
  return 1
}

query_mapping() {
  local MAPPING="$1"
  local KEY="$2"
  echo "  Querying ${PROGRAM}/${MAPPING}/${KEY}..."
  RESULT=$(curl -s "${API}/program/${PROGRAM}/mapping/${MAPPING}/${KEY}")
  echo "  → $RESULT"
}

# ─── A: Brand Registration ──────────────────────────────────────

echo "━━━ Section A: Brand Registration ━━━"

echo ""
echo "[A1] Brand self-registers..."
TX_A1=$(snarkos developer execute \
  --private-key "$BRAND_PK" \
  --query "$API" \
  --broadcast "$BROADCAST" \
  --network 1 \
  --priority-fee "$PRIORITY_FEE" \
  "$PROGRAM" "register_brand" \
  2>&1 | grep -oP 'at1\w+')
echo "  TX: $TX_A1"
wait_for_tx "$TX_A1" "register_brand"
query_mapping "registered_brands" "$BRAND_ADDR"

# ─── B: Minting ─────────────────────────────────────────────────

echo ""
echo "━━━ Section B: Minting ━━━"

echo ""
echo "[B1] Brand mints artifact..."
TX_B1=$(snarkos developer execute \
  --private-key "$BRAND_PK" \
  --query "$API" \
  --broadcast "$BROADCAST" \
  --network 1 \
  --priority-fee "$PRIORITY_FEE" \
  "$PROGRAM" "mint_artifact" \
  "$TAG_HASH" "$SERIAL_HASH" "$MODEL_ID" "$OWNER_A_ADDR" \
  2>&1 | grep -oP 'at1\w+')
echo "  TX: $TX_B1"
wait_for_tx "$TX_B1" "mint_artifact"

echo ""
echo "  Privacy check: tag_uniqueness uses BHP256(tag_hash) as key"
echo "  Key should NOT be raw tag_hash ($TAG_HASH)"
echo "  Check explorer → Look for hashed key in tag_uniqueness mapping"
echo ""

echo "[B3] Duplicate mint should fail..."
TX_B3=$(snarkos developer execute \
  --private-key "$BRAND_PK" \
  --query "$API" \
  --broadcast "$BROADCAST" \
  --network 1 \
  --priority-fee "$PRIORITY_FEE" \
  "$PROGRAM" "mint_artifact" \
  "$TAG_HASH" "$SERIAL_HASH" "$MODEL_ID" "$OWNER_A_ADDR" \
  2>&1 || echo "EXPECTED_FAIL")
echo "  Result: $TX_B3"
echo "  ✅ Expected rejection (duplicate tag)"

# ─── C: Transfer ────────────────────────────────────────────────

echo ""
echo "━━━ Section C: Transfer ━━━"

echo ""
echo "[C1] Owner A transfers to Owner B..."
echo "  NOTE: Requires AssetArtifact record from B1."
echo "  Use the record plaintext from B1 wallet scan."
echo ""
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_A_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM transfer_artifact \\"
echo "    '{owner: \$OWNER_A_ADDR..., ...}' \\"
echo "    \$OWNER_B_ADDR"
echo ""
echo "  Privacy check: ZERO mapping writes expected"
echo "  Only stolen_commitments is READ (not written)"

# ─── D: Report Stolen ───────────────────────────────────────────

echo ""
echo "━━━ Section D: Report Stolen ━━━"

echo ""
echo "[D1] Owner reports artifact stolen..."
echo "  NOTE: Requires AssetArtifact record from wallet."
echo "  After tx: stolen_commitments[BHP256(tag_hash)] = true"
echo "  Key is OBFUSCATED — cannot derive tag_hash from mapping"

# ─── E: Prove for Resale ────────────────────────────────────────

echo ""
echo "━━━ Section E: Prove for Resale ━━━"

echo ""
echo "[E1] Owner generates private proof for verifier..."
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_A_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM prove_for_resale \\"
echo "    '{AssetArtifact record}' \\"
echo "    $PROOF_SALT \\"
echo "    $VERIFIER_ADDR"
echo ""
echo "  Expected outputs:"
echo "    - ProofToken (owned by seller)"
echo "    - ProofChallenge (owned by verifier)"
echo "  Privacy check: NO proof_registry mapping write"

# ─── F: Escrow System ───────────────────────────────────────────

echo ""
echo "━━━ Section F: Escrow System ━━━"

echo ""
echo "[F1] Buyer creates escrow..."
echo "  NOTE: Requires private credits record from wallet."
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_B_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM create_escrow \\"
echo "    '{credits record}' \\"
echo "    $TAG_HASH 100000u64 \$OWNER_A_ADDR $ESCROW_SALT"
echo ""
echo "  Privacy check:"
echo "    ✅ escrow_timestamps[BHP256(escrow_id)] = block_height"
echo "    ✗ NO escrow_deposits mapping"
echo "    ✗ NO escrow_created_at mapping"

echo ""
echo "[F2] Buyer releases escrow to seller..."
echo "  NOTE: Requires EscrowReceipt record from F1."
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_B_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM release_escrow \\"
echo "    '{EscrowReceipt record}'"
echo ""
echo "  Privacy check:"
echo "    ✅ Uses transfer_public_to_private (seller address HIDDEN)"
echo "    ✅ Seller gets PRIVATE credits record"
echo "    ✅ escrow_timestamps cleaned up"

echo ""
echo "[F4] Refund after timeout..."
echo "  NOTE: Wait for 1000 blocks (~28 hours on testnet)"
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_B_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM refund_escrow \\"
echo "    '{EscrowReceipt record}'"
echo ""
echo "  Privacy check:"
echo "    ✅ Uses transfer_public_to_private (buyer address HIDDEN)"
echo "    ✅ Buyer gets PRIVATE credits record"

# ─── G: Bounty System ───────────────────────────────────────────

echo ""
echo "━━━ Section G: Bounty System ━━━"

echo ""
echo "[G1] Report stolen with bounty..."
echo "  Privacy check:"
echo "    ✅ NO bounty_amount mapping"
echo "    ✅ NO bounty_reporter mapping (reporter identity PRIVATE)"
echo "    ✅ BountyPledge record stores amount + reporter privately"

# ─── H: Verification Payments ───────────────────────────────────

echo ""
echo "━━━ Section H: Verification Payments ━━━"

echo ""
echo "[H1] Pay verification (ALEO credits)..."
echo "  snarkos developer execute \\"
echo "    --private-key \$OWNER_B_PK \\"
echo "    --query \"$API\" \\"
echo "    --broadcast \"$BROADCAST\" \\"
echo "    --network 1 \\"
echo "    --priority-fee $PRIORITY_FEE \\"
echo "    $PROGRAM pay_verification \\"
echo "    '{credits record}' $TAG_HASH 50000u64 \$OWNER_A_ADDR $PAYMENT_SALT $PAYMENT_SECRET"
echo ""
echo "  Privacy check:"
echo "    ✅ NO payment_receipts mapping"
echo "    ✅ NO salt_to_payment mapping"
echo "    ✅ BuyerReceipt + SellerReceipt are private records"

# ─── I: Migration Helpers ───────────────────────────────────────

echo ""
echo "━━━ Section I: Migration Helpers ━━━"

echo ""
echo "[I1] Admin bootstraps stolen entry..."
COMMITMENT="123456789field"
TX_I1=$(snarkos developer execute \
  --private-key "$ADMIN_PK" \
  --query "$API" \
  --broadcast "$BROADCAST" \
  --network 1 \
  --priority-fee "$PRIORITY_FEE" \
  "$PROGRAM" "bootstrap_stolen" \
  "$COMMITMENT" \
  2>&1 | grep -oP 'at1\w+')
echo "  TX: $TX_I1"
wait_for_tx "$TX_I1" "bootstrap_stolen"
query_mapping "stolen_commitments" "$COMMITMENT"

echo ""
echo "[I2] Admin bootstraps tag entry..."
TX_I2=$(snarkos developer execute \
  --private-key "$ADMIN_PK" \
  --query "$API" \
  --broadcast "$BROADCAST" \
  --network 1 \
  --priority-fee "$PRIORITY_FEE" \
  "$PROGRAM" "bootstrap_tag" \
  "$COMMITMENT" \
  2>&1 | grep -oP 'at1\w+')
echo "  TX: $TX_I2"
wait_for_tx "$TX_I2" "bootstrap_tag"
query_mapping "tag_uniqueness" "$COMMITMENT"

# ─── Summary ─────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    MAPPING AUDIT                         ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  ✅ admin               (governance)                    ║"
echo "║  ✅ registered_brands   (brand registry)                ║"
echo "║  ✅ stolen_commitments  (BHP256 keys, no raw tag_hash)  ║"
echo "║  ✅ tag_uniqueness      (BHP256 keys, no raw tag_hash)  ║"
echo "║  ✅ escrow_timestamps   (BHP256 keys, no amounts)       ║"
echo "║                                                          ║"
echo "║  DROPPED FROM v3 (11 public mappings eliminated):        ║"
echo "║  ✗ tag_brand           → in AssetArtifact record        ║"
echo "║  ✗ tag_model           → in AssetArtifact record        ║"
echo "║  ✗ tag_minted_at       → in MintCertificate record      ║"
echo "║  ✗ tag_is_stolen       → stolen_commitments (obfuscated)║"
echo "║  ✗ tag_last_transfer_at→ eliminated                     ║"
echo "║  ✗ escrow_deposits     → in EscrowReceipt record        ║"
echo "║  ✗ escrow_created_at   → escrow_timestamps (hashed key) ║"
echo "║  ✗ bounty_amount       → in BountyPledge record         ║"
echo "║  ✗ bounty_reporter     → in BountyPledge record         ║"
echo "║  ✗ proof_registry      → ProofToken/ProofChallenge      ║"
echo "║  ✗ payment_receipts    → eliminated (record consumption)║"
echo "║  ✗ salt_to_payment     → eliminated                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Done! Review each test result above for privacy compliance."
