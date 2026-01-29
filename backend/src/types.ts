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
  ownerAddress?: string;
}

export interface ResaleProof {
  token: string;
  tagHash: string;
  ownerAddress: string;
  txId: string;
  createdAt: string;
}

export interface EventLog {
  type: 'mint' | 'transfer' | 'stolen' | 'proof';
  at: string;
  data: Record<string, unknown>;
}

export interface Database {
  brands: Record<string, Brand>;
  artifacts: Record<string, Artifact>;
  proofs: ResaleProof[];
  nonces: Record<string, string>;
  events: EventLog[];
  stolenTags: Record<string, { tagHash: string; reportedAt: string; txId: string; reportedBy: string }>;
}

export interface AuthRequest extends Express.Request {
  userAddress?: string;
}
