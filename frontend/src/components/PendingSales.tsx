import { FC, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { DiamondIcon, LoadingSpinner } from './icons/Icons';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { usePendingTxStore } from '../stores/pendingTxStore';
import { api } from '../lib/api';
import type { Sale } from '../lib/types';
import type { PendingTxType } from '../stores/pendingTxStore';

const statusBadge: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Awaiting Payment', color: 'bg-amber-500/15 text-amber-400' },
  paid: { label: 'Paid — Deliver', color: 'bg-emerald-500/15 text-emerald-400' },
  completing: { label: 'Completing', color: 'bg-blue-500/15 text-blue-400' },
  completed: { label: 'Completed', color: 'bg-champagne-500/15 text-champagne-400' },
  cancelled: { label: 'Cancelled', color: 'bg-white/10 text-white/40' },
  refunded: { label: 'Refunded', color: 'bg-red-500/15 text-red-400' },
};

interface PendingSalesProps {
  onRefresh?: () => void;
}

export const PendingSales: FC<PendingSalesProps> = ({ onRefresh }) => {
  const {
    connected,
    fetchRecords,
    executeCompleteSaleEscrow,
    executeCompleteSaleUsdcx,
    executeCancelSale,
  } = useOnyxWallet();
  const { addPendingTx } = usePendingTxStore();

  const [sales, setSales] = useState<Sale[]>([]);
  const [saleRecords, setSaleRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    try {
      const [result, records] = await Promise.all([
        api.getMySales(),
        fetchRecords ? fetchRecords().catch(() => []) : Promise.resolve([]),
      ]);
      setSales(result.sales);
      // Filter for SaleRecord type records
      const allRecords = (records || []) as Record<string, unknown>[];
      const saleRecs = allRecords.filter(
        (r) => r._isSaleRecord
      );
      setSaleRecords(saleRecs);
    } catch (err) {
      console.error('[PendingSales] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchRecords]);

  useEffect(() => {
    if (connected) fetchSales();
  }, [connected, fetchSales]);

  // Find matching SaleRecord from wallet for a given sale
  const findSaleRecord = (sale: Sale) => {
    return saleRecords.find((r: Record<string, unknown>) => {
      const plaintext = String(r._plaintext || '');
      return plaintext.includes(sale.tagHash);
    });
  };

  const handleCompleteSale = async (sale: Sale) => {
    const record = findSaleRecord(sale);
    if (!record) {
      toast.error('Sale record not found in wallet. Please try refreshing.');
      return;
    }

    const buyerAddr = sale.buyerAddress;
    if (!buyerAddr) {
      toast.error('Buyer address not available. Cannot complete sale.');
      return;
    }

    setActionLoading(sale.saleId);
    try {
      const recordInput = record as { _plaintext?: string; _raw?: Record<string, unknown> };
      let txId: string | null = null;

      if (sale.currency === 'aleo') {
        txId = await executeCompleteSaleEscrow(recordInput, buyerAddr);
      } else {
        txId = await executeCompleteSaleUsdcx(recordInput, buyerAddr);
      }

      if (!txId) {
        setActionLoading(null);
        return;
      }

      const txType: PendingTxType = sale.currency === 'aleo' ? 'complete_sale_escrow' : 'complete_sale_usdcx';
      addPendingTx({
        id: txId,
        type: txType,
        meta: { saleId: sale.saleId },
      });

      try {
        await api.completeSaleAtomic({
          saleId: sale.saleId,
          completeSaleTxId: txId,
          buyerAddress: buyerAddr,
        });
      } catch (err) {
        console.warn('[PendingSales] Backend update failed:', err);
      }

      toast.success('Sale completion submitted!');
      await fetchSales();
      onRefresh?.();
    } catch (err) {
      console.error('[PendingSales] Complete error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to complete sale');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSale = async (sale: Sale) => {
    const record = findSaleRecord(sale);
    if (!record) {
      toast.error('Sale record not found in wallet. Please try refreshing.');
      return;
    }

    setActionLoading(sale.saleId);
    try {
      const recordInput = record as { _plaintext?: string; _raw?: Record<string, unknown> };
      const txId = await executeCancelSale(recordInput);

      if (!txId) {
        setActionLoading(null);
        return;
      }

      addPendingTx({
        id: txId,
        type: 'cancel_sale',
        meta: { saleId: sale.saleId },
      });

      // Cancel the backend sale (sets listing back to active)
      try {
        await api.cancelSale({ saleId: sale.saleId, cancelTxId: txId });
        console.log('[PendingSales] Backend sale cancelled:', sale.saleId);
      } catch (err) {
        console.warn('[PendingSales] Backend cancel failed:', err);
      }

      // Also delist the listing from marketplace
      if (sale.listingId) {
        try {
          await api.deleteListing(sale.listingId);
          console.log('[PendingSales] Listing delisted:', sale.listingId);
        } catch (err) {
          console.warn('[PendingSales] Listing delist failed:', err);
        }
      }

      toast.success('Sale cancelled');
      await fetchSales();
      onRefresh?.();
    } catch (err) {
      console.error('[PendingSales] Cancel error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to cancel sale');
    } finally {
      setActionLoading(null);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    const amount = (price / 1_000_000).toFixed(2);
    return currency === 'aleo' ? `${amount} ALEO` : `${amount} USDCx`;
  };

  if (!connected) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size={24} className="text-champagne-400" />
      </div>
    );
  }

  const activeSales = sales.filter(s => !['completed', 'cancelled', 'refunded'].includes(s.status));
  const pastSales = sales.filter(s => ['completed', 'cancelled', 'refunded'].includes(s.status));

  if (activeSales.length === 0 && pastSales.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">No sales yet. List an item on the marketplace to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeSales.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-white/60 uppercase tracking-wider">
            Active Sales ({activeSales.length})
          </h3>
          <AnimatePresence mode="popLayout">
            {activeSales.map((sale) => {
              const badge = statusBadge[sale.status] || statusBadge.pending_payment;
              const isActioning = actionLoading === sale.saleId;

              return (
                <motion.div
                  key={sale.saleId}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <DiamondIcon size={14} className="text-champagne-400/60" />
                        <span className="font-heading text-sm font-semibold text-white/80">
                          {sale.title || `Sale #${sale.saleId.slice(0, 8)}`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/30 font-mono">
                        Sale ID: {sale.saleId.slice(0, 16)}...
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badge.color}`}>
                        {badge.label}
                      </span>
                      <div className="mt-1 font-heading text-base font-bold text-champagne-300">
                        {formatPrice(sale.price, sale.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {sale.status === 'paid' && (
                      <button
                        onClick={() => handleCompleteSale(sale)}
                        disabled={isActioning}
                        className="flex-1 rounded-lg bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                      >
                        {isActioning ? (
                          <span className="flex items-center justify-center gap-2">
                            <LoadingSpinner size={12} /> Completing...
                          </span>
                        ) : (
                          'Complete Sale — Deliver Artifact'
                        )}
                      </button>
                    )}
                    {sale.status === 'pending_payment' && (
                      <button
                        onClick={() => handleCancelSale(sale)}
                        disabled={isActioning}
                        className="flex-1 rounded-lg bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400/70 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {isActioning ? (
                          <span className="flex items-center justify-center gap-2">
                            <LoadingSpinner size={12} /> Cancelling...
                          </span>
                        ) : (
                          'Cancel Sale'
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {pastSales.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-white/60 uppercase tracking-wider">
            Past Sales ({pastSales.length})
          </h3>
          {pastSales.slice(0, 10).map((sale) => {
            const badge = statusBadge[sale.status] || statusBadge.completed;
            return (
              <div
                key={sale.saleId}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <DiamondIcon size={12} className="text-white/20" />
                  <span className="text-xs text-white/50">{sale.title || `Sale #${sale.saleId.slice(0, 8)}`}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-white/30">{formatPrice(sale.price, sale.currency)}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
