import { Router, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/db';
import { getMappingValue, verifyTransactionAccepted } from '../services/provableApi';
import { computeBHP256 } from '../services/bhp256';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  createSaleSchema,
  purchaseSaleSchema,
  completeSaleSchema,
  cancelSaleSchema,
  refundSaleSchema,
} from '../lib/validate';
import { Sale } from '../types';

const router = Router();
const db = DatabaseService.getInstance();
const PROGRAM_ID = process.env.PROGRAM_ID || 'onyxpriv_v7.aleo';

// ============================================================
// POST /sales/create — Register a new on-chain sale
// Called AFTER seller executes create_sale on-chain
// ============================================================
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[Sales] Validation failed:', JSON.stringify(parsed.error.issues));
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { listingId, saleId, createSaleTxId } = parsed.data;
    const sellerAddress = req.userAddress!;
    const sellerHash = crypto.createHash('sha256').update(sellerAddress).digest('hex');
    console.log('[Sales] Create request:', { listingId, saleId, sellerAddress: sellerAddress.slice(0, 20) });

    // Verify listing exists and belongs to seller
    const listing = db.getListing(listingId);
    if (!listing) {
      console.error('[Sales] Listing not found:', listingId);
      res.status(404).json({ error: 'Listing not found' });
      return;
    }
    if (listing.sellerHash !== sellerHash) {
      console.error('[Sales] Seller mismatch:', { listingSellerHash: listing.sellerHash.slice(0, 12), requestSellerHash: sellerHash.slice(0, 12) });
      res.status(403).json({ error: 'Only the listing owner can create a sale' });
      return;
    }
    if (listing.status !== 'active' && listing.status !== 'reserved') {
      console.error('[Sales] Listing status not active:', listing.status);
      res.status(400).json({ error: `Listing is ${listing.status}, cannot create sale` });
      return;
    }

    // Check no existing active sale for this listing
    const existingSale = db.getSaleByListingId(listingId);
    if (existingSale) {
      res.status(409).json({ error: 'An active sale already exists for this listing' });
      return;
    }

    const now = new Date().toISOString();

    const sale: Sale = {
      id: crypto.randomUUID(),
      saleId,
      listingId,
      sellerAddress,
      sellerHash,
      tagHash: listing.tagHash,
      tagCommitment: listing.tagCommitment,
      price: listing.price,
      currency: listing.currency,
      status: 'pending_payment',
      createSaleTxId,
      createdAt: now,
      updatedAt: now,
    };

    db.setSale(sale);

    // Update listing status to reserved
    listing.status = 'reserved';
    listing.updatedAt = now;
    db.setListing(listing);

    db.addEvent({
      type: 'listing',
      at: now,
      data: { saleId: sale.id, listingId, action: 'sale_created', txId: createSaleTxId },
    });

    console.log('[Sales] Created sale:', sale.id, 'listing:', listingId, 'saleId:', saleId);

    res.status(201).json({
      success: true,
      sale: {
        id: sale.id,
        saleId: sale.saleId,
        listingId: sale.listingId,
        status: sale.status,
        price: sale.price,
        currency: sale.currency,
        tagHash: sale.tagHash,
        tagCommitment: sale.tagCommitment,
        createdAt: sale.createdAt,
      },
    });
  } catch (err) {
    console.error('[Sales] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /sales/purchase — Record buyer's payment
// Called AFTER buyer executes buy_sale_escrow/usdcx on-chain
// ============================================================
router.post('/purchase', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = purchaseSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { saleId, buySaleTxId } = parsed.data;
    const buyerAddress = req.userAddress!;
    const buyerHash = crypto.createHash('sha256').update(buyerAddress).digest('hex');

    // Find the sale by on-chain saleId
    const sale = db.getSaleBySaleId(saleId);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    if (sale.status !== 'pending_payment') {
      res.status(400).json({ error: `Sale is ${sale.status}, cannot purchase` });
      return;
    }

    // Buyer must not be the seller
    if (sale.sellerHash === buyerHash) {
      res.status(400).json({ error: 'Seller cannot buy their own item' });
      return;
    }

    const now = new Date().toISOString();

    sale.status = 'paid';
    sale.buyerHash = buyerHash;
    sale.buyerAddress = buyerAddress;
    sale.buySaleTxId = buySaleTxId;
    sale.paidAt = now;
    sale.updatedAt = now;
    db.setSale(sale);

    db.addEvent({
      type: 'listing',
      at: now,
      data: { saleId: sale.id, action: 'sale_paid', txId: buySaleTxId, buyerHash },
    });

    console.log('[Sales] Purchase recorded:', sale.id, 'buyer:', buyerHash.substring(0, 16) + '...');

    res.json({
      success: true,
      sale: {
        id: sale.id,
        saleId: sale.saleId,
        status: sale.status,
        paidAt: sale.paidAt,
      },
    });
  } catch (err) {
    console.error('[Sales] Purchase error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /sales/complete — Seller completes the sale (atomic delivery)
// Called AFTER seller executes complete_sale_escrow/usdcx on-chain
// ============================================================
router.post('/complete', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = completeSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { saleId, completeSaleTxId, buyerAddress: buyerAddressParam } = parsed.data;
    const sellerAddress = req.userAddress!;
    const sellerHash = crypto.createHash('sha256').update(sellerAddress).digest('hex');

    const sale = db.getSaleBySaleId(saleId);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    if (sale.sellerHash !== sellerHash) {
      res.status(403).json({ error: 'Only the seller can complete a sale' });
      return;
    }

    if (sale.status !== 'paid') {
      res.status(400).json({ error: `Sale is ${sale.status}, must be paid to complete` });
      return;
    }

    const now = new Date().toISOString();

    sale.status = 'completed';
    sale.completeSaleTxId = completeSaleTxId;
    sale.completedAt = now;
    sale.updatedAt = now;
    db.setSale(sale);

    // Update listing to sold
    const listing = db.getListing(sale.listingId);
    if (listing) {
      listing.status = 'sold';
      listing.updatedAt = now;
      db.setListing(listing);
    }

    // Transfer artifact ownership in DB
    const resolvedBuyerAddress = buyerAddressParam || sale.buyerAddress;
    const artifact = db.getArtifact(sale.tagHash);
    if (artifact && resolvedBuyerAddress) {
      const buyerHash = crypto.createHash('sha256').update(resolvedBuyerAddress).digest('hex');
      artifact.ownerHash = buyerHash;
      artifact.lastUpdateTxId = completeSaleTxId;
      db.setArtifact(artifact);
    }

    db.addEvent({
      type: 'listing',
      at: now,
      data: { saleId: sale.id, action: 'sale_completed', txId: completeSaleTxId },
    });

    console.log('[Sales] Sale completed:', sale.id, 'tx:', completeSaleTxId);

    res.json({
      success: true,
      sale: {
        id: sale.id,
        saleId: sale.saleId,
        status: sale.status,
        completedAt: sale.completedAt,
      },
    });
  } catch (err) {
    console.error('[Sales] Complete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /sales/cancel — Seller cancels sale (before payment)
// Called AFTER seller executes cancel_sale on-chain
// ============================================================
router.post('/cancel', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = cancelSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { saleId, cancelTxId } = parsed.data;
    const sellerAddress = req.userAddress!;
    const sellerHash = crypto.createHash('sha256').update(sellerAddress).digest('hex');

    const sale = db.getSaleBySaleId(saleId);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    if (sale.sellerHash !== sellerHash) {
      res.status(403).json({ error: 'Only the seller can cancel a sale' });
      return;
    }

    if (sale.status !== 'pending_payment') {
      res.status(400).json({ error: `Sale is ${sale.status}, can only cancel before payment` });
      return;
    }

    const now = new Date().toISOString();

    sale.status = 'cancelled';
    sale.cancelTxId = cancelTxId;
    sale.updatedAt = now;
    db.setSale(sale);

    // Delist the listing (cancel = remove from marketplace)
    const listing = db.getListing(sale.listingId);
    if (listing) {
      listing.status = 'delisted';
      listing.updatedAt = now;
      db.setListing(listing);
    }

    db.addEvent({
      type: 'listing',
      at: now,
      data: { saleId: sale.id, action: 'sale_cancelled', txId: cancelTxId },
    });

    console.log('[Sales] Sale cancelled:', sale.id);

    res.json({ success: true, sale: { id: sale.id, saleId: sale.saleId, status: 'cancelled' } });
  } catch (err) {
    console.error('[Sales] Cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /sales/refund — Buyer refunds after timeout
// Called AFTER buyer executes refund_sale_escrow/usdcx on-chain
// ============================================================
router.post('/refund', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = refundSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { saleId, refundTxId } = parsed.data;
    const buyerAddress = req.userAddress!;
    const buyerHash = crypto.createHash('sha256').update(buyerAddress).digest('hex');

    const sale = db.getSaleBySaleId(saleId);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    if (sale.buyerHash !== buyerHash) {
      res.status(403).json({ error: 'Only the buyer can refund' });
      return;
    }

    if (sale.status !== 'paid') {
      res.status(400).json({ error: `Sale is ${sale.status}, can only refund paid sales` });
      return;
    }

    const now = new Date().toISOString();

    sale.status = 'refunded';
    sale.refundTxId = refundTxId;
    sale.updatedAt = now;
    db.setSale(sale);

    // Re-activate listing (seller can cancel_sale after buyer refunds)
    const listing = db.getListing(sale.listingId);
    if (listing) {
      listing.status = 'active';
      listing.updatedAt = now;
      db.setListing(listing);
    }

    db.addEvent({
      type: 'listing',
      at: now,
      data: { saleId: sale.id, action: 'sale_refunded', txId: refundTxId, buyerHash },
    });

    console.log('[Sales] Sale refunded:', sale.id, 'by buyer:', buyerHash.substring(0, 16) + '...');

    res.json({ success: true, sale: { id: sale.id, saleId: sale.saleId, status: 'refunded' } });
  } catch (err) {
    console.error('[Sales] Refund error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /sales/pending-completions — Seller's paid sales awaiting completion
// (Must be before /:saleId/status to avoid wildcard match)
// ============================================================
router.get('/pending-completions', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const sellerHash = crypto.createHash('sha256').update(req.userAddress!).digest('hex');
    const pendingSales = db.getPendingCompletions(sellerHash);

    // Enrich with listing data
    const enriched = pendingSales.map(sale => {
      const listing = db.getListing(sale.listingId);
      return {
        id: sale.id,
        saleId: sale.saleId,
        listingId: sale.listingId,
        title: listing?.title || 'Unknown Item',
        tagHash: sale.tagHash,
        price: sale.price,
        currency: sale.currency,
        status: sale.status,
        paidAt: sale.paidAt,
        createdAt: sale.createdAt,
      };
    });

    res.json({ sales: enriched, count: enriched.length });
  } catch (err) {
    console.error('[Sales] Pending completions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /sales/my/all — Seller's all sales (auth)
// ============================================================
router.get('/my/all', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const sellerHash = crypto.createHash('sha256').update(req.userAddress!).digest('hex');
    const sales = db.getSalesBySeller(sellerHash);

    const enriched = sales.map(sale => {
      const listing = db.getListing(sale.listingId);
      return {
        id: sale.id,
        saleId: sale.saleId,
        listingId: sale.listingId,
        title: listing?.title || 'Unknown Item',
        tagHash: sale.tagHash,
        price: sale.price,
        currency: sale.currency,
        status: sale.status,
        hasBuyer: !!sale.buyerHash,
        buyerAddress: sale.buyerAddress,
        paidAt: sale.paidAt,
        completedAt: sale.completedAt,
        createdAt: sale.createdAt,
      };
    });

    res.json({ sales: enriched, count: enriched.length });
  } catch (err) {
    console.error('[Sales] My sales error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /sales/by-listing/:listingId — Public lookup of sale for a listing
// ============================================================
router.get('/by-listing/:listingId', async (req, res): Promise<void> => {
  try {
    const { listingId } = req.params;
    const sale = db.getSaleByListingId(listingId);

    if (!sale || ['cancelled', 'refunded'].includes(sale.status)) {
      res.json({ found: false, sale: null });
      return;
    }

    res.json({
      found: true,
      sale: {
        saleId: sale.saleId,
        listingId: sale.listingId,
        sellerAddress: sale.sellerAddress,
        price: sale.price,
        currency: sale.currency,
        status: sale.status,
        tagHash: sale.tagHash,
        tagCommitment: sale.tagCommitment,
        createSaleTxId: sale.createSaleTxId,
        createdAt: sale.createdAt,
      },
    });
  } catch (err) {
    console.error('[Sales] By-listing lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /sales/check-on-chain/:listingId — Verify sale is active on-chain
// Uses tag_commitment (BHP256(tag_hash)) as the mapping key
// ============================================================
router.get('/check-on-chain/:listingId', async (req, res): Promise<void> => {
  try {
    const { listingId } = req.params;
    const sale = db.getSaleByListingId(listingId);

    if (!sale || ['cancelled', 'refunded'].includes(sale.status)) {
      res.json({ active: false, reason: 'no_sale' });
      return;
    }

    // Strategy 1: Direct mapping check using tag_commitment
    // tag_commitment = BHP256(tag_hash) — already stored on the sale record
    if (sale.tagCommitment) {
      try {
        const commitmentKey = sale.tagCommitment.endsWith('field')
          ? sale.tagCommitment : `${sale.tagCommitment}field`;
        const activeVal = await getMappingValue(PROGRAM_ID, 'sale_active', commitmentKey);
        if (activeVal !== null && String(activeVal).includes('true')) {
          console.log('[Sales] Verified via mapping for listing', listingId);
          res.json({ active: true, tagCommitment: sale.tagCommitment, verified: 'mapping' });
          return;
        }
      } catch (err) {
        console.warn('[Sales] Mapping check failed:', err);
      }
    }

    // Strategy 2: Verify createSaleTxId on Aleo explorer
    if (sale.createSaleTxId && sale.createSaleTxId.startsWith('at1')) {
      try {
        const txAccepted = await verifyTransactionAccepted(sale.createSaleTxId);
        if (txAccepted) {
          console.log('[Sales] Verified via tx for listing', listingId, ':', sale.createSaleTxId.slice(0, 20));
          res.json({ active: true, tagCommitment: sale.tagCommitment, verified: 'tx' });
          return;
        }
      } catch (err) {
        console.warn('[Sales] TX verification failed:', err);
      }
    }

    // Strategy 3: Time-based heuristic
    const saleAge = Date.now() - new Date(sale.createdAt).getTime();
    const FINALIZE_WINDOW = 90_000; // 90 seconds for Aleo block finality
    if (saleAge > FINALIZE_WINDOW) {
      console.log('[Sales] Timing heuristic: sale', listingId, 'is', Math.round(saleAge / 1000), 's old, assuming active');
      res.json({ active: true, tagCommitment: sale.tagCommitment, verified: 'timing' });
      return;
    }

    res.json({ active: false, tagCommitment: sale.tagCommitment, reason: 'not_verified' });
  } catch (err) {
    console.error('[Sales] Check on-chain error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /sales/:saleId/status — Check sale status (public)
// (Must be AFTER specific routes like /pending-completions, /my/all, /by-listing)
// ============================================================
router.get('/:saleId/status', async (req, res): Promise<void> => {
  try {
    const sale = db.getSaleBySaleId(req.params.saleId);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    // Verify on-chain state using tag_commitment
    let onChainActive = false;
    let onChainPaid = false;
    try {
      if (sale.tagCommitment) {
        const commitmentKey = sale.tagCommitment.endsWith('field')
          ? sale.tagCommitment : `${sale.tagCommitment}field`;
        const [activeVal, paidVal] = await Promise.all([
          getMappingValue(PROGRAM_ID, 'sale_active', commitmentKey),
          getMappingValue(PROGRAM_ID, 'sale_paid', commitmentKey),
        ]);
        onChainActive = activeVal !== null && String(activeVal).includes('true');
        onChainPaid = paidVal !== null && String(paidVal).includes('true');
      }
    } catch {
      // On-chain check is optional
    }

    res.json({
      saleId: sale.saleId,
      status: sale.status,
      price: sale.price,
      currency: sale.currency,
      hasBuyer: !!sale.buyerHash,
      createdAt: sale.createdAt,
      paidAt: sale.paidAt,
      completedAt: sale.completedAt,
      onChain: { active: onChainActive, paid: onChainPaid },
    });
  } catch (err) {
    console.error('[Sales] Status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
