// ONYX v7 — Private Product Passports with Bounty Claims & Triple Payment
// Built on Aleo for Zero-Knowledge Authentication
// Version: 7.0.0
//
// v7 changes over v6:
//   - sale_active/sale_paid mappings now keyed by tag_commitment (= BHP256(tag_hash))
//     instead of sale_commitment (= BHP256(sale_id)). This eliminates the complex
//     multi-step sale_id hash that caused SDK/on-chain mismatches and REJECTED TXs.
//   - SaleRecord: removed sale_id field (no longer needed)
//   - PurchaseReceipt: removed sale_id field
//   - create_sale: removed sale_salt parameter
//   - buy_sale_escrow: removed sale_id parameter — uses tag_hash directly
//   - reg_stablecoin_buy: removed sale_id parameter — uses tag_hash directly
//   - All complete_sale_* and cancel_sale use tag_commitment for mapping keys
//   - All refund_sale_* use BHP256(tag_hash) for mapping keys
//   - Buyer no longer needs to know any seller-generated IDs — just tag_hash
//
// Preserved from v6:
//   - claim_bounty, claim_bounty_recover, bounty_amounts
//   - USAD stablecoin support via onyxpriv_v7_pay.aleo
//   - BHP256::commit_to_field() for payment receipts
//   - Triple payment: ALEO credits + USDCx + USAD
//   - Modular architecture: stablecoin payments split to separate program

import credits.aleo;

program onyxpriv_v7.aleo {

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
        price: u64,              // Sale price (microcredits or micro-tokens)
        currency: u8,            // 0 = ALEO, 1 = USDCx, 2 = USAD
        tag_commitment: field    // BHP256(tag_hash) — used as mapping key
    }

    // PurchaseReceipt — Buyer's proof of payment for an active sale.
    // Used for refund claims if seller doesn't complete.
    record PurchaseReceipt {
        owner: address,          // Buyer
        tag_hash: field,
        amount: u64,
        seller: address,
        currency: u8             // 0 = ALEO (escrowed), 1 = USDCx (direct), 2 = USAD (direct)
    }

    // ================================================================
    //              PUBLIC MAPPINGS — 8 total (v5 had 7)
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

    // 6. Sale active status — BHP256(tag_hash) → is_active
    mapping sale_active: field => bool;

    // 7. Sale payment status — BHP256(tag_hash) → is_paid
    mapping sale_paid: field => bool;

    // 8. NEW v6: Bounty amounts — BHP256(tag_hash) → bounty microcredits
    mapping bounty_amounts: field => u64;

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

    @admin(address = "aleo1mg88d2fzwgtk5jtszfw3z52q6z8uwys2g689r3vg9g9jsc7xlc9syedftd")
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
    //        LEGACY ESCROW SYSTEM (v4)
    //        Moved to onyxpriv_v7_pay.aleo for modular deployment
    // ================================================================

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
        let f: Future = finalize_report_stolen_bounty(transfer_f, tag_commitment, bounty_amt);
        return (updated, pledge, change, f);
    }

    async function finalize_report_stolen_bounty(transfer_f: Future, tag_commitment: field, bounty_amt: u64) {
        transfer_f.await();
        Mapping::set(stolen_commitments, tag_commitment, true);
        Mapping::set(bounty_amounts, tag_commitment, bounty_amt);
    }

    // ================================================================
    //    NEW v6 — BOUNTY CLAIM SYSTEM
    // ================================================================
    //
    // Two claim paths:
    //   1. claim_bounty: Owner authorizes payout to a specified claimer
    //   2. claim_bounty_recover: Finder proves possession of stolen artifact
    //
    // Both paths release escrowed credits from the program's public balance.

    // ─────────────────────────────────────────────────────────────────
    // CLAIM BOUNTY (Owner-Authorized)
    // Owner presents their BountyPledge record and specifies who gets paid.
    // ─────────────────────────────────────────────────────────────────
    async transition claim_bounty(
        pledge: BountyPledge,
        claimer: address
    ) -> (credits.aleo/credits, Future) {
        assert_eq(pledge.owner, self.signer);

        let (claimer_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(claimer, pledge.amount);

        let f: Future = finalize_claim_bounty(transfer_f, pledge.tag_commitment);
        return (claimer_credits, f);
    }

    async function finalize_claim_bounty(transfer_f: Future, tag_commitment: field) {
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(stolen);
        transfer_f.await();
        Mapping::set(bounty_amounts, tag_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // CLAIM BOUNTY RECOVER (Finder-Provable)
    // Anyone holding the stolen AssetArtifact can claim the bounty.
    // Proves possession by consuming & re-creating the artifact record.
    // Clears stolen status (item recovered).
    // ─────────────────────────────────────────────────────────────────
    async transition claim_bounty_recover(
        artifact: AssetArtifact,
        bounty_amount: u64
    ) -> (AssetArtifact, credits.aleo/credits, Future) {
        let tag_commitment: field = BHP256::hash_to_field(artifact.tag_hash);

        let (finder_credits, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.signer, bounty_amount);

        let new_nonce: field = BHP256::hash_to_field(artifact.nonce_seed + 3field);
        let updated: AssetArtifact = AssetArtifact {
            owner: artifact.owner,
            brand: artifact.brand,
            tag_hash: artifact.tag_hash,
            serial_hash: artifact.serial_hash,
            model_id: artifact.model_id,
            nonce_seed: new_nonce
        };

        let f: Future = finalize_claim_bounty_recover(transfer_f, tag_commitment, bounty_amount);
        return (updated, finder_credits, f);
    }

    async function finalize_claim_bounty_recover(
        transfer_f: Future,
        tag_commitment: field,
        claimed_amount: u64
    ) {
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(stolen);
        let stored_amount: u64 = Mapping::get(bounty_amounts, tag_commitment);
        assert_eq(stored_amount, claimed_amount);
        assert(claimed_amount > 0u64);
        transfer_f.await();
        Mapping::set(stolen_commitments, tag_commitment, false);
        Mapping::set(bounty_amounts, tag_commitment, 0u64);
    }

    // ================================================================
    //      VERIFICATION PAYMENTS
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

        let salt_scalar: scalar = BHP256::hash_to_scalar(salt);
        let payment_hash: field = BHP256::commit_to_field(payment_secret, salt_scalar);

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

    // ─── HELPER: Stablecoin verification payment (called by onyxpriv_v7_pay.aleo) ───

    async transition reg_stablecoin_verify(
        seller: address,
        tag_hash: field,
        payment_secret: field,
        salt: field,
        amount: u64,
        token_type: u8
    ) -> (BuyerReceipt, SellerReceipt, Future) {
        // Only callable from another program (payment program), not directly
        assert_neq(self.caller, self.signer);

        let salt_scalar: scalar = BHP256::hash_to_scalar(salt);
        let payment_hash: field = BHP256::commit_to_field(payment_secret, salt_scalar);

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: self.signer, seller: seller, tag_hash: tag_hash,
            payment_hash: payment_hash, amount: amount, token_type: token_type
        };
        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller, payment_hash: payment_hash, tag_hash: tag_hash,
            amount: amount, token_type: token_type
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);
        let f: Future = finalize_reg_stablecoin_verify(tag_commitment);
        return (buyer_receipt, seller_receipt, f);
    }

    async function finalize_reg_stablecoin_verify(tag_commitment: field) {
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
    }

    // ─── NEW v7: USAD Verification Payment ──────────────────────────
    // Moved to onyxpriv_v7_pay.aleo (modular stablecoin payment program)

    // ================================================================
    //   MIGRATION HELPERS — Moved to onyxpriv_v7_pay.aleo
    // ================================================================

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
        currency: u8
    ) -> (SaleRecord, Future) {
        assert_eq(artifact.owner, self.signer);
        assert(currency == 0u8 || currency == 1u8 || currency == 2u8);
        assert(price > 0u64);

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
            tag_commitment: tag_commitment
        };

        let f: Future = finalize_create_sale(tag_commitment);
        return (sale, f);
    }

    async function finalize_create_sale(
        tag_commitment: field
    ) {
        let exists: bool = Mapping::get_or_use(tag_uniqueness, tag_commitment, false);
        assert(exists);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        let existing: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(!existing);
        Mapping::set(sale_active, tag_commitment, true);
    }

    // ─────────────────────────────────────────────────────────────────
    // BUY SALE (ESCROW) — Lock ALEO credits for an active sale
    // ─────────────────────────────────────────────────────────────────
    async transition buy_sale_escrow(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address
    ) -> (PurchaseReceipt, credits.aleo/credits, Future) {
        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(pay_record, self.address, amount);

        let receipt: PurchaseReceipt = PurchaseReceipt {
            owner: self.signer,
            tag_hash: tag_hash,
            amount: amount,
            seller: seller,
            currency: 0u8
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);

        let f: Future = finalize_buy_sale_escrow(transfer_f, tag_commitment);
        return (receipt, change, f);
    }

    async function finalize_buy_sale_escrow(
        transfer_f: Future,
        tag_commitment: field
    ) {
        transfer_f.await();
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let already_paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(!already_paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_paid, tag_commitment, true);
        Mapping::set(escrow_timestamps, tag_commitment, block.height as u64);
    }

    // ─── HELPER: Stablecoin sale payment (called by onyxpriv_v7_pay.aleo) ───

    async transition reg_stablecoin_buy(
        tag_hash: field,
        amount: u64,
        seller: address,
        currency: u8
    ) -> (PurchaseReceipt, Future) {
        // Only callable from another program (payment program), not directly
        assert_neq(self.caller, self.signer);

        let receipt: PurchaseReceipt = PurchaseReceipt {
            owner: self.signer,
            tag_hash: tag_hash,
            amount: amount,
            seller: seller,
            currency: currency
        };

        let tag_commitment: field = BHP256::hash_to_field(tag_hash);

        let f: Future = finalize_reg_stablecoin_buy(tag_commitment);
        return (receipt, f);
    }

    async function finalize_reg_stablecoin_buy(
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let already_paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(!already_paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_paid, tag_commitment, true);
        Mapping::set(escrow_timestamps, tag_commitment, block.height as u64);
    }

    // buy_sale_usdcx + buy_sale_usad: Moved to onyxpriv_v7_pay.aleo

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

        let payment_hash: field = BHP256::hash_to_field(sale.tag_commitment);

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

        let f: Future = finalize_complete_sale_escrow(transfer_f, sale.tag_commitment);
        return (artifact, seller_credits, buyer_receipt, seller_receipt, f);
    }

    async function finalize_complete_sale_escrow(
        transfer_f: Future,
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        transfer_f.await();
        Mapping::set(sale_active, tag_commitment, false);
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
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

        let payment_hash: field = BHP256::hash_to_field(sale.tag_commitment);

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

        let f: Future = finalize_complete_sale_usdcx(sale.tag_commitment);
        return (artifact, buyer_receipt, seller_receipt, f);
    }

    async function finalize_complete_sale_usdcx(
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_active, tag_commitment, false);
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
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

        let f: Future = finalize_cancel_sale(sale.tag_commitment);
        return (artifact, f);
    }

    async function finalize_cancel_sale(tag_commitment: field) {
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(!paid);
        Mapping::set(sale_active, tag_commitment, false);
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

        let tag_commitment: field = BHP256::hash_to_field(receipt.tag_hash);
        let f: Future = finalize_refund_sale_escrow(transfer_f, tag_commitment);
        return (buyer_credits, f);
    }

    async function finalize_refund_sale_escrow(
        transfer_f: Future,
        tag_commitment: field
    ) {
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let created_at: u64 = Mapping::get(escrow_timestamps, tag_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        transfer_f.await();
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
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

        let tag_commitment: field = BHP256::hash_to_field(receipt.tag_hash);
        let f: Future = finalize_refund_sale_usdcx(tag_commitment);
        return f;
    }

    async function finalize_refund_sale_usdcx(tag_commitment: field) {
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let created_at: u64 = Mapping::get(escrow_timestamps, tag_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
    }

    // ================================================================
    //    USAD SALE TRANSITIONS
    // ================================================================
    // buy_sale_usad: Moved to onyxpriv_v7_pay.aleo (modular payment program)

    // ─────────────────────────────────────────────────────────────────
    // COMPLETE SALE (USAD) — Deliver artifact to buyer
    // USAD was paid directly via onyxpriv_v7_pay.aleo, only delivers artifact.
    // ─────────────────────────────────────────────────────────────────
    async transition complete_sale_usad(
        sale: SaleRecord,
        buyer: address
    ) -> (AssetArtifact, BuyerReceipt, SellerReceipt, Future) {
        assert_eq(sale.owner, self.signer);
        assert_eq(sale.currency, 2u8);

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

        let payment_hash: field = BHP256::hash_to_field(sale.tag_commitment);

        let buyer_receipt: BuyerReceipt = BuyerReceipt {
            owner: buyer,
            seller: self.signer,
            tag_hash: sale.tag_hash,
            payment_hash: payment_hash,
            amount: sale.price,
            token_type: 2u8
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: self.signer,
            payment_hash: payment_hash,
            tag_hash: sale.tag_hash,
            amount: sale.price,
            token_type: 2u8
        };

        let f: Future = finalize_complete_sale_usad(sale.tag_commitment);
        return (artifact, buyer_receipt, seller_receipt, f);
    }

    async function finalize_complete_sale_usad(
        tag_commitment: field
    ) {
        let active: bool = Mapping::get_or_use(sale_active, tag_commitment, false);
        assert(active);
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let stolen: bool = Mapping::get_or_use(stolen_commitments, tag_commitment, false);
        assert(!stolen);
        Mapping::set(sale_active, tag_commitment, false);
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
    }

    // ─────────────────────────────────────────────────────────────────
    // REFUND SALE (USAD) — Reset sale state after timeout
    // USAD was paid directly; actual refund requires off-chain coordination.
    // ─────────────────────────────────────────────────────────────────
    async transition refund_sale_usad(
        receipt: PurchaseReceipt
    ) -> Future {
        assert_eq(receipt.owner, self.signer);
        assert_eq(receipt.currency, 2u8);

        let tag_commitment: field = BHP256::hash_to_field(receipt.tag_hash);
        let f: Future = finalize_refund_sale_usad(tag_commitment);
        return f;
    }

    async function finalize_refund_sale_usad(tag_commitment: field) {
        let paid: bool = Mapping::get_or_use(sale_paid, tag_commitment, false);
        assert(paid);
        let created_at: u64 = Mapping::get(escrow_timestamps, tag_commitment);
        assert(created_at > 0u64);
        assert((block.height as u64) >= created_at + 1000u64);
        Mapping::set(sale_paid, tag_commitment, false);
        Mapping::set(escrow_timestamps, tag_commitment, 0u64);
    }
}
