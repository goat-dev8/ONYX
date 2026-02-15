// ONYX - Private Product Passports for Luxury Goods
// Built on Aleo for Zero-Knowledge Authentication
// Version: 3.0.0
//
// Architecture:
//   - Self-registration: Any wallet can register as a brand on-chain
//   - Real credits.aleo integration for escrow deposits and bounties
//   - Real USDCx stablecoin integration (test_usdcx_stablecoin.aleo)
//   - Hash-based artifact identity (BHP256 tag + serial hashes)
//   - On-chain stolen/transfer tracking with private ownership records
//   - Proof registry for resale verification
//   - Hash-based verification payments with replay prevention

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program onyxpriv_v3.aleo {

    // ========== Record Types ==========

    // Core artifact record — represents an authenticated luxury item
    record AssetArtifact {
        owner: address,        // Current owner of the item
        brand: address,        // Brand that minted this artifact
        tag_hash: field,       // Hash of the physical NFC/RFID tag
        serial_hash: field,    // Hash of serial number (private)
        model_id: u64,         // Model/product line identifier
        nonce_seed: field      // Unique seed for record uniqueness
    }

    // Escrow receipt — held by buyer as proof of deposit
    record EscrowReceipt {
        owner: address,        // Buyer who created the escrow
        escrow_id: field,      // Unique escrow identifier
        tag_hash: field,       // Tag being verified
        amount: u64,           // Credits deposited
        seller: address        // Expected seller address
    }

    // Buyer receipt — proof of verification payment (credits or USDCx)
    record BuyerReceipt {
        owner: address,        // Buyer who paid
        seller: address,       // Seller who received payment
        tag_hash: field,       // Artifact being verified
        payment_hash: field,   // Hash-based verification
        amount: u64,           // Amount paid
        token_type: u8         // 0 = credits, 1 = USDCx
    }

    // Seller receipt — proof of received verification payment
    record SellerReceipt {
        owner: address,        // Seller who received payment
        payment_hash: field,   // Hash-based verification
        tag_hash: field,       // Artifact verified
        amount: u64,           // Amount received
        token_type: u8         // 0 = credits, 1 = USDCx
    }

    // ========== Public Mappings ==========

    // Admin address for optional governance
    mapping admin: u8 => address;

    // Brand registry — self-registration, no admin approval needed
    mapping registered_brands: address => bool;

    // Artifact registry
    mapping tag_brand: field => address;
    mapping tag_model: field => u64;
    mapping tag_minted_at: field => u64;
    mapping tag_is_stolen: field => bool;
    mapping tag_last_transfer_at: field => u64;

    // Escrow system
    mapping escrow_deposits: field => u64;
    mapping escrow_created_at: field => u64;

    // Bounty system
    mapping bounty_amount: field => u64;
    mapping bounty_reporter: field => address;

    // Proof registry
    mapping proof_registry: field => field;

    // Payment registry — hash-based verification with replay prevention
    mapping payment_receipts: field => u64;    // receipt_hash => amount
    mapping salt_to_payment: field => field;   // salt => payment_hash

    // ========== External Structs (local copy for cross-program calls) ==========

    // MerkleProof — matches test_usdcx_stablecoin.aleo/MerkleProof
    struct MerkleProof {
        siblings: [field; 16],
        leaf_index: u32
    }

    // ========== Constructor ==========

    @admin(address = "aleo12qr5t4xa7z4yk6lkdxaf0md9g042sctaltgdsyan7uhqp8xdxuxqwkfqjc")
    async constructor() {}

    // ========== Brand Self-Registration ==========

    // Any wallet can register itself as a brand — NO admin approval needed
    async transition register_brand() -> Future {
        return finalize_register_brand(self.signer);
    }

    async function finalize_register_brand(brand: address) {
        Mapping::set(registered_brands, brand, true);
    }

    // ========== Admin Transitions (Optional Governance) ==========

    // Admin can remove a brand (for fraud/abuse cases)
    async transition admin_remove_brand(brand: address) -> Future {
        return finalize_admin_remove_brand(self.signer, brand);
    }

    async function finalize_admin_remove_brand(caller: address, brand: address) {
        let admin_addr: address = Mapping::get(admin, 0u8);
        assert_eq(caller, admin_addr);
        Mapping::set(registered_brands, brand, false);
    }

    // ========== Core Transitions ==========

    // Mint a new artifact — ANY registered brand can mint (no admin gate)
    async transition mint_artifact(
        tag_hash: field,
        serial_hash: field,
        model_id: u64,
        initial_owner: address
    ) -> (AssetArtifact, Future) {
        let nonce: field = BHP256::hash_to_field(tag_hash + serial_hash);

        let artifact: AssetArtifact = AssetArtifact {
            owner: initial_owner,
            brand: self.signer,
            tag_hash: tag_hash,
            serial_hash: serial_hash,
            model_id: model_id,
            nonce_seed: nonce
        };

        let f: Future = finalize_mint_artifact(self.signer, tag_hash, model_id);
        return (artifact, f);
    }

    async function finalize_mint_artifact(
        brand: address,
        tag_hash: field,
        model_id: u64
    ) {
        // Verify brand has self-registered (lightweight check, no admin needed)
        let is_registered: bool = Mapping::get_or_use(registered_brands, brand, false);
        assert(is_registered);

        // Ensure tag hasn't been minted before (uniqueness check)
        let existing_mint: u64 = Mapping::get_or_use(tag_minted_at, tag_hash, 0u64);
        assert_eq(existing_mint, 0u64);

        // Register the artifact publicly
        Mapping::set(tag_brand, tag_hash, brand);
        Mapping::set(tag_model, tag_hash, model_id);
        Mapping::set(tag_minted_at, tag_hash, block.height as u64);
        Mapping::set(tag_is_stolen, tag_hash, false);
    }

    // Transfer artifact to new owner — blocks stolen items
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

        let f: Future = finalize_transfer_artifact(artifact.tag_hash);
        return (new_artifact, f);
    }

    async function finalize_transfer_artifact(tag_hash: field) {
        let stolen: bool = Mapping::get_or_use(tag_is_stolen, tag_hash, false);
        assert(!stolen);
        Mapping::set(tag_last_transfer_at, tag_hash, block.height as u64);
    }

    // Report artifact as stolen
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

        let f: Future = finalize_report_stolen(artifact.tag_hash);
        return (updated_artifact, f);
    }

    async function finalize_report_stolen(tag_hash: field) {
        Mapping::set(tag_is_stolen, tag_hash, true);
    }

    // Generate proof for resale
    async transition prove_for_resale(
        artifact: AssetArtifact,
        salt: field
    ) -> (AssetArtifact, field, Future) {
        assert_eq(artifact.owner, self.signer);

        let proof_input: field = BHP256::hash_to_field(
            artifact.tag_hash +
            artifact.serial_hash +
            salt
        );
        let token: field = BHP256::hash_to_field(proof_input);

        let f: Future = finalize_prove_for_resale(token, artifact.tag_hash);
        return (artifact, token, f);
    }

    async function finalize_prove_for_resale(token: field, tag_hash: field) {
        let stolen: bool = Mapping::get_or_use(tag_is_stolen, tag_hash, false);
        assert(!stolen);
        Mapping::set(proof_registry, token, tag_hash);
    }

    // ========== Escrow System (credits.aleo integration) ==========

    // Buyer creates escrow — deposits credits for paid verification
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

        let f: Future = finalize_create_escrow(transfer_f, escrow_id, amount);
        return (receipt, change, f);
    }

    async function finalize_create_escrow(
        transfer_f: Future,
        escrow_id: field,
        amount: u64
    ) {
        transfer_f.await();

        let existing: u64 = Mapping::get_or_use(escrow_deposits, escrow_id, 0u64);
        assert_eq(existing, 0u64);

        Mapping::set(escrow_deposits, escrow_id, amount);
        Mapping::set(escrow_created_at, escrow_id, block.height as u64);
    }

    // Buyer releases escrow — pays seller after verifying item
    async transition release_escrow(
        receipt: EscrowReceipt
    ) -> Future {
        assert_eq(receipt.owner, self.signer);

        let transfer_f: Future = credits.aleo/transfer_public(
            receipt.seller, receipt.amount
        );

        let f: Future = finalize_release_escrow(
            transfer_f, receipt.escrow_id, receipt.amount
        );
        return f;
    }

    async function finalize_release_escrow(
        transfer_f: Future,
        escrow_id: field,
        amount: u64
    ) {
        let deposited: u64 = Mapping::get_or_use(escrow_deposits, escrow_id, 0u64);
        assert(deposited > 0u64);
        assert_eq(deposited, amount);

        transfer_f.await();

        Mapping::set(escrow_deposits, escrow_id, 0u64);
        Mapping::set(escrow_created_at, escrow_id, 0u64);
    }

    // Buyer refunds expired escrow
    async transition refund_escrow(
        receipt: EscrowReceipt
    ) -> Future {
        assert_eq(receipt.owner, self.signer);

        let transfer_f: Future = credits.aleo/transfer_public(
            self.signer, receipt.amount
        );

        let f: Future = finalize_refund_escrow(
            transfer_f, receipt.escrow_id, receipt.amount
        );
        return f;
    }

    async function finalize_refund_escrow(
        transfer_f: Future,
        escrow_id: field,
        amount: u64
    ) {
        let deposited: u64 = Mapping::get_or_use(escrow_deposits, escrow_id, 0u64);
        assert(deposited > 0u64);
        assert_eq(deposited, amount);

        let created_at: u64 = Mapping::get(escrow_created_at, escrow_id);
        assert((block.height as u64) >= created_at + 1000u64);

        transfer_f.await();

        Mapping::set(escrow_deposits, escrow_id, 0u64);
        Mapping::set(escrow_created_at, escrow_id, 0u64);
    }

    // ========== Bounty System ==========

    // Report stolen with bounty
    async transition report_stolen_with_bounty(
        artifact: AssetArtifact,
        bounty_record: credits.aleo/credits,
        bounty_amt: u64
    ) -> (AssetArtifact, credits.aleo/credits, Future) {
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

        let (change, transfer_f): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(bounty_record, self.address, bounty_amt);

        let f: Future = finalize_report_stolen_bounty(
            transfer_f, artifact.tag_hash, self.signer, bounty_amt
        );
        return (updated, change, f);
    }

    async function finalize_report_stolen_bounty(
        transfer_f: Future,
        tag_hash: field,
        reporter: address,
        amount: u64
    ) {
        transfer_f.await();
        Mapping::set(tag_is_stolen, tag_hash, true);
        Mapping::set(bounty_amount, tag_hash, amount);
        Mapping::set(bounty_reporter, tag_hash, reporter);
    }

    // ========== Verification Payments (Credits) ==========

    // Direct private payment for artifact verification using credits.aleo
    // Uses hash-based identity: BHP256(seller) + BHP256(amount) + BHP256(salt)
    async transition pay_verification(
        pay_record: credits.aleo/credits,
        tag_hash: field,
        amount: u64,
        seller: address,
        salt: field,
        private payment_secret: field
    ) -> (credits.aleo/credits, credits.aleo/credits, BuyerReceipt, SellerReceipt, Future) {
        // Private transfer to seller
        let (r1, r2): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pay_record, seller, amount);

        // Compute payment hash for on-chain verification
        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        // Compute receipt hash for replay prevention
        let salt_scalar: scalar = BHP256::hash_to_scalar(salt);
        let receipt_hash: field = BHP256::commit_to_field(payment_secret, salt_scalar);

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

        let f: Future = finalize_pay_verification(
            tag_hash, payment_hash, salt, receipt_hash, amount
        );
        return (r1, r2, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification(
        tag_hash: field,
        payment_hash: field,
        salt: field,
        receipt_hash: field,
        amount: u64
    ) {
        // Verify artifact exists on-chain
        let minted: u64 = Mapping::get_or_use(tag_minted_at, tag_hash, 0u64);
        assert(minted > 0u64);

        // Verify artifact not stolen
        let stolen: bool = Mapping::get_or_use(tag_is_stolen, tag_hash, false);
        assert(!stolen);

        // Prevent duplicate payments with same receipt
        let exists: bool = Mapping::contains(payment_receipts, receipt_hash);
        assert(!exists);

        // Register payment on-chain
        Mapping::set(payment_receipts, receipt_hash, amount);
        Mapping::set(salt_to_payment, salt, payment_hash);
    }

    // ========== Verification Payments (USDCx Stablecoin) ==========

    // Direct private payment using USDCx stablecoin with freeze-list compliance
    // Cross-program call to test_usdcx_stablecoin.aleo/transfer_private
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

        // Compute payment hash for on-chain verification
        let seller_field: field = seller as field;
        let amount_field: field = amount as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);
        let amount_hash: field = BHP256::hash_to_field(amount_field);
        let salt_hash: field = BHP256::hash_to_field(salt);
        let payment_hash: field = seller_hash + amount_hash + salt_hash;

        // Compute receipt hash for replay prevention
        let salt_scalar: scalar = BHP256::hash_to_scalar(salt);
        let receipt_hash: field = BHP256::commit_to_field(payment_secret, salt_scalar);

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

        let f: Future = finalize_pay_verification_usdcx(
            transfer_future, tag_hash, payment_hash, salt, receipt_hash, amount_u64
        );
        return (token_seller, token_change, compliance_record, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification_usdcx(
        transfer_f: Future,
        tag_hash: field,
        payment_hash: field,
        salt: field,
        receipt_hash: field,
        amount: u64
    ) {
        // Await USDCx transfer with compliance verification
        transfer_f.await();

        // Verify artifact exists on-chain
        let minted: u64 = Mapping::get_or_use(tag_minted_at, tag_hash, 0u64);
        assert(minted > 0u64);

        // Verify artifact not stolen
        let stolen: bool = Mapping::get_or_use(tag_is_stolen, tag_hash, false);
        assert(!stolen);

        // Prevent duplicate payments
        let exists: bool = Mapping::contains(payment_receipts, receipt_hash);
        assert(!exists);

        // Register payment on-chain
        Mapping::set(payment_receipts, receipt_hash, amount);
        Mapping::set(salt_to_payment, salt, payment_hash);
    }
}
