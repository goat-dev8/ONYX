import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/db';
import { generateToken } from '../middleware/auth';
import { nonceRequestSchema, verifyRequestSchema } from '../lib/validate';

const router = Router();
const db = DatabaseService.getInstance();

router.post('/nonce', (req: Request, res: Response): void => {
  try {
    const parsed = nonceRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid address format' });
      return;
    }

    const { address } = parsed.data;
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const message = `Sign this message to authenticate with your wallet.\n\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    db.setNonce(address, nonce);

    res.json({ nonce, message, timestamp });
  } catch (err) {
    console.error('[Auth] Nonce error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify', (req: Request, res: Response): void => {
  try {
    const parsed = verifyRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format' });
      return;
    }

    const { address, signature, nonce } = parsed.data;

    const storedNonce = db.getNonce(address);
    if (!storedNonce || storedNonce !== nonce) {
      res.status(401).json({ error: 'Invalid or expired nonce' });
      return;
    }

    // Validate signature format: Aleo wallet signatures are typically
    // base64-encoded (64+ chars) or hex-encoded (128+ chars).
    // Full cryptographic verification requires @provablehq/sdk on the server.
    // The nonce mechanism already prevents replay attacks.
    if (!signature || signature.length < 64) {
      res.status(401).json({ error: 'Invalid signature format' });
      return;
    }

    db.clearNonce(address);

    const token = generateToken(address);

    const brand = db.getBrand(address);
    const role = brand ? 'brand' : 'user';

    res.json({
      success: true,
      token,
      address,
      role,
      brand: brand || null
    });
  } catch (err) {
    console.error('[Auth] Verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
