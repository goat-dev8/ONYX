export interface Brand {
  address: string;
  displayName: string;
  createdAt: string;
}

export interface Artifact {
  tagHash: string;
  brandAddress: string;
  modelId: number;
  serialHash: string;
  createdTxId: string;
  mintedAt: string;
  stolen: boolean;
  lastUpdateTxId: string;
  ownerHash?: string; // SHA-256 hash of owner address (never store plaintext)
}

export interface Listing {
  id: string;                    // UUID
  tagCommitment: string;         // BHP256(tag_hash) — used for on-chain mapping lookups
  tagHash: string;               // Raw tag_hash — needed by buyers for escrow/payment
  brandAddress: string;          // Brand that minted it (public by design)
  brandName: string;             // Resolved display name
  modelId: number;               // Product line (seller opts in to share)
  title: string;                 // e.g. "Rolex Submariner Date"
  description: string;           // Seller-written description
  condition: 'new' | 'like_new' | 'good' | 'fair';
  imageUrl?: string;             // Optional product photo URL
  price: number;                 // Asking price (microcredits for ALEO, token units for USDCx)
  currency: 'aleo' | 'usdcx';   // Payment type
  sellerHash: string;            // SHA-256(seller_address) — NEVER raw address
  status: 'active' | 'reserved' | 'sold' | 'delisted';
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  onChainMinted: boolean;        // tag_uniqueness[commitment] === true (cached)
  onChainStolen: boolean;        // stolen_commitments[commitment] === true (cached)
  lastVerifiedAt: string;        // When on-chain status was last checked
}

export interface ListingCreate {
  tagCommitment: string;
  tagHash: string;
  modelId: number;
  title: string;
  description: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  imageUrl?: string;
  price: number;
  currency: 'aleo' | 'usdcx';
}

// ========== Atomic Sale System (v5) ==========

export type SaleStatus = 'pending_payment' | 'paid' | 'completing' | 'completed' | 'cancelled' | 'refunded';

export interface Sale {
  id: string;                      // UUID
  saleId: string;                  // Backend tracking ID
  onChainSaleId: string;           // On-chain sale_id field from SaleRecord (passed to buy_sale_*)
  listingId: string;               // Reference to Listing
  sellerAddress: string;           // Seller's Aleo address (needed for complete_sale)
  sellerHash: string;              // SHA-256(seller_address)
  buyerHash?: string;              // SHA-256(buyer_address) — set on purchase
  buyerAddress?: string;           // Buyer's Aleo address — set on purchase, needed for complete_sale
  tagHash: string;                 // Raw tag_hash
  tagCommitment: string;           // BHP256(tag_hash)
  price: number;                   // In microcredits or micro-USDCx
  currency: 'aleo' | 'usdcx';     // Payment type
  status: SaleStatus;
  createSaleTxId: string;          // TX from create_sale
  buySaleTxId?: string;            // TX from buy_sale_escrow/usdcx
  completeSaleTxId?: string;       // TX from complete_sale_escrow/usdcx
  cancelTxId?: string;             // TX from cancel_sale
  refundTxId?: string;             // TX from refund_sale_*
  createdAt: string;               // ISO timestamp
  paidAt?: string;                 // When buyer paid
  completedAt?: string;            // When seller completed
  updatedAt: string;               // Last update
}

export interface ResaleProof {
  token: string;
  tagHash: string;
  ownerAddress: string;
  txId: string;
  createdAt: string;
}

export interface EventLog {
  type: 'mint' | 'transfer' | 'stolen' | 'proof' | 'listing';
  at: string;
  data: Record<string, unknown>;
}

export interface Database {
  brands: Record<string, Brand>;
  artifacts: Record<string, Artifact>;
  listings: Record<string, Listing>;
  sales: Record<string, Sale>;
  proofs: ResaleProof[];
  nonces: Record<string, string>;
  events: EventLog[];
  stolenTags: Record<string, { tagHash: string; reportedAt: string; txId: string; reportedBy: string }>;
}

export interface AuthRequest extends Express.Request {
  userAddress?: string;
}
