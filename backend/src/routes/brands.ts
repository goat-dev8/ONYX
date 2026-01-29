import { Router, Response } from 'express';
import { DatabaseService } from '../services/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { brandRegisterSchema } from '../lib/validate';

const router = Router();
const db = DatabaseService.getInstance();

router.post('/register', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const parsed = brandRegisterSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format' });
      return;
    }

    const { displayName } = parsed.data;
    const address = req.userAddress!;

    const existing = db.getBrand(address);
    if (existing) {
      res.status(400).json({ error: 'Brand already registered' });
      return;
    }

    const brand = {
      address,
      displayName,
      createdAt: new Date().toISOString()
    };

    db.setBrand(brand);

    db.addEvent({
      type: 'mint',
      at: new Date().toISOString(),
      data: { action: 'brand_registered', address, displayName }
    });

    res.json({ success: true, brand });
  } catch (err) {
    console.error('[Brands] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const address = req.userAddress!;
    const brand = db.getBrand(address);

    if (!brand) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }

    const artifacts = db.getArtifactsByBrand(address);

    res.json({
      brand,
      stats: {
        totalArtifacts: artifacts.length,
        stolenCount: artifacts.filter(a => a.stolen).length
      }
    });
  } catch (err) {
    console.error('[Brands] Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', (_req, res: Response): void => {
  try {
    const brands = db.getAllBrands();
    res.json({ brands });
  } catch (err) {
    console.error('[Brands] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
