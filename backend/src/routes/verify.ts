import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/db';
import { verifyTransactionAccepted } from '../services/provableApi';
import { verifyProofSchema } from '../lib/validate';

const router = Router();
const db = DatabaseService.getInstance();

router.post('/proof', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = verifyProofSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const { tagHash, token, txId } = parsed.data;

    const artifact = db.getArtifact(tagHash);
    if (!artifact) {
      res.json({
        valid: false,
        reason: 'Artifact not found'
      });
      return;
    }

    if (artifact.stolen) {
      res.json({
        valid: false,
        reason: 'Cannot verify proof for stolen item'
      });
      return;
    }

    const txAccepted = await verifyTransactionAccepted(txId);
    if (!txAccepted) {
      res.json({
        valid: false,
        reason: 'Proof transaction not found or not accepted'
      });
      return;
    }

    const proof = {
      token,
      tagHash,
      ownerAddress: artifact.ownerHash || '',
      txId,
      createdAt: new Date().toISOString()
    };

    db.addProof(proof);

    db.addEvent({
      type: 'proof',
      at: new Date().toISOString(),
      data: { tagHash, token, txId }
    });

    res.json({
      valid: true,
      artifact: {
        brandAddress: artifact.brandAddress,
        modelId: artifact.modelId,
        mintedAt: artifact.mintedAt,
        stolen: artifact.stolen
      }
    });
  } catch (err) {
    console.error('[Verify] Proof error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/token/:token', (req: Request, res: Response): void => {
  try {
    const { token } = req.params;
    const proof = db.getProofByToken(token);

    if (!proof) {
      res.json({ valid: false, error: 'Proof not found' });
      return;
    }

    const artifact = db.getArtifact(proof.tagHash);

    res.json({
      valid: true,
      artifact: artifact ? {
        tagHash: proof.tagHash,
        brandAddress: artifact.brandAddress,
        modelId: artifact.modelId,
        stolen: artifact.stolen
      } : null
    });
  } catch (err) {
    console.error('[Verify] Token lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
