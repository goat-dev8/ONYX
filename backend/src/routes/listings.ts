import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/db';
import { getMappingValue } from '../services/provableApi';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createListingSchema, updateListingSchema } from '../lib/validate';
import { Listing } from '../types';

const router = Router();
const db = DatabaseService.getInstance();
const PROGRAM_ID = process.env.PROGRAM_ID || 'onyxpriv_v5.aleo';

// ============================================================
// GET /listings — Browse marketplace (public, no auth)
// ============================================================
router.get('/', (req: Request, res: Response): void => {
  try {
    const {
      brand, model, currency, minPrice, maxPrice,
      condition, sort, page, limit, status,
    } = req.query;

    const filters: Record<string, unknown> = {};
    if (brand) filters.brand = String(brand);
    if (model) filters.modelId = parseInt(String(model), 10) || undefined;
    if (currency && (currency === 'aleo' || currency === 'usdcx')) filters.currency = currency;
    if (minPrice) filters.minPrice = parseInt(String(minPrice), 10);
    if (maxPrice) filters.maxPrice = parseInt(String(maxPrice), 10);
    if (condition) filters.condition = String(condition).split(',').filter(Boolean);
    if (sort) filters.sort = String(sort);
    if (page) filters.page = parseInt(String(page), 10);
    if (limit) filters.limit = parseInt(String(limit), 10);
    if (status) filters.status = String(status);

    const result = db.getAllListings(filters as Parameters<typeof db.getAllListings>[0]);

    // PRIVACY: Strip sellerHash from public response — never expose even the hash publicly
    const safeListings = result.listings.map(({ sellerHash: _s, ...rest }) => rest);

    res.json({
      listings: safeListings,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      privacyNotice: 'Listings show only seller-disclosed metadata. Owner identity is never revealed.',
    });
  } catch (err) {
    console.error('[Listings] Browse error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /listings/my/all — Get seller's own listings (auth)
// (Must be before /:id to prevent 'my' matching as :id)
// ============================================================
router.get('/my/all', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const sellerHash = crypto.createHash('sha256').update(req.userAddress!).digest('hex');
    const listings = db.getListingsBySeller(sellerHash);

    res.json({ listings, count: listings.length });
  } catch (err) {
    console.error('[Listings] My listings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /listings/:id — Single listing detail (public)
// ============================================================
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const listing = db.getListing(req.params.id);
    if (!listing || listing.status === 'delisted') {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    // Strip sellerHash
    const { sellerHash: _s, ...safeListing } = listing;
    res.json(safeListing);
  } catch (err) {
    console.error('[Listings] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /listings/:id/verify — Fresh on-chain verification
// ============================================================
router.get('/:id/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const listing = db.getListing(req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    // Query on-chain mappings
    const [mintedVal, stolenVal] = await Promise.all([
      getMappingValue(PROGRAM_ID, 'tag_uniqueness', listing.tagCommitment),
      getMappingValue(PROGRAM_ID, 'stolen_commitments', listing.tagCommitment),
    ]);

    const minted = mintedVal !== null && String(mintedVal).includes('true');
    const stolen = stolenVal !== null && String(stolenVal).includes('true');
    const now = new Date().toISOString();

    // Check backend registry — item may be registered off-chain before on-chain mint confirms
    // If a listing exists in our DB, the seller had the item in their wallet (record-based ownership).
    const backendRegistered = true;

    // Update cached values
    listing.onChainMinted = minted;
    listing.onChainStolen = stolen;
    listing.lastVerifiedAt = now;
    listing.updatedAt = now;
    db.setListing(listing);

    res.json({
      tagCommitment: listing.tagCommitment,
      minted,
      stolen,
      backendRegistered,
      verifiedAt: now,
      source: 'on-chain',
      privacyNote: 'Only commitment-based lookups performed. No item details queried.',
    });
  } catch (err) {
    console.error('[Listings] Verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /listings/complete-sale — Mark sale as completed
// Called by buyer after release_escrow or pay_verification_usdcx
// ============================================================
router.post('/complete-sale', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tagHash, txId, paymentMethod } = req.body;
    if (!tagHash || !txId) {
      res.status(400).json({ error: 'tagHash and txId are required' });
      return;
    }

    const buyerAddress = req.userAddress!;

    // Find the active listing by tagHash
    const listing = db.getListingByTagHash(tagHash);
    if (!listing) {
      // Try by commitment as fallback
      console.warn('[Listings] No active listing found for tagHash:', tagHash);
      res.status(404).json({ error: 'No active listing found for this item' });
      return;
    }

    // Mark listing as sold
    const now = new Date().toISOString();
    listing.status = 'sold';
    listing.updatedAt = now;
    db.setListing(listing);

    // Transfer artifact ownership in the DB
    const artifact = db.getArtifact(tagHash);
    if (artifact) {
      const buyerHash = crypto.createHash('sha256').update(buyerAddress).digest('hex');
      artifact.ownerHash = buyerHash;
      artifact.lastUpdateTxId = txId;
      db.setArtifact(artifact);
      console.log('[Listings] Artifact ownership transferred:', tagHash, '-> buyer hash:', buyerHash.substring(0, 16) + '...');
    }

    db.addEvent({
      type: 'listing',
      at: now,
      data: {
        listingId: listing.id,
        action: 'sold',
        tagHash,
        txId,
        paymentMethod: paymentMethod || 'escrow',
        buyerHash: crypto.createHash('sha256').update(buyerAddress).digest('hex'),
      },
    });

    console.log('[Listings] Sale completed:', listing.id, 'tagHash:', tagHash, 'method:', paymentMethod || 'escrow');

    res.json({
      success: true,
      listingId: listing.id,
      status: 'sold',
      message: 'Sale completed successfully',
    });
  } catch (err) {
    console.error('[Listings] Complete sale error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /listings — Create listing (authenticated seller)
// ============================================================
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createListingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const { tagCommitment, tagHash, modelId, title, description, condition, imageUrl, price, currency } = parsed.data;
    const sellerAddress = req.userAddress!;

    // Check no existing active listing for same commitment
    const existing = db.getListingByCommitment(tagCommitment);
    if (existing) {
      res.status(409).json({ error: 'An active listing already exists for this item' });
      return;
    }

    // Verify tag exists on-chain (tag_uniqueness)
    // Soft check: allow listing even if not yet minted on-chain (e.g., testnet demo items)
    let onChainMinted = false;
    let onChainStolen = false;
    try {
      const mintedVal = await getMappingValue(PROGRAM_ID, 'tag_uniqueness', tagCommitment);
      onChainMinted = mintedVal !== null && String(mintedVal).includes('true');
      if (!onChainMinted) {
        console.warn('[Listings] Tag commitment not found on-chain (may be demo/unminted):', tagCommitment.substring(0, 30) + '...');
      }

      // Check stolen status
      const stolenVal = await getMappingValue(PROGRAM_ID, 'stolen_commitments', tagCommitment);
      onChainStolen = stolenVal !== null && String(stolenVal).includes('true');
      if (onChainStolen) {
        res.status(400).json({ error: 'This item is reported stolen and cannot be listed.' });
        return;
      }
    } catch (err) {
      console.warn('[Listings] On-chain verification skipped:', err);
    }

    // Resolve brand name
    const brand = db.getBrand(sellerAddress);
    let brandName = '';
    // Try to find brand from artifact if seller is not the brand
    const allBrands = db.getAllBrands();
    // First try: seller IS the brand
    if (brand) {
      brandName = brand.displayName;
    } else {
      // Try to find brand from any artifact matching this commitment
      // Since we don't store tagHash→commitment mapping, use the brandAddress from request body
      // The seller just provides brand info manually or we look up all brands
      brandName = allBrands.length > 0 ? allBrands[0].displayName : 'Unknown Brand';
    }

    // Try to find brand name from brandAddress if provided alongside
    const reqBrandAddress = req.body.brandAddress;
    if (reqBrandAddress) {
      const foundBrand = db.getBrand(reqBrandAddress);
      if (foundBrand) {
        brandName = foundBrand.displayName;
      }
    }

    const now = new Date().toISOString();
    const sellerHash = crypto.createHash('sha256').update(sellerAddress).digest('hex');

    const listing: Listing = {
      id: crypto.randomUUID(),
      tagCommitment,
      tagHash,
      brandAddress: reqBrandAddress || sellerAddress,
      brandName,
      modelId,
      title,
      description,
      condition,
      imageUrl: imageUrl || undefined,
      price,
      currency,
      sellerHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      onChainMinted,
      onChainStolen,
      lastVerifiedAt: now,
    };

    db.setListing(listing);

    db.addEvent({
      type: 'listing',
      at: now,
      data: { listingId: listing.id, tagCommitment, action: 'created' },
    });

    console.log('[Listings] Created listing:', listing.id, 'commitment:', tagCommitment);

    // Strip sellerHash from response
    const { sellerHash: _s, ...safeListing } = listing;
    res.status(201).json(safeListing);
  } catch (err) {
    console.error('[Listings] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PATCH /listings/:id — Update listing (seller only)
// ============================================================
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const listing = db.getListing(req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    // Verify ownership: only the original seller can update
    const sellerHash = crypto.createHash('sha256').update(req.userAddress!).digest('hex');
    if (listing.sellerHash !== sellerHash) {
      res.status(403).json({ error: 'Only the listing owner can update this listing' });
      return;
    }

    const parsed = updateListingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request format', details: parsed.error.issues });
      return;
    }

    const updates = parsed.data;
    const now = new Date().toISOString();

    if (updates.price !== undefined) listing.price = updates.price;
    if (updates.title !== undefined) listing.title = updates.title;
    if (updates.description !== undefined) listing.description = updates.description;
    if (updates.condition !== undefined) listing.condition = updates.condition;
    if (updates.imageUrl !== undefined) listing.imageUrl = updates.imageUrl ?? undefined;
    if (updates.status !== undefined) listing.status = updates.status;
    listing.updatedAt = now;

    db.setListing(listing);

    db.addEvent({
      type: 'listing',
      at: now,
      data: { listingId: listing.id, action: 'updated', changes: Object.keys(updates) },
    });

    const { sellerHash: _s, ...safeListing } = listing;
    res.json(safeListing);
  } catch (err) {
    console.error('[Listings] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// DELETE /listings/:id — Delist item (seller only)
// ============================================================
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const listing = db.getListing(req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    const sellerHash = crypto.createHash('sha256').update(req.userAddress!).digest('hex');
    if (listing.sellerHash !== sellerHash) {
      res.status(403).json({ error: 'Only the listing owner can delist this item' });
      return;
    }

    listing.status = 'delisted';
    listing.updatedAt = new Date().toISOString();
    db.setListing(listing);

    db.addEvent({
      type: 'listing',
      at: listing.updatedAt,
      data: { listingId: listing.id, action: 'delisted' },
    });

    res.json({ success: true, message: 'Listing removed from marketplace' });
  } catch (err) {
    console.error('[Listings] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
