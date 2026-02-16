import { FC, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import toast from 'react-hot-toast';
import {
  ShieldIcon,
  DiamondIcon,
  CheckCircleIcon,
  LoadingSpinner,
  WalletIcon,
} from '../components/icons/Icons';
import { Button, Card, Input, StatusBadge } from '../components/ui/Components';
import { PendingTxBanner, PendingTxCard, TransactionIdDisplay } from '../components/ui/PendingTx';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { usePendingTxStore } from '../stores/pendingTxStore';
import { formatAddress } from '../lib/aleo';

type EscrowMode = 'create' | 'manage';

interface EscrowState {
  escrowId: string;
  tagHash: string;
  amount: string;
  seller: string;
  txId: string;
}

export const Escrow: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const {
    authenticate,
    executeCreateEscrow,
    executeReleaseEscrow,
    executeRefundEscrow,
    executePayVerificationUsdcx,
    fetchRecords,
    loading,
  } = useOnyxWallet();

  const MICROCREDITS_PER_ALEO = 1_000_000;
  const { isAuthenticated } = useUserStore();
  const { addPendingTx, hasPendingOfType, getPendingByType } = usePendingTxStore();

  const [mode, setMode] = useState<EscrowMode>('create');
  const [localLoading, setLocalLoading] = useState(false);

  // Create form state
  const [tagHash, setTagHash] = useState('');
  const [amount, setAmount] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [tokenType, setTokenType] = useState<'aleo' | 'usdcx'>('aleo');
  const [escrowResult, setEscrowResult] = useState<EscrowState | null>(null);

  // Manage state — escrow receipts from wallet
  const [escrowReceipts, setEscrowReceipts] = useState<unknown[]>([]);
  const [actionResult, setActionResult] = useState<{
    action: 'released' | 'refunded';
    txId: string;
  } | null>(null);

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  useEffect(() => {
    if (wallet.connected) {
      const token = localStorage.getItem('onyx_token');
      if (!isAuthenticated || !token) {
        authenticate();
      }
    }
  }, [wallet.connected]);

  useEffect(() => {
    if (isAuthenticated && walletAddress && mode === 'manage') {
      loadEscrowReceipts();
    }
  }, [isAuthenticated, walletAddress, mode]);

  const loadEscrowReceipts = async () => {
    setLocalLoading(true);
    try {
      const records = await fetchRecords();
      // Filter for EscrowReceipt and BuyerReceipt records by checking multiple indicators:
      // - _isEscrowReceipt flag (set by fetchRecords based on escrow_id / functionName)
      // - _isBuyerReceipt flag (set by fetchRecords based on payment_hash / functionName)
      // - recordName === 'EscrowReceipt' or 'BuyerReceipt' (Leo wallet)
      // - data contains escrow_id or payment_hash
      // - plaintext contains 'escrow_id' or 'payment_hash' (decrypted content)
      const receipts = records.filter((r) => {
        const rec = r as Record<string, unknown>;
        if (rec._isEscrowReceipt) return true;
        if (rec._isBuyerReceipt) return true;
        if (rec.recordName === 'EscrowReceipt' || rec.recordName === 'BuyerReceipt') return true;
        if (rec.functionName === 'create_escrow' || rec.functionName === 'pay_verification' || rec.functionName === 'pay_verification_usdcx') return true;
        const data = rec.data as Record<string, string> | undefined;
        if (data?.escrow_id || data?.payment_hash) return true;
        const pt = (rec._plaintext || rec.plaintext) as string | undefined;
        if (pt && (pt.includes('escrow_id') || pt.includes('payment_hash'))) return true;
        return false;
      });
      console.log('[Escrow] Found escrow receipts:', receipts.length, receipts);
      setEscrowReceipts(receipts);
    } catch (err) {
      console.error('[Escrow] Load receipts error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleCreateEscrow = async () => {
    if (!tagHash || !amount || !sellerAddress) {
      toast.error('Please fill in all fields');
      return;
    }

    const amountAleo = parseFloat(amount);
    if (isNaN(amountAleo) || amountAleo <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }

    if (tokenType === 'usdcx') {
      // USDCx direct payment via pay_verification_usdcx
      const amountMicroUsdcx = BigInt(Math.round(amountAleo * 1_000_000));
      const tagHashField = tagHash.endsWith('field') ? tagHash : `${tagHash}field`;
      const txId = await executePayVerificationUsdcx(tagHashField, amountMicroUsdcx, sellerAddress);
      if (txId) {
        addPendingTx({
          id: txId,
          type: 'pay_usdcx',
          meta: { tagHash, amount: `${amountAleo} USDCx`, seller: sellerAddress },
        });

        setEscrowResult({
          escrowId: 'usdcx-direct',
          tagHash,
          amount,
          seller: sellerAddress,
          txId,
        });
      }
      return;
    }

    // ALEO credits escrow
    const amountMicrocredits = Math.round(amountAleo * MICROCREDITS_PER_ALEO);

    const escrowSalt = Math.floor(Math.random() * 1000000000).toString();
    const result = await executeCreateEscrow(tagHash, amountMicrocredits, sellerAddress, escrowSalt);
    if (result) {
      // Track as pending so Manage Escrows shows it while confirming
      addPendingTx({
        id: result.txId,
        type: 'create_escrow',
        meta: { tagHash, amount: `${amountAleo} ALEO`, seller: sellerAddress },
      });

      setEscrowResult({
        escrowId: result.escrowId || 'pending',
        tagHash,
        amount,
        seller: sellerAddress,
        txId: result.txId,
      });
    }
  };

  const handleRelease = async (receipt: unknown) => {
    const txId = await executeReleaseEscrow(
      receipt as { _plaintext?: string; _raw?: { id?: string; ciphertext?: string } }
    );
    if (txId) {
      addPendingTx({ id: txId, type: 'release_escrow', meta: {} });
      setActionResult({ action: 'released', txId });
      loadEscrowReceipts();
    }
  };

  const handleRefund = async (receipt: unknown) => {
    const txId = await executeRefundEscrow(
      receipt as { _plaintext?: string; _raw?: { id?: string; ciphertext?: string } }
    );
    if (txId) {
      addPendingTx({ id: txId, type: 'refund_escrow', meta: {} });
      setActionResult({ action: 'refunded', txId });
      loadEscrowReceipts();
    }
  };

  const resetCreate = () => {
    setEscrowResult(null);
    setTagHash('');
    setAmount('');
    setSellerAddress('');
    setTokenType('aleo');
  };

  const renderModeToggle = () => (
    <div className="mb-8 flex justify-center">
      <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setMode('create')}
          className={`rounded-md px-6 py-2 text-sm font-medium transition-all ${
            mode === 'create'
              ? 'bg-gradient-gold text-onyx-950'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Create Escrow
        </button>
        <button
          onClick={() => {
            setMode('manage');
            if (isAuthenticated) loadEscrowReceipts();
          }}
          className={`rounded-md px-6 py-2 text-sm font-medium transition-all ${
            mode === 'manage'
              ? 'bg-gradient-gold text-onyx-950'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Manage Escrows
        </button>
      </div>
    </div>
  );

  // --- Not connected ---
  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <ShieldIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold text-white">
            Credit Escrow
          </h1>
          <p className="mb-8 text-white/50">
            Connect your wallet to create or manage escrow deposits
          </p>
          <Button onClick={() => openWalletModal(true)} size="lg">
            Connect Wallet
          </Button>
        </motion.div>
      </div>
    );
  }

  // --- Not authenticated ---
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <ShieldIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold text-white">
            Authenticate to Continue
          </h1>
          <p className="mb-8 text-white/50">
            Sign a message with your wallet to verify identity
          </p>
          <Button onClick={() => authenticate()} loading={loading} size="lg">
            Sign to Authenticate
          </Button>
        </motion.div>
      </div>
    );
  }

  // --- Escrow creation result ---
  if (escrowResult) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Credit Escrow
          </h1>
          <p className="text-white/50">Secure credit deposits for paid verification</p>
        </motion.div>

        {renderModeToggle()}

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="overflow-hidden">
            <div className="-mx-6 -mt-6 mb-6 bg-gradient-to-b from-champagne-900/30 to-transparent p-8 text-center">
              <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
              <h2 className="font-heading text-2xl font-bold gold-gradient-text">
                Escrow Created!
              </h2>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-champagne-500/20 bg-champagne-500/10 p-4">
                <p className="mb-1 text-xs text-champagne-400">Amount Deposited</p>
                <p className="font-mono text-lg font-bold text-white">
                  {parseFloat(escrowResult.amount)} {escrowResult.escrowId === 'usdcx-direct' ? 'USDCx' : 'ALEO'}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Item Tag</p>
                <p className="font-mono text-sm text-white">
                  {formatAddress(escrowResult.tagHash, 10)}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Seller</p>
                <p className="font-mono text-sm text-white">
                  {formatAddress(escrowResult.seller, 10)}
                </p>
              </div>

              <TransactionIdDisplay txId={escrowResult.txId} />

              <div className="rounded-lg border border-champagne-500/20 bg-champagne-500/5 p-4">
                <p className="text-sm text-champagne-400">
                  Your credits are held on-chain. After verifying the item, release
                  credits to the seller. If the deal falls through, refund after the
                  timeout (~1000 blocks).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={resetCreate} className="flex-1">
                Create Another
              </Button>
              <Button
                onClick={() => {
                  setMode('manage');
                  setEscrowResult(null);
                  loadEscrowReceipts();
                }}
                className="flex-1"
              >
                Manage Escrows
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // --- Action result (release/refund) ---
  if (actionResult) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Credit Escrow
          </h1>
        </motion.div>

        {renderModeToggle()}

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="overflow-hidden">
            <div className="-mx-6 -mt-6 mb-6 bg-gradient-to-b from-champagne-900/30 to-transparent p-8 text-center">
              <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
              <h2 className="font-heading text-2xl font-bold gold-gradient-text">
                {actionResult.action === 'released'
                  ? 'Credits Released to Seller'
                  : 'Credits Refunded to You'}
              </h2>
            </div>

            <div className="mb-6">
              <TransactionIdDisplay txId={actionResult.txId} />
            </div>

            <Button
              onClick={() => {
                setActionResult(null);
                loadEscrowReceipts();
              }}
              className="w-full"
            >
              Back to Escrows
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  // --- Main views ---
  return (
    <div className="mx-auto max-w-2xl py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
          Credit Escrow
        </h1>
        <p className="text-white/50">
          Secure credit deposits for paid item verification
        </p>
      </motion.div>

      {renderModeToggle()}

      <AnimatePresence mode="wait">
        {mode === 'create' ? (
          <motion.div
            key="create"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                  <WalletIcon size={32} className="text-champagne-400" />
                </div>
                <p className="text-sm text-white/50">
                  {tokenType === 'aleo'
                    ? 'Deposit ALEO credits on-chain for a secure purchase. Release to seller after verifying the item, or refund after timeout.'
                    : 'Pay directly with USDCx stablecoin. The payment is processed immediately via a cross-program call.'}
                </p>
              </div>

              {/* Token Type Toggle */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-white/50">Payment Method</label>
                <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
                  <button
                    onClick={() => setTokenType('aleo')}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      tokenType === 'aleo'
                        ? 'bg-gradient-gold text-onyx-950'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    ALEO Credits
                  </button>
                  <button
                    onClick={() => setTokenType('usdcx')}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      tokenType === 'usdcx'
                        ? 'bg-gradient-gold text-onyx-950'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    USDCx Stablecoin
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Item Tag Hash"
                  placeholder="Tag hash of the item to purchase"
                  value={tagHash}
                  onChange={setTagHash}
                />
                <Input
                  label={tokenType === 'aleo' ? 'Amount (ALEO)' : 'Amount (USDCx)'}
                  placeholder="e.g. 1"
                  value={amount}
                  onChange={setAmount}
                  type="number"
                />
                <Input
                  label="Seller Address"
                  placeholder="aleo1..."
                  value={sellerAddress}
                  onChange={setSellerAddress}
                />
              </div>

              <Button
                onClick={handleCreateEscrow}
                loading={loading}
                disabled={!tagHash || !amount || !sellerAddress}
                size="lg"
                className="mt-6 w-full"
              >
                {tokenType === 'aleo' ? 'Create Escrow' : 'Pay with USDCx'}
              </Button>
            </Card>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-6"
            >
              <Card className="border-champagne-500/10 bg-onyx-900/50">
                <h3 className="mb-3 font-heading text-sm font-semibold text-white/70">
                  How Escrow Works
                </h3>
                <ul className="space-y-2 text-sm text-white/40">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                    Credits are deposited to the program&apos;s public balance via credits.aleo
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                    An EscrowReceipt record is minted to your wallet as proof
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                    Release credits to the seller once you verify the item is authentic
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                    If the deal falls through, reclaim your credits after ~1000 blocks
                  </li>
                </ul>
              </Card>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="manage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Pending transaction banners */}
            <PendingTxBanner
              types={['create_escrow', 'release_escrow', 'refund_escrow', 'pay_usdcx']}
              onConfirmed={() => loadEscrowReceipts()}
            />

            {localLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner size={48} className="text-champagne-400" />
              </div>
            ) : escrowReceipts.length === 0 && !hasPendingOfType('create_escrow') ? (
              <Card className="text-center">
                <DiamondIcon size={48} className="mx-auto mb-4 text-white/20" />
                <p className="mb-2 text-white/50">No active escrow receipts</p>
                <p className="text-sm text-white/30">
                  Create an escrow to deposit credits for a purchase
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setMode('create')}
                  className="mt-6"
                >
                  Create Escrow
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Show pending escrow cards */}
                {getPendingByType('create_escrow').map((ptx) => (
                  <PendingTxCard key={ptx.id} tx={ptx} />
                ))}

                {escrowReceipts.map((receipt, index) => {
                  const r = receipt as {
                    data?: {
                      escrow_id?: string;
                      tag_hash?: string;
                      amount?: string;
                      seller?: string;
                      payment_hash?: string;
                      token_type?: string;
                    };
                    _plaintext?: string;
                    _isBuyerReceipt?: boolean;
                    _isEscrowReceipt?: boolean;
                  };
                  const cleanField = (val?: string) => val?.replace(/\.private$/, '').replace(/\.public$/, '').replace(/field$/, '').replace(/u64$/, '').replace(/u8$/, '').trim() || '';
                  const isBuyerReceipt = !!(r._isBuyerReceipt || r.data?.payment_hash);
                  const escrowId = cleanField(r.data?.escrow_id) || (isBuyerReceipt ? cleanField(r.data?.payment_hash) : `escrow-${index}`);
                  const receiptTag = cleanField(r.data?.tag_hash) || 'Unknown';
                  const receiptAmount = cleanField(r.data?.amount) || '0';
                  const seller = (r.data?.seller?.replace(/\.private$/, '').replace(/\.public$/, '').trim()) || 'Unknown';
                  const tokenTypeRaw = cleanField(r.data?.token_type);
                  const isUsdcx = tokenTypeRaw === '1';
                  const currencyLabel = isBuyerReceipt && isUsdcx ? 'USDCx' : 'ALEO';
                  const cardTitle = isBuyerReceipt ? 'Payment Receipt' : 'Escrow';

                  return (
                    <Card key={escrowId} className="border-champagne-500/20">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-lg bg-gradient-gold p-2 text-onyx-950">
                          <ShieldIcon size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="font-heading font-semibold text-white">
                            {cardTitle} #{index + 1}
                          </p>
                          <p className="font-mono text-xs text-white/40">
                            {formatAddress(escrowId, 8)}
                          </p>
                        </div>
                        <StatusBadge status="authentic" />
                      </div>

                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between rounded-lg bg-white/5 p-3">
                          <span className="text-xs text-white/40">Item</span>
                          <span className="font-mono text-xs text-white">
                            {formatAddress(receiptTag, 8)}
                          </span>
                        </div>
                        <div className="flex justify-between rounded-lg bg-white/5 p-3">
                          <span className="text-xs text-white/40">Amount</span>
                          <span className="font-mono text-xs text-white">
                            {(parseInt(receiptAmount) / MICROCREDITS_PER_ALEO).toFixed(2)} {currencyLabel}
                          </span>
                        </div>
                        <div className="flex justify-between rounded-lg bg-white/5 p-3">
                          <span className="text-xs text-white/40">Seller</span>
                          <span className="font-mono text-xs text-white">
                            {formatAddress(seller, 8)}
                          </span>
                        </div>
                      </div>

                      {isBuyerReceipt ? (
                        <div className="rounded-lg bg-green-500/10 p-3 text-center">
                          <span className="text-xs font-medium text-green-400">
                            Payment Complete — {currencyLabel} sent directly to seller
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <Button
                            onClick={() => handleRelease(receipt)}
                            loading={loading}
                            size="sm"
                            className="flex-1"
                          >
                            Release to Seller
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleRefund(receipt)}
                            loading={loading}
                            size="sm"
                            className="flex-1"
                          >
                            Refund
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
