import { FC, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingSpinner, CheckCircleIcon } from '../icons/Icons';
import { usePendingTxStore, PendingTxType } from '../../stores/pendingTxStore';
import { formatAddress } from '../../lib/aleo';

// ================================================================
// Pending Transaction Banner
// ================================================================
// Displays pending/confirmed state. Confirmation detection is handled
// by the useOnyxWallet hook (which uses wallet.transactionStatus() for
// near-instant detection). This component is purely reactive.

interface PendingTxBannerProps {
  /** Which transaction type(s) to watch */
  types: PendingTxType[];
  /** Callback when a TX gets confirmed — parent can refresh data */
  onConfirmed?: (txId: string) => void;
  /** Custom message to show */
  message?: string;
}

// Friendly labels for transaction types
const TX_LABELS: Record<PendingTxType, string> = {
  mint: 'Minting artifact',
  transfer: 'Transferring item',
  report_stolen: 'Reporting stolen',
  prove_for_resale: 'Generating proof',
  create_escrow: 'Creating escrow',
  release_escrow: 'Releasing escrow',
  refund_escrow: 'Refunding escrow',
  pay_usdcx: 'Processing USDCx payment',
  register_brand: 'Registering brand',
  create_sale: 'Creating sale',
  buy_sale_escrow: 'Purchasing with ALEO',
  buy_sale_usdcx: 'Purchasing with USDCx',
  complete_sale_escrow: 'Completing sale (ALEO)',
  complete_sale_usdcx: 'Completing sale (USDCx)',
  cancel_sale: 'Cancelling sale',
  refund_sale: 'Refunding sale',
};

export const PendingTxBanner: FC<PendingTxBannerProps> = ({
  types,
  onConfirmed,
  message,
}) => {
  const { transactions } = usePendingTxStore();
  const calledRef = useRef<Set<string>>(new Set());

  // Filter relevant TXs
  const now = Date.now();
  const EXPIRY = 20 * 60 * 1000;
  const pendingTxs = transactions.filter(
    (t) =>
      types.includes(t.type) &&
      t.status === 'pending' &&
      now - new Date(t.createdAt).getTime() < EXPIRY
  );
  const recentlyConfirmed = transactions.filter(
    (t) =>
      types.includes(t.type) &&
      t.status === 'confirmed' &&
      now - new Date(t.createdAt).getTime() < 30000
  );

  // Fire onConfirmed callback when a TX transitions to confirmed
  useEffect(() => {
    recentlyConfirmed.forEach((tx) => {
      if (!calledRef.current.has(tx.id)) {
        calledRef.current.add(tx.id);
        onConfirmed?.(tx.id);
      }
    });
  }, [recentlyConfirmed, onConfirmed]);

  if (pendingTxs.length === 0 && recentlyConfirmed.length === 0) return null;

  return (
    <AnimatePresence>
      {pendingTxs.map((tx) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          className="mb-4 overflow-hidden"
        >
          <div className="relative rounded-xl border border-champagne-500/30 bg-champagne-500/5 p-4 backdrop-blur-sm">
            {/* Animated pulse bar */}
            <div className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-xl">
              <motion.div
                className="h-full bg-gradient-to-r from-transparent via-champagne-400 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                style={{ width: '50%' }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <LoadingSpinner size={22} className="text-champagne-400" />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-champagne-400/30"
                  animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-champagne-300">
                  {message || `${TX_LABELS[tx.type]}...`}
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  Transaction pending on Aleo — this may take 1-3 minutes
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-white/30">
                  {tx.id.slice(0, 8)}...{tx.id.slice(-6)}
                </p>
                <ElapsedTime since={tx.createdAt} />
              </div>
            </div>

            {/* Meta info */}
            {tx.meta.tagHash && (
              <div className="mt-2 flex gap-4 border-t border-white/5 pt-2 text-xs text-white/30">
                {tx.meta.tagHash && <span>Tag: {tx.meta.tagHash}</span>}
                {tx.meta.amount && <span>Amount: {tx.meta.amount}</span>}
                {tx.meta.modelId && <span>Model #{tx.meta.modelId}</span>}
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {recentlyConfirmed.map((tx) => {
        const realId = tx.meta?.onChainTxId as string | undefined;
        const displayId = realId || (tx.id.startsWith('at1') ? tx.id : undefined);
        return (
        <motion.div
          key={`confirmed-${tx.id}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mb-4"
        >
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-3">
              <CheckCircleIcon size={22} className="text-emerald-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-300">
                  {TX_LABELS[tx.type]} confirmed!
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  Transaction accepted on Aleo blockchain
                </p>
              </div>
              {displayId && (
                <p className="font-mono text-xs text-emerald-400/60">
                  {displayId.slice(0, 10)}...{displayId.slice(-6)}
                </p>
              )}
            </div>
          </div>
        </motion.div>
        );
      })}
    </AnimatePresence>
  );
};

// ================================================================
// Pending Transaction Card (inline item in a list)
// ================================================================
// Shows a "ghost" card in item lists (Vault, Escrow) for pending TXs

interface PendingTxCardProps {
  tx: {
    type: PendingTxType;
    meta: Record<string, unknown>;
    createdAt: string;
    id: string;
  };
}

export const PendingTxCard: FC<PendingTxCardProps> = ({ tx }) => {
  const label = TX_LABELS[tx.type] || 'Processing';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card gold-border relative overflow-hidden p-6"
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <div className="relative flex items-center gap-4">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-champagne-500/10">
          <LoadingSpinner size={24} className="text-champagne-400" />
          <motion.div
            className="absolute inset-0 rounded-lg border border-champagne-400/20"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/70">{label}...</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-champagne-500/30 bg-champagne-500/10 px-2 py-0.5 text-xs text-champagne-400">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-champagne-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              Pending
            </span>
          </div>

          {!!tx.meta.tagHash && (
            <p className="mt-1 font-mono text-xs text-white/30">
              {String(tx.meta.tagHash)}
            </p>
          )}
          {!!tx.meta.amount && (
            <p className="mt-0.5 text-xs text-white/30">
              Amount: {String(tx.meta.amount)}
            </p>
          )}
        </div>

        <ElapsedTime since={tx.createdAt} />
      </div>
    </motion.div>
  );
};

// ================================================================
// Elapsed Time Component
// ================================================================

const ElapsedTime: FC<{ since: string }> = ({ since }) => {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <p className="font-mono text-xs text-white/30">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </p>
  );
};

// ================================================================
// Transaction ID Display
// ================================================================
// Shows a loading shimmer for shield_xxx IDs, then resolves to
// the real at1xxx on-chain ID by watching the pending TX store.
// For at1xxx IDs, displays immediately.

interface TransactionIdDisplayProps {
  txId: string;
  label?: string;
  chars?: number;
}

export const TransactionIdDisplay: FC<TransactionIdDisplayProps> = ({
  txId,
  label = 'Transaction',
  chars = 12,
}) => {
  const { transactions } = usePendingTxStore();
  const [resolved, setResolved] = useState<string | null>(null);

  // Check if we already have an at1 ID
  const isRealId = txId.startsWith('at1');

  // Watch the store for the real on-chain ID
  useEffect(() => {
    if (isRealId) {
      setResolved(txId);
      return;
    }

    // Look up in the pending TX store for onChainTxId
    const pendingTx = transactions.find((t) => t.id === txId);
    const realId = pendingTx?.meta?.onChainTxId as string | undefined;
    if (realId && typeof realId === 'string' && realId.startsWith('at1')) {
      setResolved(realId);
    }
  }, [txId, isRealId, transactions]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="mb-1 text-xs text-white/40">{label}</p>
      {resolved ? (
        <p className="break-all font-mono text-sm text-white">
          {formatAddress(resolved, chars)}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative h-5 flex-1 overflow-hidden rounded">
            <div className="h-full w-3/4 rounded bg-white/10" />
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <span className="whitespace-nowrap text-xs text-white/30">
            Confirming...
          </span>
        </div>
      )}
    </div>
  );
};
