export interface Artifact {
  id?: string;
  tagHash: string;
  brandAddress: string;
  modelId: number;
  serialHash: string;
  createdTxId: string;
  mintedAt: string;
  stolen: boolean;
  lastUpdateTxId: string;
  ownerAddress?: string;
  currentOwner?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _raw?: any;
  _fromWallet?: boolean;
  _plaintext?: string;
}

export interface Brand {
  address: string;
  displayName: string;
  createdAt?: string;
}

export interface VerificationResult {
  status: 'authentic' | 'stolen' | 'unknown';
  authentic: boolean;
  stolen: boolean;
  brandAddress?: string;
  modelId?: number;
  mintedAt?: string;
  message: string;
}

export interface User {
  address: string;
  role: 'user' | 'brand';
  brand?: Brand;
  brandName?: string;
  token: string;
}

// ========== Marketplace Listings ==========

export interface Listing {
  id: string;
  tagCommitment: string;
  tagHash: string;
  brandName: string;
  brandAddress: string;
  modelId: number;
  title: string;
  description: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  imageUrl?: string;
  price: number;
  currency: 'aleo' | 'usdcx';
  status: 'active' | 'reserved' | 'sold' | 'delisted';
  createdAt: string;
  updatedAt: string;
  onChainMinted: boolean;
  onChainStolen: boolean;
  lastVerifiedAt: string;
}

export interface ListingsResponse {
  listings: Listing[];
  total: number;
  page: number;
  totalPages: number;
  privacyNotice?: string;
}

export interface ListingFilters {
  brand?: string;
  model?: number;
  currency?: 'aleo' | 'usdcx';
  minPrice?: number;
  maxPrice?: number;
  condition?: string[];
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
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
  brandAddress?: string;
}

export interface ListingVerifyResult {
  minted: boolean;
  stolen: boolean;
  backendRegistered?: boolean;
  verifiedAt: string;
  source: string;
}
