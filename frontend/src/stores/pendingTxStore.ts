import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ================================================================
// Pending Transaction Store
// ================================================================
// Tracks transactions that have been submitted to the wallet but
// not yet confirmed on-chain. Shows pending items in the UI so
// users know their actions are processing.

export type PendingTxType =
  | 'mint'
  | 'transfer'
  | 'report_stolen'
  | 'prove_for_resale'
  | 'create_escrow'
  | 'release_escrow'
  | 'refund_escrow'
  | 'pay_usdcx'
  | 'register_brand'
  | 'create_sale'
  | 'buy_sale_escrow'
  | 'buy_sale_usdcx'
  | 'complete_sale_escrow'
  | 'complete_sale_usdcx'
  | 'cancel_sale'
  | 'refund_sale';

export interface PendingTx {
  id: string;           // txId from wallet
  type: PendingTxType;
  createdAt: string;    // ISO timestamp
  status: 'pending' | 'confirmed' | 'failed';
  // Metadata for display
  meta: {
    tagHash?: string;
    modelId?: number;
    amount?: string;
    seller?: string;
    brandName?: string;
    newOwner?: string;
    [key: string]: unknown;
  };
}

interface PendingTxState {
  transactions: PendingTx[];
  addPendingTx: (tx: Omit<PendingTx, 'createdAt' | 'status'>) => void;
  confirmTx: (id: string) => void;
  failTx: (id: string) => void;
  removeTx: (id: string) => void;
  updateTxMeta: (id: string, meta: Partial<PendingTx['meta']>) => void;
  getPendingByType: (type: PendingTxType) => PendingTx[];
  hasPendingOfType: (type: PendingTxType) => boolean;
  clearConfirmed: () => void;
  clearAll: () => void;
}

// Auto-expire pending TXs after 20 minutes (in case polling misses them)
const TX_EXPIRY_MS = 20 * 60 * 1000;

export const usePendingTxStore = create<PendingTxState>()(
  persist(
    (set, get) => ({
      transactions: [],

      addPendingTx: (tx) =>
        set((state) => ({
          transactions: [
            ...state.transactions.filter((t) => t.id !== tx.id), // dedupe
            { ...tx, createdAt: new Date().toISOString(), status: 'pending' as const },
          ],
        })),

      confirmTx: (id) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, status: 'confirmed' as const } : t
          ),
        })),

      failTx: (id) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, status: 'failed' as const } : t
          ),
        })),

      removeTx: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),

      updateTxMeta: (id, meta) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, meta: { ...t.meta, ...meta } } : t
          ),
        })),

      getPendingByType: (type) => {
        const now = Date.now();
        return get().transactions.filter(
          (t) =>
            t.type === type &&
            t.status === 'pending' &&
            now - new Date(t.createdAt).getTime() < TX_EXPIRY_MS
        );
      },

      hasPendingOfType: (type) => {
        const now = Date.now();
        return get().transactions.some(
          (t) =>
            t.type === type &&
            t.status === 'pending' &&
            now - new Date(t.createdAt).getTime() < TX_EXPIRY_MS
        );
      },

      clearConfirmed: () =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.status === 'pending'),
        })),

      clearAll: () => set({ transactions: [] }),
    }),
    {
      name: 'onyx-pending-tx',
      // Only persist pending transactions (not confirmed/failed)
      partialize: (state) => ({
        transactions: state.transactions.filter(
          (t) =>
            t.status === 'pending' &&
            Date.now() - new Date(t.createdAt).getTime() < TX_EXPIRY_MS
        ),
      }),
    }
  )
);
