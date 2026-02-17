import { FC, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DiamondIcon, ShieldIcon, LoadingSpinner } from '../components/icons/Icons';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { usePendingTxStore } from '../stores/pendingTxStore';
import { api } from '../lib/api';
import type { Listing } from '../lib/types';

type PurchaseStep = 'preview' | 'paying' | 'paid' | 'completed' | 'error';

export const Purchase: FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { connected, authenticate, executeBuySaleEscrow, executeBuySaleUsdcx } = useOnyxWallet();
  const { isAuthenticated } = useUserStore();
  const { addPendingTx } = usePendingTxStore();
  const pendingTxList = usePendingTxStore(s => s.transactions);

  // URL params
  const listingId = searchParams.get('listingId') || '';
  const saleIdFromUrl = searchParams.get('saleId') || '';

  const [listing, setListing] = useState<Listing | null>(null);
  const [saleId, setSaleId] = useState(saleIdFromUrl);
  const [onChainSaleId, setOnChainSaleId] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [step, setStep] = useState<PurchaseStep>('preview');
  const [loading, setLoading] = useState(true);
  const [noSale, setNoSale] = useState(false);
  const [salePending, setSalePending] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [onChainTxId, setOnChainTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch listing and sale status (also look up sale by listing if no saleId)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setNoSale(false);
    setSalePending(false);
    try {
      // Fetch listing
      const listingData = listingId ? await api.getListing(listingId).catch(() => null) : null;
      if (listingData) setListing(listingData);

      // Resolve saleId: use URL param or look up by listing
      let resolvedSaleId = saleIdFromUrl;
      if (!resolvedSaleId && listingId) {
        try {
          const saleLookup = await api.getSaleByListing(listingId);
          if (saleLookup.found && saleLookup.sale) {
            resolvedSaleId = saleLookup.sale.saleId;
            setSaleId(resolvedSaleId);
            // Get seller address from sale lookup (needed for buy_sale_escrow)
            if (saleLookup.sale.sellerAddress) setSellerAddress(saleLookup.sale.sellerAddress);
            if (saleLookup.sale.onChainSaleId) {
              if (saleLookup.sale.onChainSaleId.startsWith('pending_')) {
                // Sale exists but on-chain sale_id not yet confirmed
                setSalePending(true);
              } else {
                setOnChainSaleId(saleLookup.sale.onChainSaleId);
              }
            }
          } else {
            setNoSale(true);
          }
        } catch {
          setNoSale(true);
        }
      }

      // Fetch sale status if we have a saleId
      if (resolvedSaleId) {
        const statusData = await api.getSaleStatus(resolvedSaleId).catch(() => null);
        if (statusData) {
          if (statusData.status === 'paid') setStep('paid');
          else if (statusData.status === 'completed') setStep('completed');
        }
      }
    } catch (err) {
      console.error('[Purchase] Failed to load data:', err);
      setError('Failed to load listing data');
    } finally {
      setLoading(false);
    }
  }, [listingId, saleIdFromUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh when sale is pending — poll every 10s until onChainSaleId is set
  useEffect(() => {
    if (!salePending) return;
    const interval = setInterval(async () => {
      try {
        const saleLookup = await api.getSaleByListing(listingId);
        if (saleLookup.found && saleLookup.sale?.onChainSaleId && !saleLookup.sale.onChainSaleId.startsWith('pending_')) {
          setOnChainSaleId(saleLookup.sale.onChainSaleId);
          if (saleLookup.sale.sellerAddress) setSellerAddress(saleLookup.sale.sellerAddress);
          setSalePending(false);
        }
      } catch { /* retry silently */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [salePending, listingId]);

  // Resolve real on-chain txId from pending TX store (Shield wallet returns shield_... IDs)
  useEffect(() => {
    if (!txId) return;
    // If already a real txId, use it directly
    if (txId.startsWith('at1')) {
      setOnChainTxId(txId);
      return;
    }
    // Watch pending TX store for the real on-chain txId
    const tx = pendingTxList.find(t => t.id === txId);
    if (tx?.meta?.onChainTxId && typeof tx.meta.onChainTxId === 'string') {
      setOnChainTxId(tx.meta.onChainTxId as string);
    }
  }, [txId, pendingTxList]);

  // Auth check
  const ensureAuth = useCallback(async (): Promise<boolean> => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return false;
    }
    if (!isAuthenticated) {
      return await authenticate();
    }
    return true;
  }, [connected, isAuthenticated, authenticate]);

  // ─── Buy with ALEO credits (escrow) ───
  const handleBuyEscrow = async () => {
    if (!(await ensureAuth())) return;
    if (!listing || !saleId || !onChainSaleId || !sellerAddress) {
      toast.error('Missing sale information');
      return;
    }

    setStep('paying');
    setError(null);

    try {
      const result = await executeBuySaleEscrow(
        listing.tagHash,
        listing.price,
        sellerAddress,
        onChainSaleId  // Use on-chain sale_id from SaleRecord
      );

      if (!result) {
        setStep('preview');
        return;
      }

      setTxId(result);
      addPendingTx({
        id: result,
        type: 'buy_sale_escrow',
        meta: { listingId, saleId: saleId, amount: String(listing.price) },
      });

      // Register payment with backend
      try {
        await api.purchaseSale({ saleId: saleId, buySaleTxId: result });
      } catch (err) {
        console.warn('[Purchase] Backend registration failed:', err);
      }

      setStep('paid');
      toast.success('Payment deposited! Seller will deliver your item.');
    } catch (err) {
      console.error('[Purchase] Buy escrow error:', err);
      setError(err instanceof Error ? err.message : 'Purchase failed');
      setStep('error');
    }
  };

  // ─── Buy with USDCx ───
  const handleBuyUsdcx = async () => {
    if (!(await ensureAuth())) return;
    if (!listing || !saleId || !onChainSaleId || !sellerAddress) {
      toast.error('Missing sale information');
      return;
    }

    setStep('paying');
    setError(null);

    try {
      const result = await executeBuySaleUsdcx(
        sellerAddress,
        BigInt(listing.price),
        listing.tagHash,
        onChainSaleId  // Use on-chain sale_id from SaleRecord
      );

      if (!result) {
        setStep('preview');
        return;
      }

      setTxId(result);
      addPendingTx({
        id: result,
        type: 'buy_sale_usdcx',
        meta: { listingId, saleId: saleId, amount: String(listing.price) },
      });

      try {
        await api.purchaseSale({ saleId: saleId, buySaleTxId: result });
      } catch (err) {
        console.warn('[Purchase] Backend registration failed:', err);
      }

      setStep('paid');
      toast.success('USDCx payment complete! Seller will deliver your item.');
    } catch (err) {
      console.error('[Purchase] Buy USDCx error:', err);
      setError(err instanceof Error ? err.message : 'USDCx purchase failed');
      setStep('error');
    }
  };

  // Format price
  const formatPrice = (price: number, currency: string) => {
    if (currency === 'aleo') {
      return `${(price / 1_000_000).toFixed(2)} ALEO`;
    }
    return `${(price / 1_000_000).toFixed(2)} USDCx`;
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size={48} className="text-champagne-400" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="font-heading text-2xl font-bold text-white/80">Listing Not Found</h2>
        <p className="mt-2 text-sm text-white/40">This listing may no longer be available.</p>
        <button onClick={() => navigate('/marketplace')} className="mt-6 rounded-lg bg-champagne-500/20 px-6 py-2 text-sm font-medium text-champagne-300 hover:bg-champagne-500/30 transition-colors">
          Back to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <DiamondIcon size={28} className="text-champagne-400" />
          <h1 className="font-heading text-2xl font-bold gold-gradient-text sm:text-3xl">Purchase</h1>
        </div>
        <p className="text-sm text-white/40">Secure atomic purchase with zero-knowledge privacy</p>
      </motion.div>

      {/* Item Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold text-white/90">{listing.title}</h2>
            <p className="text-xs text-white/40">{listing.brandName} · Model {listing.modelId}</p>
          </div>
          <div className="text-right">
            <div className="font-heading text-xl font-bold text-champagne-300">
              {formatPrice(listing.price, listing.currency)}
            </div>
            <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              listing.currency === 'aleo' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
            }`}>
              {listing.currency}
            </span>
          </div>
        </div>

        <p className="text-sm text-white/50 leading-relaxed">{listing.description}</p>

        <div className="flex items-center gap-4 text-xs text-white/30">
          <span>Condition: <span className="text-white/50 capitalize">{listing.condition.replace('_', ' ')}</span></span>
          {listing.onChainMinted && (
            <span className="flex items-center gap-1 text-emerald-400/70">
              <ShieldIcon size={12} /> On-chain verified
            </span>
          )}
        </div>
      </motion.div>

      {/* Privacy Notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldIcon size={18} className="mt-0.5 flex-shrink-0 text-emerald-500/60" />
          <div className="text-xs leading-relaxed text-white/40">
            <span className="font-semibold text-emerald-400/70">Atomic Purchase</span>{' — '}
            Your payment is locked on-chain. The seller must deliver the artifact to receive credits.
            If the seller doesn&apos;t complete within ~1000 blocks, you can reclaim your payment.
            No middleman. No trust required.
          </div>
        </div>
      </motion.div>

      {/* Action Area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      >
        {step === 'preview' && (
          <div className="space-y-4">
            <h3 className="font-heading text-sm font-semibold text-white/70 uppercase tracking-wider">Choose Payment Method</h3>

            {!connected ? (
              <p className="text-sm text-amber-400/70">Please connect your wallet to purchase.</p>
            ) : noSale ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center space-y-2">
                <p className="text-sm text-amber-400/80">Sale not yet available</p>
                <p className="text-xs text-white/40">The seller hasn&apos;t created an on-chain sale for this item yet. Check back later.</p>
                <button onClick={() => navigate('/marketplace')} className="mt-2 rounded-lg bg-white/10 px-4 py-1.5 text-xs text-white/60 hover:bg-white/20 transition-colors">
                  Back to Marketplace
                </button>
              </div>
            ) : salePending ? (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center space-y-2">
                <LoadingSpinner size={24} className="mx-auto text-blue-400" />
                <p className="text-sm text-blue-400/80">Sale confirming on-chain...</p>
                <p className="text-xs text-white/40">The seller&apos;s transaction is being confirmed. This page will auto-refresh when ready.</p>
              </div>
            ) : !saleId || !onChainSaleId || !sellerAddress ? (
              <p className="text-sm text-amber-400/70">Invalid sale link. Please go back to the marketplace.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ALEO Credits */}
                <button
                  onClick={handleBuyEscrow}
                  disabled={listing.currency !== 'aleo'}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    listing.currency === 'aleo'
                      ? 'border-blue-500/30 bg-blue-500/[0.06] hover:bg-blue-500/[0.12] hover:border-blue-500/50'
                      : 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="font-heading text-sm font-semibold text-blue-300">Pay with ALEO</div>
                  <p className="mt-1 text-xs text-white/40">Private credits escrow</p>
                  <div className="mt-2 font-mono text-lg font-bold text-white/80">
                    {formatPrice(listing.price, 'aleo')}
                  </div>
                </button>

                {/* USDCx */}
                <button
                  onClick={handleBuyUsdcx}
                  disabled={listing.currency !== 'usdcx'}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    listing.currency === 'usdcx'
                      ? 'border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] hover:border-emerald-500/50'
                      : 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="font-heading text-sm font-semibold text-emerald-300">Pay with USDCx</div>
                  <p className="mt-1 text-xs text-white/40">Stablecoin payment</p>
                  <div className="mt-2 font-mono text-lg font-bold text-white/80">
                    {formatPrice(listing.price, 'usdcx')}
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'paying' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <LoadingSpinner size={36} className="text-champagne-400" />
            <p className="text-sm text-white/60">Processing payment on-chain...</p>
            <p className="text-xs text-white/30">This may take a minute. Please don&apos;t close this page.</p>
          </div>
        )}

        {step === 'paid' && (
          <div className="space-y-4 text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
              <ShieldIcon size={28} className="text-emerald-400" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-emerald-300">Payment Deposited!</h3>
            <p className="text-sm text-white/50">
              Your payment is securely locked on-chain. The seller will now deliver your artifact.
              If not completed within ~1000 blocks, you can reclaim your payment.
            </p>
            {onChainTxId ? (
              <a
                href={`https://testnet.aleoscan.io/transaction?id=${onChainTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400/60 font-mono break-all hover:text-emerald-400/90 transition-colors"
              >
                TX: {onChainTxId}
              </a>
            ) : txId ? (
              <div className="flex items-center justify-center gap-2">
                <LoadingSpinner size={14} className="text-white/30" />
                <span className="text-xs text-white/30">Confirming transaction...</span>
              </div>
            ) : null}
            <button
              onClick={() => navigate('/marketplace')}
              className="mt-4 rounded-lg bg-champagne-500/20 px-6 py-2 text-sm font-medium text-champagne-300 hover:bg-champagne-500/30 transition-colors"
            >
              Back to Marketplace
            </button>
          </div>
        )}

        {step === 'completed' && (
          <div className="space-y-4 text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full border border-champagne-500/30 bg-champagne-500/10">
              <DiamondIcon size={28} className="text-champagne-400" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-champagne-300">Purchase Complete!</h3>
            <p className="text-sm text-white/50">
              The artifact has been delivered to your wallet. You now own this authenticated item.
            </p>
            <button
              onClick={() => navigate('/vault')}
              className="mt-4 rounded-lg bg-champagne-500/20 px-6 py-2 text-sm font-medium text-champagne-300 hover:bg-champagne-500/30 transition-colors"
            >
              View in Vault
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4 text-center">
            <h3 className="font-heading text-lg font-semibold text-red-400">Payment Failed</h3>
            <p className="text-sm text-white/50">{error || 'An unknown error occurred.'}</p>
            <button
              onClick={() => { setStep('preview'); setError(null); }}
              className="mt-4 rounded-lg bg-white/10 px-6 py-2 text-sm font-medium text-white/70 hover:bg-white/20 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
