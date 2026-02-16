import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { verifyTransactionAccepted } from '../services/provableApi';
import {
  mintArtifactSchema,
  transferArtifactSchema,
  reportStolenSchema
} from '../lib/validate';

const router = Router();
const db = DatabaseService.getInstance();

router.post('/mint', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = mintArtifactSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const { tagHash, modelId, serialHash, initialOwner, txId } = parsed.data;
    const brandAddress = req.userAddress!;

    const brand = db.getBrand(brandAddress);
    if (!brand) {
      res.status(403).json({ error: 'Only registered brands can mint artifacts' });
      return;
    }

    const existing = db.getArtifact(tagHash);
    if (existing) {
      res.status(400).json({ error: 'Artifact with this tag already exists' });
      return;
    }

    // Verify the transaction was accepted on-chain (skip for Shield wallet pending IDs)
    const isRealTxId = /^at1[a-z0-9]{58}$/i.test(txId);
    if (isRealTxId) {
      const txAccepted = await verifyTransactionAccepted(txId);
      if (!txAccepted) {
        console.warn('[Artifacts] Mint TX not yet confirmed, registering anyway:', txId);
      }
    } else {
      console.log('[Artifacts] Non-at1 txId (Shield wallet pending), registering mint without chain verification:', txId);
    }

    const crypto = await import('crypto');
    const ownerHash = crypto.createHash('sha256').update(initialOwner).digest('hex');

    const artifact = {
      tagHash,
      brandAddress,
      modelId,
      serialHash,
      createdTxId: txId,
      mintedAt: new Date().toISOString(),
      stolen: false,
      lastUpdateTxId: txId,
      ownerHash
    };

    db.setArtifact(artifact);

    db.addEvent({
      type: 'mint',
      at: new Date().toISOString(),
      data: { tagHash, brandAddress, modelId, txId }
    });

    res.json({ success: true, artifact });
  } catch (err) {
    console.error('[Artifacts] Mint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/transfer', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = transferArtifactSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const { tagHash, to, txId } = parsed.data;

    const artifact = db.getArtifact(tagHash);
    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    const txAccepted = await verifyTransactionAccepted(txId);
    if (!txAccepted) {
      res.status(400).json({ error: 'Transaction not found or not accepted on chain' });
      return;
    }

    const crypto = await import('crypto');
    artifact.ownerHash = crypto.createHash('sha256').update(to).digest('hex');
    artifact.lastUpdateTxId = txId;
    db.setArtifact(artifact);

    db.addEvent({
      type: 'transfer',
      at: new Date().toISOString(),
      data: { tagHash, to, txId }
    });

    res.json({ success: true, artifact });
  } catch (err) {
    console.error('[Artifacts] Transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/stolen', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = reportStolenSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const { tagHash, txId, modelId, brandAddress, serialHash } = parsed.data;
    const reportedBy = req.userAddress!;

    // If artifact doesn't exist in DB but metadata was provided, create it
    if (!db.getArtifact(tagHash) && modelId && brandAddress) {
      const crypto = await import('crypto');
      const ownerHash = crypto.createHash('sha256').update(reportedBy).digest('hex');
      db.setArtifact({
        tagHash,
        brandAddress,
        modelId,
        serialHash: serialHash || '',
        createdTxId: txId,
        mintedAt: new Date().toISOString(),
        stolen: true,
        lastUpdateTxId: txId,
        ownerHash
      });
      console.log('[Artifacts] Created artifact from stolen report metadata:', tagHash, 'model:', modelId);
    }

    // Verify the transaction was accepted on-chain (skip for Shield wallet pending IDs)
    const isRealTxId = /^at1[a-z0-9]{58}$/i.test(txId);
    if (isRealTxId) {
      const txAccepted = await verifyTransactionAccepted(txId);
      if (!txAccepted) {
        // Still mark as stolen — on-chain tx may be pending/propagating
        console.warn('[Artifacts] TX not yet confirmed, marking stolen anyway:', txId);
      }
    } else {
      // Shield wallet returns shield_... IDs for pending proofs
      console.log('[Artifacts] Non-at1 txId (Shield wallet pending), marking stolen without chain verification:', txId);
    }

    // Always mark in stolen registry (works even if artifact not in DB)
    db.markTagStolen(tagHash, txId, reportedBy);

    // Also update artifact if it exists in DB
    const artifact = db.getArtifact(tagHash);
    if (artifact) {
      artifact.stolen = true;
      artifact.lastUpdateTxId = txId;
      db.setArtifact(artifact);
    }

    db.addEvent({
      type: 'stolen',
      at: new Date().toISOString(),
      data: { tagHash, txId, reportedBy }
    });

    res.json({ success: true, stolen: true, tagHash });
  } catch (err) {
    console.error('[Artifacts] Stolen error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if a tag is in the stolen registry
// v4: Also supports commitment-based lookups via /stolen/check/commitment/:commitment
router.get('/stolen/check/:tagHash', (req: Request, res: Response): void => {
  try {
    const { tagHash } = req.params;
    const isStolen = db.isTagStolen(tagHash);
    const info = db.getStolenTagInfo(tagHash);
    
    // Also try to get artifact metadata for richer responses
    const artifact = db.getArtifact(tagHash);
    
    res.json({
      stolen: isStolen,
      tagHash,
      ...(info ? { reportedAt: info.reportedAt, txId: info.txId, reportedBy: info.reportedBy } : {}),
      ...(artifact ? { modelId: artifact.modelId, brandAddress: artifact.brandAddress, mintedAt: artifact.mintedAt } : {})
    });
  } catch (err) {
    console.error('[Artifacts] Stolen check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// v4: Check stolen status by BHP256 commitment
// This endpoint allows frontend to check stolen_commitments mapping directly via backend
// when client-side WASM hashing is not available.
router.get('/stolen/check-commitment/:commitment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { commitment } = req.params;
    const programId = process.env.PROGRAM_ID || 'onyxpriv_v4.aleo';
    const { getMappingValue } = await import('../services/provableApi');
    
    const value = await getMappingValue(programId, 'stolen_commitments', commitment);
    const isStolen = value !== null && String(value).includes('true');
    
    res.json({
      stolen: isStolen,
      commitment,
      source: 'on-chain',
    });
  } catch (err) {
    console.error('[Artifacts] Commitment stolen check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// v4: Check tag existence by BHP256 commitment
router.get('/tag/exists/:commitment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { commitment } = req.params;
    const programId = process.env.PROGRAM_ID || 'onyxpriv_v4.aleo';
    const { getMappingValue } = await import('../services/provableApi');
    
    const value = await getMappingValue(programId, 'tag_uniqueness', commitment);
    const exists = value !== null && String(value).includes('true');
    
    res.json({
      exists,
      commitment,
      source: 'on-chain',
    });
  } catch (err) {
    console.error('[Artifacts] Tag existence check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mine', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const ownerAddress = req.userAddress!;
    const artifacts = db.getArtifactsByOwner(ownerAddress);
    res.json({ artifacts, count: artifacts.length });
  } catch (err) {
    console.error('[Artifacts] Mine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:tagHash', (req: Request, res: Response): void => {
  try {
    const { tagHash } = req.params;

    const artifact = db.getArtifact(tagHash);

    if (!artifact) {
      res.json({
        status: 'unknown',
        authentic: false,
        stolen: false,
        message: 'No artifact found with this tag'
      });
      return;
    }

    res.json({
      status: artifact.stolen ? 'stolen' : 'authentic',
      authentic: true,
      stolen: artifact.stolen,
      brandAddress: artifact.brandAddress,
      modelId: artifact.modelId,
      mintedAt: artifact.mintedAt,
      message: artifact.stolen
        ? 'WARNING: This item has been reported stolen'
        : 'This item is authentic and registered'
    });
  } catch (err) {
    console.error('[Artifacts] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// v4: Compute BHP256 commitment for a field value (server-side)
// The frontend WASM may not initialize in all browsers, so this provides
// a reliable server-side fallback using pre-loaded @provablehq/sdk.
router.get('/compute-commitment/:fieldValue', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fieldValue } = req.params;
    if (!fieldValue) {
      res.status(400).json({ error: 'Field value is required' });
      return;
    }

    const { computeBHP256 } = await import('../services/bhp256');
    const commitment = await computeBHP256(fieldValue);

    if (!commitment) {
      res.status(500).json({ error: 'Failed to compute BHP256 commitment' });
      return;
    }

    console.log('[Artifacts] BHP256:', fieldValue, '->', commitment.substring(0, 40) + '...');
    res.json({ commitment, input: fieldValue, source: 'server-side-sdk' });
  } catch (err) {
    console.error('[Artifacts] Compute commitment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
