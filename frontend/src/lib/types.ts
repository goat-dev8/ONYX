export interface Artifact {
  tagHash: string;
  brandAddress: string;
  modelId: number;
  serialHash: string;
  createdTxId: string;
  mintedAt: string;
  stolen: boolean;
  lastUpdateTxId: string;
  ownerAddress?: string;
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
