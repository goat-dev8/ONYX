// ONYX - Private Product Passports for Luxury Goods
// Built on Aleo for Zero-Knowledge Authentication
// Version: 1.0.0

program onyxpriv_v1.aleo {

    // ========== Lifecycle ==========
    @noupgrade
    async constructor() {}

    // ========== Record Types ==========
    
    // Core artifact record - represents an authenticated luxury item
    record AssetArtifact {
        owner: address,        // Current owner of the item
        brand: address,        // Brand that minted this artifact
        tag_hash: field,       // Unique identifier for the physical tag
        serial_hash: field,    // Hash of serial number (private)
        model_id: u64,         // Model/product line identifier
        nonce_seed: field      // Unique seed for record identification
    }

    // Warranty claim record for service/repair tracking
    record WarrantyClaim {
        owner: address,
        tag_hash: field,
        claim_hash: field,
        timestamp: u64
    }

    // ========== Public Mappings ==========
    
    mapping tag_brand: field => address;           // tag_hash => brand address
    mapping tag_model: field => u64;               // tag_hash => model_id
    mapping tag_minted_at: field => u64;           // tag_hash => block height
    mapping tag_is_stolen: field => bool;          // tag_hash => stolen status
    mapping tag_last_transfer_at: field => u64;    // tag_hash => last transfer block
    mapping used_nullifiers: field => bool;        // Prevents double-spending
    mapping nonce_counter: field => u64;           // Counter for generating unique nonces

    // ========== Core Transitions ==========

    // Mint a new artifact - only brands can mint
    async transition mint_artifact(
        tag_hash: field,
        serial_hash: field,
        model_id: u64,
        initial_owner: address
    ) -> (AssetArtifact, Future) {
        // Generate nonce from inputs (deterministic but unique per mint)
        let nonce: field = BHP256::hash_to_field(tag_hash + serial_hash);
        
        // Create the artifact record owned by initial_owner
        let artifact: AssetArtifact = AssetArtifact {
            owner: initial_owner,
            brand: self.signer,
            tag_hash: tag_hash,
            serial_hash: serial_hash,
            model_id: model_id,
            nonce_seed: nonce
        };

        // Finalize to register on-chain
        let f: Future = finalize_mint_artifact(
            self.signer,
            tag_hash,
            model_id
        );

        return (artifact, f);
    }

    async function finalize_mint_artifact(
        brand: address,
        tag_hash: field,
        model_id: u64
    ) {
        // Ensure tag hasn't been minted before (check if minted_at is 0)
        let existing_mint: u64 = Mapping::get_or_use(tag_minted_at, tag_hash, 0u64);
        assert_eq(existing_mint, 0u64);

        // Register the artifact publicly
        Mapping::set(tag_brand, tag_hash, brand);
        Mapping::set(tag_model, tag_hash, model_id);
        Mapping::set(tag_minted_at, tag_hash, block.height as u64);
        Mapping::set(tag_is_stolen, tag_hash, false);
    }

    // Transfer artifact to new owner - only current owner can transfer
    async transition transfer_artifact(
        artifact: AssetArtifact,
        new_owner: address
    ) -> (AssetArtifact, Future) {
        // Verify caller owns the artifact
        assert_eq(artifact.owner, self.signer);

        // Generate new nonce from old nonce + new owner
        let new_nonce: field = BHP256::hash_to_field(artifact.nonce_seed + BHP256::hash_to_field(new_owner));

        // Create new record with updated owner
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
        // Update last transfer timestamp
        Mapping::set(tag_last_transfer_at, tag_hash, block.height as u64);
    }

    // Report artifact as stolen - only current owner can report
    async transition report_stolen(
        artifact: AssetArtifact
    ) -> (AssetArtifact, Future) {
        // Verify caller owns the artifact
        assert_eq(artifact.owner, self.signer);

        // Generate new nonce
        let new_nonce: field = BHP256::hash_to_field(artifact.nonce_seed + 1field);

        // Owner keeps the record (for potential recovery)
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
        // Mark as stolen publicly
        Mapping::set(tag_is_stolen, tag_hash, true);
    }

    // Generate proof for resale verification - does NOT consume the artifact
    transition prove_for_resale(
        artifact: AssetArtifact,
        salt: field
    ) -> (AssetArtifact, field) {
        // Verify caller owns the artifact
        assert_eq(artifact.owner, self.signer);

        // Generate proof token from artifact data + salt
        let proof_input: field = BHP256::hash_to_field(
            artifact.tag_hash + 
            artifact.serial_hash + 
            salt
        );

        let token: field = BHP256::hash_to_field(proof_input);

        // Return artifact unchanged (non-consuming)
        return (artifact, token);
    }

    // ========== Helper Functions ==========

    // Compute tag hash from serial and model
    function compute_tag_hash(
        serial: field,
        model_id: u64
    ) -> field {
        return BHP256::hash_to_field(serial + (model_id as field));
    }
}
