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

    const txAccepted = await verifyTransactionAccepted(txId);
    if (!txAccepted) {
      res.status(400).json({ error: 'Transaction not found or not accepted on chain' });
      return;
    }

    const artifact = {
      tagHash,
      brandAddress,
      modelId,
      serialHash,
      createdTxId: txId,
      mintedAt: new Date().toISOString(),
      stolen: false,
      lastUpdateTxId: txId,
      ownerAddress: initialOwner
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

    artifact.ownerAddress = to;
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

    const { tagHash, txId } = parsed.data;
    const reportedBy = req.userAddress!;

    // Verify the transaction was accepted on-chain
    const txAccepted = await verifyTransactionAccepted(txId);
    if (!txAccepted) {
      res.status(400).json({ error: 'Transaction not found or not accepted on chain' });
      return;
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
router.get('/stolen/check/:tagHash', (req: Request, res: Response): void => {
  try {
    const { tagHash } = req.params;
    const isStolen = db.isTagStolen(tagHash);
    const info = db.getStolenTagInfo(tagHash);
    
    res.json({
      stolen: isStolen,
      tagHash,
      ...(info ? { reportedAt: info.reportedAt, txId: info.txId } : {})
    });
  } catch (err) {
    console.error('[Artifacts] Stolen check error:', err);
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

export default router;
