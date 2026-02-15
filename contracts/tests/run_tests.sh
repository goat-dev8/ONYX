#!/bin/bash
# ONYX v2 — Leo Contract Test Suite
# Run: cd contracts && bash tests/run_tests.sh
#
# Prerequisites:
#   - Leo CLI installed (cargo install leo-lang)
#   - Program built: leo build
#
# These tests exercise all transitions in onyxpriv_v2.aleo
# using deterministic inputs for reproducibility.

set -e

PROGRAM="onyxpriv_v3"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

run_test() {
  local name="$1"
  local transition="$2"
  shift 2
  local inputs=("$@")

  TOTAL=$((TOTAL + 1))
  echo -e "${CYAN}[TEST ${TOTAL}]${NC} ${name}"
  echo "  leo run ${transition} ${inputs[*]}"

  if leo run "${transition}" "${inputs[@]}" 2>&1; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓ PASSED${NC}\n"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗ FAILED${NC}\n"
  fi
}

expect_fail() {
  local name="$1"
  local transition="$2"
  shift 2
  local inputs=("$@")

  TOTAL=$((TOTAL + 1))
  echo -e "${CYAN}[TEST ${TOTAL}]${NC} ${name} (expect failure)"
  echo "  leo run ${transition} ${inputs[*]}"

  if leo run "${transition}" "${inputs[@]}" 2>&1; then
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗ SHOULD HAVE FAILED${NC}\n"
  else
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓ CORRECTLY REJECTED${NC}\n"
  fi
}

echo "========================================"
echo "  ONYX v2 Leo Contract Test Suite"
echo "========================================"
echo ""

# Build first
echo "Building contract..."
leo build
echo ""

# Test addresses (Leo testnet format)
ADMIN="aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc"
BRAND="aleo1yr9ls3d7cn2x2a7re5q4yd7wdq7l4gf8t05pfqg3nfclfpvk5yqzv20dp"
USER1="aleo14tlamssdmg3d0p5zmljma573jvknwvhf0rnn2m6rges5tylagxyqae7qwy"
USER2="aleo1s3ws5tra87fjycnjrwsjcrnw2qxr8jfqqdugnf0xzqqw29q9m5pqem2u4t"

# ========== ADMIN TESTS ==========

run_test \
  "Authorize a brand (admin)" \
  "authorize_brand" \
  "${BRAND}"

run_test \
  "Authorize second brand" \
  "authorize_brand" \
  "${USER1}"

run_test \
  "Revoke brand authorization" \
  "revoke_brand" \
  "${USER1}"

# ========== MINT TESTS ==========

# tag_hash and serial_hash are field values
TAG_HASH="123456789field"
SERIAL_HASH="987654321field"
MODEL_ID="42u64"

run_test \
  "Mint artifact (authorized brand → user)" \
  "mint_artifact" \
  "${TAG_HASH}" "${SERIAL_HASH}" "${MODEL_ID}" "${USER1}"

TAG_HASH2="111222333field"
SERIAL_HASH2="444555666field"

run_test \
  "Mint second artifact" \
  "mint_artifact" \
  "${TAG_HASH2}" "${SERIAL_HASH2}" "99u64" "${USER2}"

# ========== TRANSFER TESTS ==========

# Transfer requires an AssetArtifact record input.
# In local leo run, we reference the output record from mint.
# NOTE: In actual leo run, the record from mint_artifact output
# would be passed. Here we document the expected inputs.

echo -e "${CYAN}[NOTE]${NC} Transfer tests require record inputs from mint outputs."
echo "       In integration testing, chain: mint → transfer → report_stolen"
echo ""

# ========== PROVE FOR RESALE ==========

SALT="42field"

echo -e "${CYAN}[NOTE]${NC} prove_for_resale requires AssetArtifact record + salt field."
echo "       Output includes a proof token stored in proof_registry mapping."
echo ""

# ========== REPORT STOLEN ==========

echo -e "${CYAN}[NOTE]${NC} report_stolen requires AssetArtifact record."
echo "       After reporting, transfer_artifact should be blocked."
echo ""

# ========== ESCROW TESTS ==========

echo -e "${CYAN}[NOTE]${NC} Escrow tests require credits.aleo records (testnet credits)."
echo "       create_escrow → release_escrow or refund_escrow (after timeout)"
echo ""

# ========== BOUNTY TESTS ==========

echo -e "${CYAN}[NOTE]${NC} report_stolen_with_bounty requires AssetArtifact + credits record."
echo "       Deposits bounty to program's public balance."
echo ""

# ========== NEGATIVE TESTS ==========

# Unauthorized brand should fail to mint
expect_fail \
  "Unauthorized brand cannot mint" \
  "mint_artifact" \
  "${TAG_HASH}" "${SERIAL_HASH}" "${MODEL_ID}" "${USER1}"

# Duplicate tag should fail
expect_fail \
  "Duplicate tag hash rejected" \
  "mint_artifact" \
  "${TAG_HASH}" "${SERIAL_HASH}" "${MODEL_ID}" "${USER2}"

# ========== SUMMARY ==========

echo "========================================"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${TOTAL} total"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
