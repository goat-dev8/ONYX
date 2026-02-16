import { z } from 'zod';

export const addressSchema = z.string().regex(
  /^aleo1[a-z0-9]{58}$/,
  'Invalid Aleo address format'
);

export const fieldSchema = z.string().regex(
  /^[0-9]+field$/,
  'Invalid field format (should be like 12345field)'
);

export const txIdSchema = z.string().regex(
  /^at1[a-z0-9]{58}$/i,
  'Invalid transaction ID format'
);

export const nonceRequestSchema = z.object({
  address: addressSchema
});

export const verifyRequestSchema = z.object({
  address: addressSchema,
  signature: z.string().min(1),
  nonce: z.string().min(1)
});

export const brandRegisterSchema = z.object({
  displayName: z.string().min(1).max(100)
});

export const mintArtifactSchema = z.object({
  tagHash: z.string().min(1),
  modelId: z.number().int().positive(),
  serialHash: z.string().min(1),
  initialOwner: addressSchema,
  txId: z.string().min(1) // Accept any non-empty txId (Shield wallet returns shield_... IDs)
});

export const transferArtifactSchema = z.object({
  tagHash: z.string().min(1),
  to: addressSchema,
  txId: txIdSchema
});

export const reportStolenSchema = z.object({
  tagHash: z.string().min(1),
  txId: z.string().min(1), // Accept any non-empty txId (Shield wallet returns shield_... IDs, not at1...)
  // Optional artifact metadata — allows stolen report to also register the artifact if not already in DB
  modelId: z.number().int().positive().optional(),
  brandAddress: addressSchema.optional(),
  serialHash: z.string().min(1).optional(),
});

export const verifyProofSchema = z.object({
  tagHash: z.string().min(1),
  token: z.string().min(1),
  txId: txIdSchema
});

// ========== Marketplace Listings ==========

export const createListingSchema = z.object({
  tagCommitment: z.string().min(1).regex(/^[0-9]+field$/, 'Must be a valid field element (e.g. 12345field)'),
  tagHash: z.string().min(1),
  modelId: z.number().int().positive(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  imageUrl: z.string().url().optional(),
  price: z.number().int().positive(),
  currency: z.enum(['aleo', 'usdcx']),
});

export const updateListingSchema = z.object({
  price: z.number().int().positive().optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(2000).optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.enum(['active', 'delisted']).optional(),
});
