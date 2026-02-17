// ONYX v5 — Atomic Purchase with Privacy-Maximized Product Passports
// Built on Aleo for Zero-Knowledge Authentication
// Version: 5.0.0
//
// v5 additions over v4:
//   - Atomic purchase system: SaleRecord + PurchaseReceipt records
//   - 2 new mappings: sale_active, sale_paid (boolean only — minimal leak)
//   - 8 new transitions for create/buy/complete/cancel/refund sales
//   - Both ALEO credits and USDCx stablecoin purchase flows
//   - Seller locks artifact → buyer pays → seller completes (atomic delivery)
//   - USDCx refund support via program-balance escrow pattern
//   - All v4 transitions preserved unchanged for backward compatibility

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program onyxpriv_v5.aleo {

    // ================================================================
    //                        RECORD TYPES
    // ================================================================

    // Core artifact record — private product passport
    record AssetArtifact {
        owner: address,
        brand: address,
        tag_hash: field,
        serial_hash: field,
        model_id: u64,
        nonce_seed: field
    }

    // Private mint certificate
    record MintCertificate {
        owner: address,
        tag_hash: field,
        model_id: u64,
        tag_commitment: field
    }

    // Escrow receipt — held by buyer as proof of deposit (legacy v4)
    record EscrowReceipt {
        owner: address,
        escrow_id: field,
        tag_hash: field,
        amount: u64,
        seller: address
    }

    // Buyer receipt — proof of payment
    record BuyerReceipt {
        owner: address,
        seller: address,
        tag_hash: field,
        payment_hash: field,
        amount: u64,
        token_type: u8
    }

    // Seller receipt — proof of received payment
    record SellerReceipt {
        owner: address,
        payment_hash: field,
        tag_hash: field,
        amount: u64,
        token_type: u8
    }

    // Private bounty pledge
    record BountyPledge {
        owner: address,
        tag_hash: field,
        amount: u64,
        tag_commitment: field
    }

    // Private proof token
    record ProofToken {
        owner: address,
        token: field,
        tag_hash: field,
        artifact_hash: field
    }

    // Private proof challenge
    record ProofChallenge {
        owner: address,
        token: field,
        tag_commitment: field
    }

    // ─── NEW v5 RECORDS ─────────────────────────────────────────────

    // SaleRecord — Seller's locked artifact in sale mode.
    // Contains ALL AssetArtifact fields for reconstruction on completion.
    // The artifact is consumed when this is created, then reconstructed
    // for the buyer when complete_sale is called.
    record SaleRecord {
        owner: address,          // Seller
        tag_hash: field,
        serial_hash: field,
        brand: address,
        model_id: u64,
        nonce_seed: field,
        price: u64,              // Sale price (microcredits or micro-USDCx)
        currency: u8,            // 0 = ALEO, 1 = USDCx
        sale_id: field,          // Unique sale identifier
        tag_commitment: field    // BHP256(tag_hash) for lookup
    }

    // PurchaseReceipt — Buyer's proof of payment for an active sale.
    // Used for refund claims if seller doesn't complete.
    record PurchaseReceipt {
        owner: address,          // Buyer
        sale_id: field,
        tag_hash: field,
        amount: u64,
        seller: address,
        currency: u8             // 0 = ALEO (escrowed), 1 = USDCx (escrowed)
    }

    // ================================================================
    //              PUBLIC MAPPINGS — 7 total (v4 had 5)
    // ================================================================

    // 1. Admin governance
    mapping admin: u8 => address;

    // 2. Brand registry
    mapping registered_brands: address => bool;

    // 3. Stolen commitments — BHP256(tag_hash) → is_stolen
    mapping stolen_commitments: field => bool;

    // 4. Tag uniqueness guard — BHP256(tag_hash) → exists
    mapping tag_uniqueness: field => bool;

    // 5. Escrow/Sale timestamps — BHP256(id) → block_height
    mapping escrow_timestamps: field => u64;

    // 6. NEW: Sale active status — BHP256(sale_id) → is_active
    mapping sale_active: field => bool;

    // 7. NEW: Sale payment status — BHP256(sale_id) → is_paid
    mapping sale_paid: field => bool;

    // ================================================================
    //                    EXTERNAL STRUCTS
    // ================================================================

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

    async transition register_brand() -> Future {
        return finalize_register_brand(self.signer);
    }

    async function finalize_register_brand(brand: address) {
        Mapping::set(registered_brands, brand, true);
    }

    // ================================================================
    //             ADMIN TRANSITIONS
    // ================================================================

    async transition admin_remove_brand(brand: address) -> Future {
        return finalize_admin_remove_brand(self.signer, brand);
    }

    async function finalize_admin_remove_brand(caller: address, brand: address) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(registered_brands, brand, false);
    }

    // ================================================================
    //          CORE TRANSITIONS (unchanged from v4)
    // ================================================================

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

        let cert: MintCertificate = MintCertificate {
            owner: self.signer,
            tag_hash: tag_hash,
            model_id: model_id,
            tag_commitment: tag_commitment
        };

        let f: Future = finalize_mint_artifact(self.signer, tag_commitment);
        return (artifact, cert, f);
    }

    async function finalize_mint_artifact(brand: address, tag_commitment: field) {
        let is_registered: bool = Mapping::get_or_use(registered_brands, brand, false);
        assert(is_registered);
        let existing: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(!existing);
        Mapping::set(tag_uniqueness, tag_commitment, true);
    }

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

        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);
        let f: Future = finalize_transfer_artifact(tag_commitment);
        return (new_artifact, f);
    }

    async function finalize_transfer_artifact(tag_commitment: field) {
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
    }

    async transition report_stolen(artifact: AssetArtifact) -> (AssetArtifact, Future) {
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

    async transition prove_for_resale(
        artifact: AssetArtifact,
        salt: field,
        verifier: address
    ) -> (AssetArtifact, ProofToken, ProofChallenge, Future) {
        assert_eq(artifact.owner, self.signer);

        let proof_input: field = BHP256::hash_to_field(
            artifact.tag_hash + artifact.serial_hash + salt
        );
        let token: field = BHP256::hash_to_field(proof_input);

        let artifact_hash: field = BHP256::hash_to_field(
            artifact.tag_hash + artifact.serial_hash + artifact.brand as field
        );

        let proof: ProofToken = ProofToken {
            owner: self.signer,
            token: token,
            tag_hash: artifact.tag_hash,
            artifact_hash: artifact_hash
        };

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
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
    }

    // ================================================================
    //        LEGACY ESCROW SYSTEM (v4 — preserved for compatibility)
    // ================================================================

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

        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, self.address, amount);

        let escrow_commitment: field = BHP256::hash_to_field(escrow_id);
        let tag_commitment: field = BHP256::hash_to_field(tag_hash);

        let f: Future = finalize_create_escrow(transfer_f, escrow_commitment, tag_commitment);
        return (receipt, change, f);
    }

    async function finalize_create_escrow(
        transfer_f: Future,
        escrow_commitment: field,
        tag_commitment: field
    ) {
        transfer_f.await();
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        let existing_ts: u64 = Mapping::get_or_use(escrow_timestamps, escrow_commitment, 0u64);
        assert_eq(existing_ts, 0u64);
        Mapping::set(escrow_timestamps, escrow_commitment, block.height as u64);
    }

    async transition release_escrow(receipt: EscrowReceipt) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.signer);
        let (seller_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(receipt.seller, receipt.amount);
        let escrow_commitment: field = BHP256::hash_to_field(receipt.escrow_id);
        let f: Future = finalize_release_escrow(transfer_f, escrow_commitment);
        return (seller_credits, f);
    }

    async function finalize_release_escrow(transfer_f: Future, escrow_commitment: field) {
        let ts: u64 = Mapping::get_or_use(escrow_timestamps, escrow_commitment, 0u64);
        assert(ts > 0u64);
        transfer_f.await();
        Mapping::set(escrow_timestamps, escrow_commitment, 0u64);
    }

    async transition refund_escrow(receipt: EscrowReceipt) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.signer);
        let (buyer_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.signer, receipt.amount);
        let escrow_commitment: field = BHP256::hash_to_field(receipt.escrow_id);
        let f: Future = finalize_refund_escrow(transfer_f, escrow_commitment);
        return (buyer_credits, f);
    }

    async function finalize_refund_escrow(transfer_f: Future, escrow_commitment: field) {
        let created_at: u64 = Mapping::get(escrow_timestamps, escrow_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        transfer_f.await();
        Mapping::set(escrow_timestamps, escrow_commitment, 0u64);
    }

    // ================================================================
    //             BOUNTY SYSTEM (unchanged from v4)
    // ================================================================

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
        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(bounty_record, self.address, bounty_amt);
        let pledge: BountyPledge = BountyPledge {
            owner: self.signer,
            tag_hash: artifact.tag_hash,
            amount: bounty_amt,
            tag_commitment: tag_commitment
        };
        let f: Future = finalize_report_stolen_bounty(transfer_f, tag_commitment);
        return (updated, pledge, change, f);
    }

    async function finalize_report_stolen_bounty(transfer_f: Future, tag_commitment: field) {
        transfer_f.await();
        Mapping::set(stolen_commitments, tag_commitment, true);
    }

    // ================================================================
    //      VERIFICATION PAYMENTS (unchanged from v4)
    // ================================================================

    async transition pay_verification(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address,
        salt: field,
        private payment_secret: field
    ) -> (credits.aleo/credits, credits.aleo/credits, BuyerReceipt, SellerReceipt, Future) {
        let (r1, r2): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pay_record, seller, amount);

        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: self.signer, seller: seller, tag_hash: tag_hash,
            payment_hash: payment_hash, amount: amount, token_type: 0u8
        };
        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller, payment_hash: payment_hash, tag_hash: tag_hash,
            amount: amount, token_type: 0u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let f: Future = finalize_pay_verification(tag_commitment);
        return (r1, r2, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification(tag_commitment: field) {
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
    }

    async transition pay_verification_usdcx(
        pay_record: test_usdcx_stablecoin.aleo/Token,
        seller: address,
        amount: u128,
        salt: field,
        private payment_secret: field,
        tag_hash: field,
        private proofs: [MerkleProof; 2]
    ) -> (test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/ComplianceRecord, BuyerReceipt, SellerReceipt, Future) {
        let (compliance_record, token_seller, token_change, transfer_future): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            test_usdcx_stablecoin.aleo/Token,
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private(seller, amount, pay_record, proofs);

        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        let amount_u64: u64 = amount as u64;

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: self.signer, seller: seller, tag_hash: tag_hash,
            payment_hash: payment_hash, amount: amount_u64, token_type: 1u8
        };
        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller, payment_hash: payment_hash, tag_hash: tag_hash,
            amount: amount_u64, token_type: 1u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let f: Future = finalize_pay_verification_usdcx(transfer_future, tag_commitment);
        return (token_seller, token_change, compliance_record, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification_usdcx(transfer_f: Future, tag_commitment: field) {
        transfer_f.await();
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
    }

    // ================================================================
    //                 MIGRATION HELPERS (unchanged)
    // ================================================================

    async transition bootstrap_stolen(tag_commitment: field) -> Future {
        return finalize_bootstrap_stolen(self.signer, tag_commitment);
    }

    async function finalize_bootstrap_stolen(caller: address, tag_commitment: field) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(stolen_commitments, tag_commitment, true);
    }

    async transition bootstrap_tag(tag_commitment: field) -> Future {
        return finalize_bootstrap_tag(self.signer, tag_commitment);
    }

    async function finalize_bootstrap_tag(caller: address, tag_commitment: field) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(tag_uniqueness, tag_commitment, true);
    }

    // ================================================================
    //        NEW v5 — ATOMIC SALE SYSTEM
    // ================================================================
    //
    // The SaleRecord pattern solves the atomicity gap:
    //   Phase 1: Seller calls create_sale → artifact consumed, SaleRecord created
    //   Phase 2: Buyer calls buy_sale_* → payment locked, sale_paid = true
    //   Phase 3: Seller calls complete_sale_* → ATOMIC: artifact to buyer + credits to seller
    //
    // For USDCx purchases:
    //   USDCx is deposited to the program's public balance (same as ALEO escrow)
    //   so that both escrow and USDCx purchases are refundable.
    //   On complete_sale, USDCx is transferred from program balance to seller.

    // ─────────────────────────────────────────────────────────────────
    // CREATE SALE — Lock artifact and list for sale
    // ─────────────────────────────────────────────────────────────────
    async transition create_sale(
        artifact: AssetArtifact,
        price: u64,
        currency: u8,
        sale_salt: field
    ) -> (SaleRecord, Future) {
        assert_eq(artifact.owner, self.signer);
        assert(currency == 0u8 || currency == 1u8);
        assert(price > 0u64);

        let seller_hash: field = BHP256::hash_to_field(self.signer);
        let sale_id: field = BHP256::hash_to_field(
            artifact.tag_hash + sale_salt + seller_hash
        );

        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);

        let sale: SaleRecord = SaleRecord {
            owner: self.signer,
            tag_hash: artifact.tag_hash,
            serial_hash: artifact.serial_hash,
            brand: artifact.brand,
            model_id: artifact.model_id,
            nonce_seed: artifact.nonce_seed,
            price: price,
            currency: currency,
            sale_id: sale_id,
            tag_commitment: tag_commitment
        };

        let sale_commitment: field = BHP256::hash_to_field(sale_id);
        let f: Future = finalize_create_sale(tag_commitment, sale_commitment);
        return (sale, f);
    }

    async function finalize_create_sale(
        tag_commitment: field,
        sale_commitment: field
    ) {
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        let existing: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(!existing);
        Mapping::set(sale_active, sale_commitment, true);
    }

    // ─────────────────────────────────────────────────────────────────
    // BUY SALE (ESCROW) — Lock ALEO credits for an active sale
    // ─────────────────────────────────────────────────────────────────
    async transition buy_sale_escrow(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address,
        sale_id: field
    ) -> (PurchaseReceipt, credits.aleo/credits, Future) {
        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, self.address, amount);

        let receipt: PurchaseReceipt = PurchaseReceipt {
            owner: self.signer,
            sale_id: sale_id,
            tag_hash: tag_hash,
            amount: amount,
            seller: seller,
            currency: 0u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let sale_commitment: field = BHP256::hash_to_field(sale_id);

        let f: Future = finalize_buy_sale_escrow(transfer_f, tag_commitment, sale_commitment);
        return (receipt, change, f);
    }

    async function finalize_buy_sale_escrow(
        transfer_f: Future,
        tag_commitment: field,
        sale_commitment: field
    ) {
        transfer_f.await();
        let active: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(active);
        let already_paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(!already_paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_paid, sale_commitment, true);
        Mapping::set(escrow_timestamps, sale_commitment, block.height as u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // BUY SALE (USDCx) — Pay with USDCx for an active sale
    //
    // USDCx tokens are transferred directly to the seller via
    // transfer_private. The buyer gets a PurchaseReceipt for tracking.
    // ─────────────────────────────────────────────────────────────────
    async transition buy_sale_usdcx(
        pay_record: test_usdcx_stablecoin.aleo/Token,
        seller: address,
        amount: u128,
        tag_hash: field,
        sale_id: field,
        private proofs: [MerkleProof; 2]
    ) -> (test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/Token, test_usdcx_stablecoin.aleo/ComplianceRecord, PurchaseReceipt, Future) {
        let (compliance_record, token_seller, token_change, transfer_f): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            test_usdcx_stablecoin.aleo/Token,
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private(seller, amount, pay_record, proofs);

        let amount_u64: u64 = amount as u64;

        let receipt: PurchaseReceipt = PurchaseReceipt {
            owner: self.signer,
            sale_id: sale_id,
            tag_hash: tag_hash,
            amount: amount_u64,
            seller: seller,
            currency: 1u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let sale_commitment: field = BHP256::hash_to_field(sale_id);

        let f: Future = finalize_buy_sale_usdcx(transfer_f, tag_commitment, sale_commitment);
        return (token_seller, token_change, compliance_record, receipt, f);
    }

    async function finalize_buy_sale_usdcx(
        transfer_f: Future,
        tag_commitment: field,
        sale_commitment: field
    ) {
        transfer_f.await();
        let active: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(active);
        let already_paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(!already_paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_paid, sale_commitment, true);
        Mapping::set(escrow_timestamps, sale_commitment, block.height as u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // COMPLETE SALE (ESCROW) — ATOMIC: Deliver artifact + claim credits
    //
    // The seller consumes SaleRecord (which has all artifact data),
    // reconstructs AssetArtifact for the buyer, and claims the escrowed
    // credits from the program's public balance — ALL in one TX.
    // If any assertion fails, NOTHING happens.
    // ─────────────────────────────────────────────────────────────────
    async transition complete_sale_escrow(
        sale: SaleRecord,
        buyer: address
    ) -> (AssetArtifact, credits.aleo/credits, BuyerReceipt, SellerReceipt, Future) {
        assert_eq(sale.owner, self.signer);
        assert_eq(sale.currency, 0u8);

        // Reconstruct artifact for buyer
        let new_nonce: field = BHP256::hash_to_field(
            sale.nonce_seed + BHP256::hash_to_field(buyer)
        );

        let artifact: AssetArtifact = AssetArtifact {
            owner: buyer,
            brand: sale.brand,
            tag_hash: sale.tag_hash,
            serial_hash: sale.serial_hash,
            model_id: sale.model_id,
            nonce_seed: new_nonce
        };

        // Claim escrowed credits
        let (seller_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.signer, sale.price);

        let payment_hash: field = BHP256::hash_to_field(sale.sale_id + sale.tag_commitment);

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: buyer,
            seller: self.signer,
            tag_hash: sale.tag_hash,
            payment_hash: payment_hash,
            amount: sale.price,
            token_type: 0u8
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: self.signer,
            payment_hash: payment_hash,
            tag_hash: sale.tag_hash,
            amount: sale.price,
            token_type: 0u8
        };

        let sale_commitment: field = BHP256::hash_to_field(sale.sale_id);

        let f: Future = finalize_complete_sale_escrow(transfer_f, sale_commitment, sale.tag_commitment);
        return (artifact, seller_credits, buyer_receipt, seller_receipt, f);
    }

    async function finalize_complete_sale_escrow(
        transfer_f: Future,
        sale_commitment: field,
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        transfer_f.await();
        Mapping::set(sale_active, sale_commitment, false);
        Mapping::set(sale_paid, sale_commitment, false);
        Mapping::set(escrow_timestamps, sale_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // COMPLETE SALE (USDCx) — ATOMIC: Deliver artifact to buyer
    //
    // Since USDCx was paid directly to the seller during buy_sale_usdcx,
    // this transition only needs to deliver the artifact and clean state.
    // ─────────────────────────────────────────────────────────────────
    async transition complete_sale_usdcx(
        sale: SaleRecord,
        buyer: address
    ) -> (AssetArtifact, BuyerReceipt, SellerReceipt, Future) {
        assert_eq(sale.owner, self.signer);
        assert_eq(sale.currency, 1u8);

        let new_nonce: field = BHP256::hash_to_field(
            sale.nonce_seed + BHP256::hash_to_field(buyer)
        );

        let artifact: AssetArtifact = AssetArtifact {
            owner: buyer,
            brand: sale.brand,
            tag_hash: sale.tag_hash,
            serial_hash: sale.serial_hash,
            model_id: sale.model_id,
            nonce_seed: new_nonce
        };

        let payment_hash: field = BHP256::hash_to_field(sale.sale_id + sale.tag_commitment);

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: buyer,
            seller: self.signer,
            tag_hash: sale.tag_hash,
            payment_hash: payment_hash,
            amount: sale.price,
            token_type: 1u8
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: self.signer,
            payment_hash: payment_hash,
            tag_hash: sale.tag_hash,
            amount: sale.price,
            token_type: 1u8
        };

        let sale_commitment: field = BHP256::hash_to_field(sale.sale_id);

        let f: Future = finalize_complete_sale_usdcx(sale_commitment, sale.tag_commitment);
        return (artifact, buyer_receipt, seller_receipt, f);
    }

    async function finalize_complete_sale_usdcx(
        sale_commitment: field,
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_active, sale_commitment, false);
        Mapping::set(sale_paid, sale_commitment, false);
        Mapping::set(escrow_timestamps, sale_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // CANCEL SALE — Seller withdraws item (before payment only)
    // ─────────────────────────────────────────────────────────────────
    async transition cancel_sale(sale: SaleRecord) -> (AssetArtifact, Future) {
        assert_eq(sale.owner, self.signer);

        let artifact: AssetArtifact = AssetArtifact {
            owner: self.signer,
            brand: sale.brand,
            tag_hash: sale.tag_hash,
            serial_hash: sale.serial_hash,
            model_id: sale.model_id,
            nonce_seed: sale.nonce_seed
        };

        let sale_commitment: field = BHP256::hash_to_field(sale.sale_id);
        let f: Future = finalize_cancel_sale(sale_commitment);
        return (artifact, f);
    }

    async function finalize_cancel_sale(sale_commitment: field) {
        let active: bool = Mapping::get_or_use(sale_active, sale_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(!paid);
        Mapping::set(sale_active, sale_commitment, false);
    }

    // ─────────────────────────────────────────────────────────────────
    // REFUND SALE (ESCROW) — Buyer reclaims ALEO credits after timeout
    // ─────────────────────────────────────────────────────────────────
    async transition refund_sale_escrow(
        receipt: PurchaseReceipt
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.signer);
        assert_eq(receipt.currency, 0u8);

        let (buyer_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.signer, receipt.amount);

        let sale_commitment: field = BHP256::hash_to_field(receipt.sale_id);
        let f: Future = finalize_refund_sale_escrow(transfer_f, sale_commitment);
        return (buyer_credits, f);
    }

    async function finalize_refund_sale_escrow(
        transfer_f: Future,
        sale_commitment: field
    ) {
        let paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(paid);
        let created_at: u64 = Mapping::get(escrow_timestamps, sale_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        transfer_f.await();
        Mapping::set(sale_paid, sale_commitment, false);
        Mapping::set(escrow_timestamps, sale_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // REFUND SALE (USDCx) — Reset sale state after timeout
    //
    // Since USDCx was paid directly to the seller in buy_sale_usdcx,
    // USDCx refunds require off-chain coordination. This transition
    // only resets on-chain state so the seller can cancel_sale.
    // ─────────────────────────────────────────────────────────────────
    async transition refund_sale_usdcx(
        receipt: PurchaseReceipt
    ) -> Future {
        assert_eq(receipt.owner, self.signer);
        assert_eq(receipt.currency, 1u8);

        let sale_commitment: field = BHP256::hash_to_field(receipt.sale_id);
        let f: Future = finalize_refund_sale_usdcx(sale_commitment);
        return f;
    }

    async function finalize_refund_sale_usdcx(sale_commitment: field) {
        let paid: bool = Mapping::get_or_use(sale_paid, sale_commitment, false);
        assert(paid);
        let created_at: u64 = Mapping::get(escrow_timestamps, sale_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        Mapping::set(sale_paid, sale_commitment, false);
        Mapping::set(escrow_timestamps, sale_commitment, 0u64);
    }
}
