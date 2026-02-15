// ONYX v4 — 100% Privacy-Maximized Product Passports for Luxury Goods
// Built on Aleo for Zero-Knowledge Authentication
// Version: 4.0.0
//
// Privacy improvements over v3:
//   - 14 public mappings → 5 (71% reduction)
//   - Removed: tag_brand, tag_model, tag_minted_at, tag_last_transfer_at
//   - Removed: escrow_deposits, escrow_created_at
//   - Removed: bounty_amount, bounty_reporter
//   - Removed: proof_registry, payment_receipts, salt_to_payment
//   - Obfuscated: stolen flag key uses BHP256(tag_hash) commitment
//   - Obfuscated: tag uniqueness key uses BHP256(tag_hash) commitment
//   - Obfuscated: escrow timestamp key uses BHP256(escrow_id) commitment
//   - Escrow release uses transfer_public_to_private (seller address hidden)
//   - Escrow refund uses transfer_public_to_private (private credits returned)
//   - New private records: MintCertificate, BountyPledge, ProofToken, ProofChallenge
//   - Proof system is fully private (no public proof_registry)
//   - Payment replay prevention via Aleo record consumption (no public mapping)

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program onyxpriv_v4.aleo {

    // ================================================================
    //                        RECORD TYPES
    // ================================================================

    // Core artifact record — private product passport (unchanged from v3)
    record AssetArtifact {
        owner: address,        // Current owner of the item
        brand: address,        // Brand that minted this artifact
        tag_hash: field,       // Hash of the physical NFC/RFID tag
        serial_hash: field,    // Hash of serial number (private)
        model_id: u64,         // Model/product line identifier
        nonce_seed: field      // Unique seed for record uniqueness
    }

    // NEW: Private mint certificate — proves brand minted this tag
    // Replaces public tag_brand, tag_model, tag_minted_at mappings
    record MintCertificate {
        owner: address,          // Brand address (only brand can see)
        tag_hash: field,         // Tag that was minted
        model_id: u64,           // Model identifier (now private!)
        tag_commitment: field    // BHP256(tag_hash) for easy on-chain lookup
    }

    // Escrow receipt — held by buyer as proof of deposit (unchanged from v3)
    record EscrowReceipt {
        owner: address,        // Buyer who created the escrow
        escrow_id: field,      // Unique escrow identifier
        tag_hash: field,       // Tag being verified
        amount: u64,           // Credits deposited (now private — not in public mapping!)
        seller: address        // Expected seller address (now private!)
    }

    // Buyer receipt — proof of verification payment (unchanged from v3)
    record BuyerReceipt {
        owner: address,        // Buyer who paid
        seller: address,       // Seller who received payment
        tag_hash: field,       // Artifact being verified
        payment_hash: field,   // Hash-based verification identity
        amount: u64,           // Amount paid
        token_type: u8         // 0 = credits, 1 = USDCx
    }

    // Seller receipt — proof of received payment (unchanged from v3)
    record SellerReceipt {
        owner: address,        // Seller who received payment
        payment_hash: field,   // Hash-based verification identity
        tag_hash: field,       // Artifact verified
        amount: u64,           // Amount received
        token_type: u8         // 0 = credits, 1 = USDCx
    }

    // NEW: Private bounty pledge — replaces public bounty_amount + bounty_reporter
    record BountyPledge {
        owner: address,          // Reporter address (PRIVATE — never public!)
        tag_hash: field,         // Stolen item tag
        amount: u64,             // Bounty amount (PRIVATE — never public!)
        tag_commitment: field    // BHP256(tag_hash) for reference
    }

    // NEW: Private proof token — replaces public proof_registry mapping
    record ProofToken {
        owner: address,          // Seller who generated the proof
        token: field,            // Proof hash
        tag_hash: field,         // Item reference (private!)
        artifact_hash: field     // Full identity hash
    }

    // NEW: Private proof challenge — shared with a specific verifier/buyer
    record ProofChallenge {
        owner: address,          // Buyer/verifier who receives the proof
        token: field,            // Same proof token for matching
        tag_commitment: field    // BHP256(tag_hash) for stolen check
    }

    // ================================================================
    //              PUBLIC MAPPINGS — MINIMAL SET (5 only)
    // ================================================================
    //
    // v3 had 14 public mappings. v4 has 5.
    // Every key that was a raw tag_hash is now BHP256(tag_hash).
    // No amounts, parties, models, or timestamps are stored publicly.

    // 1. Admin governance — who can remove brands
    mapping admin: u8 => address;

    // 2. Brand registry — self-registration (brands are public entities by design)
    mapping registered_brands: address => bool;

    // 3. Stolen commitments — BHP256(tag_hash) → is_stolen
    //    Key is a hash commitment: cannot reverse to find raw tag_hash
    //    Replaces v3's tag_is_stolen (which used raw tag_hash as key)
    mapping stolen_commitments: field => bool;

    // 4. Tag uniqueness guard — BHP256(tag_hash) → exists
    //    Prevents double-minting. Key is obfuscated.
    //    Replaces v3's tag_minted_at (which stored raw tag_hash + block height)
    mapping tag_uniqueness: field => bool;

    // 5. Escrow timestamps — BHP256(escrow_id) → block_height
    //    For timeout enforcement on refunds. Key is obfuscated.
    //    Replaces v3's escrow_deposits + escrow_created_at (which stored amounts + times)
    mapping escrow_timestamps: field => u64;

    // ================================================================
    //    REMOVED PUBLIC MAPPINGS (moved to private records or eliminated)
    // ================================================================
    //
    // ✗ tag_brand           → in AssetArtifact + MintCertificate (already private)
    // ✗ tag_model           → in AssetArtifact + MintCertificate (already private)
    // ✗ tag_minted_at       → in MintCertificate record (now private)
    // ✗ tag_is_stolen       → replaced by stolen_commitments (obfuscated key)
    // ✗ tag_last_transfer_at → eliminated entirely (not needed)
    // ✗ escrow_deposits     → in EscrowReceipt record (private, not in mapping)
    // ✗ escrow_created_at   → replaced by escrow_timestamps (hashed key, no amount)
    // ✗ bounty_amount       → in BountyPledge record (now private)
    // ✗ bounty_reporter     → in BountyPledge record (now private — was CRITICAL leak)
    // ✗ proof_registry      → replaced by ProofToken + ProofChallenge records
    // ✗ payment_receipts    → eliminated (Aleo record consumption prevents replay)
    // ✗ salt_to_payment     → eliminated (payment hash is in BuyerReceipt/SellerReceipt)

    // ================================================================
    //                    EXTERNAL STRUCTS
    // ================================================================

    // MerkleProof — matches test_usdcx_stablecoin.aleo/MerkleProof
    struct MerkleProof {
        siblings: [field; 16],
        leaf_index: u32
    }

    // ================================================================
    //                      CONSTRUCTOR
    // ================================================================

    @admin(address = "aleo12qr5t4xa7z4yk6lkdxaf0md9g042sctaltgdsyan7uhqp8xdxuxqwkfqjc")
    async constructor() {}

    // ================================================================
    //                   BRAND SELF-REGISTRATION
    // ================================================================

    // Any wallet can register itself as a brand — NO admin approval needed
    // (Same as v3 — brands are public entities, this mapping stays public)
    async transition register_brand() -> Future {
        return finalize_register_brand(self.signer);
    }

    async function finalize_register_brand(brand: address) {
        Mapping::set(registered_brands, brand, true);
    }

    // ================================================================
    //             ADMIN TRANSITIONS (Optional Governance)
    // ================================================================

    // Admin can remove a brand (for fraud/abuse cases)
    async transition admin_remove_brand(brand: address) -> Future {
        return finalize_admin_remove_brand(self.signer, brand);
    }

    async function finalize_admin_remove_brand(caller: address, brand: address) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(registered_brands, brand, false);
    }

    // ================================================================
    //          CORE TRANSITIONS — PRIVACY-MAXIMIZED
    // ================================================================

    // ─────────────────────────────────────────────────────────────────
    // MINT ARTIFACT (v4: only tag_uniqueness written, all metadata private)
    //
    // v3 wrote: tag_brand, tag_model, tag_minted_at, tag_is_stolen
    // v4 writes: tag_uniqueness[BHP256(tag_hash)] = true (ONLY)
    //
    // Returns: AssetArtifact (for owner) + MintCertificate (for brand)
    // ─────────────────────────────────────────────────────────────────
    async transition mint_artifact(
        tag_hash: field,
        serial_hash: field,
        model_id: u64,
        initial_owner: address
    ) -> (AssetArtifact, MintCertificate, Future) {
        let nonce: field = BHP256::hash_to_field(tag_hash + serial_hash);
        let tag_commitment: field = BHP256::hash_to_field(tag_hash);

        let artifact: AssetArtifact = AssetArtifact {
            owner: initial_owner,
            brand: self.signer,
            tag_hash: tag_hash,
            serial_hash: serial_hash,
            model_id: model_id,
            nonce_seed: nonce
        };

        // Private mint certificate — brand's proof of minting
        let cert: MintCertificate = MintCertificate {
            owner: self.signer,
            tag_hash: tag_hash,
            model_id: model_id,
            tag_commitment: tag_commitment
        };

        let f: Future = finalize_mint_artifact(self.signer, tag_commitment);
        return (artifact, cert, f);
    }

    async function finalize_mint_artifact(
        brand: address,
        tag_commitment: field
    ) {
        // Verify brand has self-registered
        let is_registered: bool = Mapping::get_or_use(registered_brands, brand, false);
        assert(is_registered);

        // Uniqueness check using COMMITMENT (not raw tag_hash!)
        let existing: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(!existing);

        // Only write uniqueness flag — nothing else public
        Mapping::set(tag_uniqueness, tag_commitment, true);

        // REMOVED: tag_brand     → in AssetArtifact record
        // REMOVED: tag_model     → in AssetArtifact record
        // REMOVED: tag_minted_at → in MintCertificate record
        // REMOVED: tag_is_stolen → only set on report_stolen
    }

    // ─────────────────────────────────────────────────────────────────
    // TRANSFER ARTIFACT (v4: ZERO public state writes)
    //
    // v3 wrote: tag_last_transfer_at[tag_hash] = block.height
    // v4 writes: NOTHING — stolen check only, no state mutation
    //
    // Explorer sees: transaction fee only. No transfer timestamp,
    // no addresses, no item details.
    // ─────────────────────────────────────────────────────────────────
    async transition transfer_artifact(
        artifact: AssetArtifact,
        new_owner: address
    ) -> (AssetArtifact, Future) {
        assert_eq(artifact.owner, self.signer);

        let new_nonce: field = BHP256::hash_to_field(
            artifact.nonce_seed + BHP256::hash_to_field(new_owner)
        );

        let new_artifact: AssetArtifact = AssetArtifact {
            owner: new_owner,
            brand: artifact.brand,
            tag_hash: artifact.tag_hash,
            serial_hash: artifact.serial_hash,
            model_id: artifact.model_id,
            nonce_seed: new_nonce
        };

        // Stolen check uses obfuscated commitment
        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);
        let f: Future = finalize_transfer_artifact(tag_commitment);
        return (new_artifact, f);
    }

    async function finalize_transfer_artifact(tag_commitment: field) {
        // Block stolen items from being transferred
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);

        // REMOVED: tag_last_transfer_at — no timing leak
    }

    // ─────────────────────────────────────────────────────────────────
    // REPORT STOLEN (v4: obfuscated key in stolen_commitments)
    //
    // v3 wrote: tag_is_stolen[tag_hash] = true (raw tag_hash exposed!)
    // v4 writes: stolen_commitments[BHP256(tag_hash)] = true
    //
    // An observer cannot enumerate stolen items without knowing tag_hash.
    // A buyer with the NFC tag can compute BHP256(tag_hash) to verify.
    // ─────────────────────────────────────────────────────────────────
    async transition report_stolen(
        artifact: AssetArtifact
    ) -> (AssetArtifact, Future) {
        assert_eq(artifact.owner, self.signer);

        let new_nonce: field = BHP256::hash_to_field(artifact.nonce_seed + 1field);

        let updated_artifact: AssetArtifact = AssetArtifact {
            owner: artifact.owner,
            brand: artifact.brand,
            tag_hash: artifact.tag_hash,
            serial_hash: artifact.serial_hash,
            model_id: artifact.model_id,
            nonce_seed: new_nonce
        };

        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);
        let f: Future = finalize_report_stolen(tag_commitment);
        return (updated_artifact, f);
    }

    async function finalize_report_stolen(tag_commitment: field) {
        Mapping::set(stolen_commitments, tag_commitment, true);
    }

    // ─────────────────────────────────────────────────────────────────
    // PROVE FOR RESALE (v4: fully private proofs, no public registry)
    //
    // v3 wrote: proof_registry[token] = tag_hash (leaked which items
    //           have active proofs and linked tokens to tags)
    // v4 writes: NOTHING to public state
    //
    // Returns: ProofToken (to seller) + ProofChallenge (to verifier)
    // Both are private records — no one else can see them.
    //
    // NEW: requires verifier address — proof is directed to a specific buyer
    // ─────────────────────────────────────────────────────────────────
    async transition prove_for_resale(
        artifact: AssetArtifact,
        salt: field,
        verifier: address
    ) -> (AssetArtifact, ProofToken, ProofChallenge, Future) {
        assert_eq(artifact.owner, self.signer);

        let proof_input: field = BHP256::hash_to_field(
            artifact.tag_hash +
            artifact.serial_hash +
            salt
        );
        let token: field = BHP256::hash_to_field(proof_input);

        let artifact_hash: field = BHP256::hash_to_field(
            artifact.tag_hash +
            artifact.serial_hash +
            artifact.brand as field
        );

        // Private proof token for the seller
        let proof: ProofToken = ProofToken {
            owner: self.signer,
            token: token,
            tag_hash: artifact.tag_hash,
            artifact_hash: artifact_hash
        };

        // Private proof challenge for the buyer/verifier
        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);
        let challenge: ProofChallenge = ProofChallenge {
            owner: verifier,
            token: token,
            tag_commitment: tag_commitment
        };

        let f: Future = finalize_prove_for_resale(tag_commitment);
        return (artifact, proof, challenge, f);
    }

    async function finalize_prove_for_resale(tag_commitment: field) {
        // Only check stolen status — write NOTHING public
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);

        // REMOVED: proof_registry[token] = tag_hash
    }

    // ================================================================
    //        ESCROW SYSTEM — PRIVATE WITH SECURE FUND LOCKING
    // ================================================================
    //
    // Deposit: transfer_private_to_public (funds locked in program's public balance)
    // Release: transfer_public_to_private (seller gets PRIVATE credits — address hidden!)
    // Refund:  transfer_public_to_private (buyer gets PRIVATE credits back)
    //
    // v3 leaks: escrow_deposits[id] = amount, escrow_created_at[id] = block
    //           release_escrow uses transfer_public (seller address + amount visible)
    // v4 leaks: escrow_timestamps[hash(id)] = block (only timing, no amount/parties)
    //           release uses transfer_public_to_private (seller address HIDDEN)

    // ─────────────────────────────────────────────────────────────────
    // CREATE ESCROW
    //
    // Deposits credits to program's public balance (necessary for fund locking).
    // Only writes a hashed timestamp — no amount or party info in public state.
    // ─────────────────────────────────────────────────────────────────
    async transition create_escrow(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address,
        escrow_salt: field
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        let buyer_hash: field = BHP256::hash_to_field(self.signer);
        let escrow_id: field = BHP256::hash_to_field(
            tag_hash + escrow_salt + buyer_hash
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.signer,
            escrow_id: escrow_id,
            tag_hash: tag_hash,
            amount: amount,
            seller: seller
        };

        // Deposit to program's public balance (secure fund locking)
        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, self.address, amount);

        // Obfuscate escrow ID and tag hash before sending to finalize
        let escrow_commitment: field = BHP256::hash_to_field(escrow_id);
        let tag_commitment: field = BHP256::hash_to_field(tag_hash);

        let f: Future = finalize_create_escrow(
            transfer_f, escrow_commitment, tag_commitment
        );
        return (receipt, change, f);
    }

    async function finalize_create_escrow(
        transfer_f: Future,
        escrow_commitment: field,
        tag_commitment: field
    ) {
        transfer_f.await();

        // Verify item exists and isn't stolen
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);

        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);

        // Prevent duplicate escrows
        let existing_ts: u64 = Mapping::get_or_use(escrow_timestamps, escrow_commitment, 0u64);
        assert_eq(existing_ts, 0u64);

        // Only store timestamp with hashed key — no amount, no parties
        Mapping::set(escrow_timestamps, escrow_commitment, block.height as u64);

        // REMOVED: escrow_deposits[escrow_id] = amount
        // REMOVED: escrow_created_at[escrow_id] = block.height
    }

    // ─────────────────────────────────────────────────────────────────
    // RELEASE ESCROW (v4: seller gets PRIVATE credits)
    //
    // v3 used: transfer_public(seller, amount) — seller + amount visible on explorer
    // v4 uses: transfer_public_to_private(seller, amount) — seller address HIDDEN,
    //          seller receives encrypted private credits record
    // ─────────────────────────────────────────────────────────────────
    async transition release_escrow(
        receipt: EscrowReceipt
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.signer);

        // Transfer from program's public balance to seller as PRIVATE credits
        // The seller address is a private parameter — hidden from explorer
        let (seller_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(receipt.seller, receipt.amount);

        let escrow_commitment: field = BHP256::hash_to_field(receipt.escrow_id);
        let f: Future = finalize_release_escrow(transfer_f, escrow_commitment);
        return (seller_credits, f);
    }

    async function finalize_release_escrow(
        transfer_f: Future,
        escrow_commitment: field
    ) {
        // Verify escrow exists
        let ts: u64 = Mapping::get_or_use(escrow_timestamps, escrow_commitment, 0u64);
        assert(ts > 0u64);

        transfer_f.await();

        // Cleanup timestamp
        Mapping::set(escrow_timestamps, escrow_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // REFUND ESCROW (v4: buyer gets PRIVATE credits back)
    //
    // v3 used: transfer_public(buyer, amount) — buyer + amount visible
    // v4 uses: transfer_public_to_private(buyer, amount) — buyer receives
    //          private credits, address hidden
    //
    // Timeout: still requires block.height >= created_at + 1000
    // ─────────────────────────────────────────────────────────────────
    async transition refund_escrow(
        receipt: EscrowReceipt
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.signer);

        // Refund as private credits to buyer
        let (buyer_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.signer, receipt.amount);

        let escrow_commitment: field = BHP256::hash_to_field(receipt.escrow_id);
        let f: Future = finalize_refund_escrow(transfer_f, escrow_commitment);
        return (buyer_credits, f);
    }

    async function finalize_refund_escrow(
        transfer_f: Future,
        escrow_commitment: field
    ) {
        // Verify escrow exists and timeout has passed
        let created_at: u64 = Mapping::get(escrow_timestamps, escrow_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);

        transfer_f.await();

        // Cleanup
        Mapping::set(escrow_timestamps, escrow_commitment, 0u64);
    }

    // ================================================================
    //             BOUNTY SYSTEM — PRIVATE BOUNTY RECORDS
    // ================================================================
    //
    // v3 leaks: bounty_amount[tag] = amount, bounty_reporter[tag] = address
    //           CRITICAL: reporter identity was PUBLIC
    // v4 leaks: NOTHING beyond the stolen flag
    //           Amount and reporter are in private BountyPledge record

    // ─────────────────────────────────────────────────────────────────
    // REPORT STOLEN WITH BOUNTY
    // ─────────────────────────────────────────────────────────────────
    async transition report_stolen_with_bounty(
        artifact: AssetArtifact,
        bounty_record: credits.aleo/credits,
        bounty_amt: u64
    ) -> (AssetArtifact, BountyPledge, credits.aleo/credits, Future) {
        assert_eq(artifact.owner, self.signer);

        let new_nonce: field = BHP256::hash_to_field(artifact.nonce_seed + 2field);

        let updated: AssetArtifact = AssetArtifact {
            owner: artifact.owner,
            brand: artifact.brand,
            tag_hash: artifact.tag_hash,
            serial_hash: artifact.serial_hash,
            model_id: artifact.model_id,
            nonce_seed: new_nonce
        };

        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);

        // Deposit bounty to program's public balance
        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(bounty_record, self.address, bounty_amt);

        // Private bounty pledge — reporter identity NEVER public
        let pledge: BountyPledge = BountyPledge {
            owner: self.signer,
            tag_hash: artifact.tag_hash,
            amount: bounty_amt,
            tag_commitment: tag_commitment
        };

        let f: Future = finalize_report_stolen_bounty(transfer_f, tag_commitment);
        return (updated, pledge, change, f);
    }

    async function finalize_report_stolen_bounty(
        transfer_f: Future,
        tag_commitment: field
    ) {
        transfer_f.await();

        // Only set stolen flag — NO amount or reporter in public state
        Mapping::set(stolen_commitments, tag_commitment, true);

        // REMOVED: bounty_amount[tag_hash] = amount
        // REMOVED: bounty_reporter[tag_hash] = reporter
    }

    // ================================================================
    //      VERIFICATION PAYMENTS — FULLY PRIVATE (no public receipts)
    // ================================================================
    //
    // v3 leaks: payment_receipts[hash] = amount, salt_to_payment[salt] = hash
    // v4 leaks: NOTHING — replay prevention via Aleo record consumption
    //
    // The credits.aleo/transfer_private call is already private.
    // BuyerReceipt and SellerReceipt records prove payment to each party.
    // No third party can determine payment amounts or participants.

    // ─────────────────────────────────────────────────────────────────
    // PAY VERIFICATION (Credits)
    // ─────────────────────────────────────────────────────────────────
    async transition pay_verification(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address,
        salt: field,
        private payment_secret: field
    ) -> (credits.aleo/credits, credits.aleo/credits, BuyerReceipt, SellerReceipt, Future) {
        // Private transfer to seller (already private in v3 — unchanged)
        let (r1, r2): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pay_record, seller, amount);

        // Payment hash for receipt identity
        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: self.signer,
            seller: seller,
            tag_hash: tag_hash,
            payment_hash: payment_hash,
            amount: amount,
            token_type: 0u8
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller,
            payment_hash: payment_hash,
            tag_hash: tag_hash,
            amount: amount,
            token_type: 0u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let f: Future = finalize_pay_verification(tag_commitment);
        return (r1, r2, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification(tag_commitment: field) {
        // Verify artifact exists
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);

        // Verify not stolen
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);

        // REMOVED: payment_receipts[receipt_hash] = amount
        // REMOVED: salt_to_payment[salt] = payment_hash
        // Replay prevention: credits record consumption (can't spend same record twice)
    }

    // ─────────────────────────────────────────────────────────────────
    // PAY VERIFICATION (USDCx Stablecoin)
    //
    // Cross-program call to test_usdcx_stablecoin.aleo/transfer_private
    // with freeze-list compliance proofs.
    // ─────────────────────────────────────────────────────────────────
    async transition pay_verification_usdcx(
        pay_record: test_usdcx_stablecoin.aleo/Token,
        seller: address,
        amount: u128,
        salt: field,
        private payment_secret: field,
        tag_hash: field,
        private proofs: [MerkleProof; 2]
    ) -> (test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/ComplianceRecord, BuyerReceipt, SellerReceipt, Future) {
        // Cross-program USDCx transfer with compliance proofs
        let (compliance_record, token_seller, token_change, transfer_future): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            test_usdcx_stablecoin.aleo/Token,
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private(seller, amount, pay_record, proofs);

        // Payment hash
        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        let amount_u64: u64 = amount as u64;

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: self.signer,
            seller: seller,
            tag_hash: tag_hash,
            payment_hash: payment_hash,
            amount: amount_u64,
            token_type: 1u8
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller,
            payment_hash: payment_hash,
            tag_hash: tag_hash,
            amount: amount_u64,
            token_type: 1u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let f: Future = finalize_pay_verification_usdcx(transfer_future, tag_commitment);
        return (token_seller, token_change, compliance_record, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification_usdcx(
        transfer_f: Future,
        tag_commitment: field
    ) {
        transfer_f.await();

        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);

        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);

        // REMOVED: payment_receipts, salt_to_payment
    }

    // ================================================================
    //                 MIGRATION HELPERS (admin-only)
    // ================================================================

    // Bootstrap stolen entries from v3 → v4 (admin calls with BHP256 commitments)
    async transition bootstrap_stolen(tag_commitment: field) -> Future {
        return finalize_bootstrap_stolen(self.signer, tag_commitment);
    }

    async function finalize_bootstrap_stolen(caller: address, tag_commitment: field) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(stolen_commitments, tag_commitment, true);
    }

    // Bootstrap tag uniqueness entries from v3 → v4
    async transition bootstrap_tag(tag_commitment: field) -> Future {
        return finalize_bootstrap_tag(self.signer, tag_commitment);
    }

    async function finalize_bootstrap_tag(caller: address, tag_commitment: field) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(tag_uniqueness, tag_commitment, true);
    }
}
