import { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import toast from 'react-hot-toast';
import {
  StolenAlertIcon,
  DiamondIcon,
  CheckCircleIcon,
  LoadingSpinner,
} from '../components/icons/Icons';
import { Button, Card, Input, StatusBadge } from '../components/ui/Components';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { api } from '../lib/api';
import { formatAddress, checkStolenStatus } from '../lib/aleo';
import { TransactionIdDisplay } from '../components/ui/PendingTx';

interface WalletArtifact {
  tagHash: string;
  modelId: string;
  brand: string;
  stolen: boolean;
  _fromWallet: boolean;
  _plaintext?: string;
  _raw?: Record<string, unknown>;
  _isBountyPledge?: boolean;
  _bountyAmount?: string;
}

export const Stolen: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeReportStolen, executeReportStolenWithBounty, executeClaimBounty, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated } = useUserStore();

  const [localLoading, setLocalLoading] = useState(false);
  const [walletArtifacts, setWalletArtifacts] = useState<WalletArtifact[]>([]);
  const [bountyPledges, setBountyPledges] = useState<WalletArtifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<WalletArtifact | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [bountyAmount, setBountyAmount] = useState('');
  const [claimAddress, setClaimAddress] = useState('');
  const [claimTxId, setClaimTxId] = useState<string | null>(null);
  const [claimingIdx, setClaimingIdx] = useState<number | null>(null);
  const [reportComplete, setReportComplete] = useState<{
    tagHash: string;
    txId: string;
  } | null>(null);

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  useEffect(() => {
    if (wallet.connected) {
      const token = localStorage.getItem('onyx_token');
      if (!isAuthenticated || !token) {
        handleAuth();
      }
    }
  }, [wallet.connected]);

  useEffect(() => {
    if (isAuthenticated && walletAddress) {
      loadFromWallet();
    }
  }, [isAuthenticated, walletAddress]);

  const handleAuth = async () => {
    await authenticate();
  };

  const loadFromWallet = async () => {
    setLocalLoading(true);
    try {
      const records = await fetchRecords();
      const allRecords = (records || []) as Record<string, unknown>[];

      const artifacts: WalletArtifact[] = [];
      const pledges: WalletArtifact[] = [];

      for (const rec of allRecords) {
        const data = (rec.data || {}) as Record<string, string>;
        const tagHash = (data.tag_hash || '').replace(/\.private$/, '').replace(/field$/, '').trim();

        if (rec._isBountyPledge && tagHash) {
          const amount = (data.amount || '').replace(/\.private$/, '').replace(/u64$/, '').trim();
          pledges.push({
            tagHash,
            modelId: '',
            brand: '',
            stolen: true,
            _fromWallet: true,
            _plaintext: rec._plaintext as string | undefined,
            _raw: rec as Record<string, unknown>,
            _isBountyPledge: true,
            _bountyAmount: amount,
          });
          continue;
        }

        // Skip non-AssetArtifact records
        if (rec._isSaleRecord || rec._isMintCertificate || rec._isProofToken ||
            rec._isProofChallenge || rec._isEscrowReceipt || rec._isBuyerReceipt ||
            rec._isPurchaseReceipt) {
          continue;
        }

        if (!tagHash) continue;

        const modelId = (data.model_id || '').replace(/\.private$/, '').replace(/u64$/, '').trim();
        const brand = (data.brand || '').replace(/\.private$/, '');

        // Check stolen status on-chain
        let stolen = false;
        try {
          stolen = await checkStolenStatus(tagHash);
        } catch { /* not stolen */ }

        artifacts.push({
          tagHash,
          modelId,
          brand,
          stolen,
          _fromWallet: true,
          _plaintext: rec._plaintext as string | undefined,
          _raw: rec as Record<string, unknown>,
        });
      }

      setWalletArtifacts(artifacts);
      setBountyPledges(pledges);
    } catch (err) {
      console.error('[Stolen] Load wallet records error:', err);
      toast.error('Failed to load wallet records');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleReport = async () => {
    if (!selectedArtifact) return;

    let txId: string | null = null;
    const bountyAleo = bountyAmount ? parseFloat(bountyAmount) : 0;
    const bountyValue = Math.round(bountyAleo * 1_000_000); // Convert ALEO to microcredits

    if (bountyValue > 0) {
      txId = await executeReportStolenWithBounty(
        { tagHash: selectedArtifact.tagHash, _plaintext: selectedArtifact._plaintext, _raw: selectedArtifact._raw as { id?: string; ciphertext?: string } | undefined },
        bountyValue
      );
    } else {
      txId = await executeReportStolen(
        { tagHash: selectedArtifact.tagHash, _plaintext: selectedArtifact._plaintext, _raw: selectedArtifact._raw as { id?: string; ciphertext?: string } | undefined }
      );
    }

    if (txId) {
      try {
        await api.reportStolen({
          tagHash: selectedArtifact.tagHash,
          txId,
        });
      } catch (err) {
        console.error('[Stolen] Backend error:', err);
      }
      setReportComplete({
        tagHash: selectedArtifact.tagHash,
        txId,
      });
      setConfirmModal(false);
    }
  };

  const resetReport = () => {
    setReportComplete(null);
    setSelectedArtifact(null);
    setBountyAmount('');
    setClaimAddress('');
    setClaimTxId(null);
    loadFromWallet();
  };

  const handleClaimBounty = async (pledge: WalletArtifact, idx: number) => {
    if (!claimAddress || !claimAddress.startsWith('aleo1')) {
      toast.error('Enter a valid claimer address');
      return;
    }
    if (!pledge._raw) {
      toast.error('Bounty pledge record not available from wallet');
      return;
    }
    setClaimingIdx(idx);
    try {
      const txId = await executeClaimBounty({ _raw: pledge._raw }, claimAddress);
      if (txId) {
        setClaimTxId(txId);
        toast.success('Bounty payout submitted!');
        // Remove the paid pledge from the list
        setBountyPledges(prev => prev.filter((_, i) => i !== idx));
      }
    } catch (err) {
      console.error('[Stolen] Claim bounty error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to claim bounty');
    } finally {
      setClaimingIdx(null);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <StolenAlertIcon size={64} className="mx-auto mb-6 text-red-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold text-white">
            Report Stolen Item
          </h1>
          <p className="mb-8 text-white/50">
            Connect your wallet to report a stolen item
          </p>
          <Button onClick={() => openWalletModal(true)} size="lg">
            Connect Wallet
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <StolenAlertIcon size={64} className="mx-auto mb-6 text-red-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold text-white">
            Authenticate to Continue
          </h1>
          <p className="mb-8 text-white/50">
            Sign a message with your wallet to verify ownership
          </p>
          <Button onClick={handleAuth} loading={loading} size="lg">
            Sign to Authenticate
          </Button>
        </motion.div>
      </div>
    );
  }

  if (reportComplete) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="overflow-hidden">
            <div className="-mx-6 -mt-6 mb-6 bg-gradient-to-b from-red-900/30 to-transparent p-8 text-center">
              <CheckCircleIcon size={64} className="mx-auto mb-4 text-red-400" />
              <h2 className="font-heading text-2xl font-bold text-red-400">
                Item Reported Stolen
              </h2>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">
                  This item is now permanently marked as stolen on the blockchain.
                  Anyone scanning it will be alerted.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Item</p>
                <p className="font-mono text-sm text-white">
                  {formatAddress(reportComplete.tagHash, 10)}
                </p>
              </div>
              <TransactionIdDisplay txId={reportComplete.txId} />
            </div>

            <Button onClick={resetReport} variant="secondary" className="w-full">
              Done
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  const stolenItems = walletArtifacts.filter((a) => a.stolen);
  const reportableItems = walletArtifacts.filter((a) => !a.stolen);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="mb-2 font-heading text-4xl font-bold text-red-400">
          Stolen Items
        </h1>
        <p className="text-white/50">
          Manage stolen reports, bounties, and item recovery
        </p>
      </motion.div>

      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size={48} className="text-red-400" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

          {/* ── STOLEN ITEMS (primary section) ── */}
          {stolenItems.length > 0 && (
            <Card className="border-red-500/20">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-red-500/15 p-1.5">
                  <StolenAlertIcon size={18} className="text-red-400" />
                </div>
                <h2 className="font-heading text-lg font-semibold text-red-400/80">
                  Reported Stolen
                </h2>
                <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400/60">
                  {stolenItems.length}
                </span>
              </div>
              <div className="space-y-3">
                {stolenItems.map((artifact) => (
                  <div
                    key={artifact.tagHash}
                    className="rounded-xl border border-red-500/15 bg-red-500/[0.04] p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg bg-red-500/15 p-2">
                        <DiamondIcon size={20} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-semibold text-white">
                          Model #{artifact.modelId || '?'}
                        </p>
                        <p className="font-mono text-xs text-white/30 truncate">
                          {artifact.tagHash}
                        </p>
                      </div>
                      <StatusBadge status="stolen" />
                    </div>
                    <div className="mt-3 rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2">
                      <p className="text-xs text-red-400/60">
                        Permanently blacklisted on-chain. Anyone scanning this item will be alerted.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── BOUNTY MANAGEMENT ── */}
          {stolenItems.length > 0 && (
            <Card className="border-amber-500/15">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/15 p-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M16 8h-6a2 2 0 100 4h4a2 2 0 010 4H8" />
                    <path d="M12 18V6" />
                  </svg>
                </div>
                <h2 className="font-heading text-lg font-semibold text-amber-400/80">
                  Recovery Bounty
                </h2>
              </div>

              {bountyPledges.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs text-white/40">
                    You have active bounty pledges. Enter the finder&apos;s address to authorize payout.
                  </p>
                  <Input
                    label="Finder's Aleo Address"
                    placeholder="aleo1..."
                    value={claimAddress}
                    onChange={setClaimAddress}
                  />
                  {bountyPledges.map((pledge, idx) => (
                    <div
                      key={`claim-${idx}-${pledge.tagHash}`}
                      className="flex items-center gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4"
                    >
                      <DiamondIcon size={16} className="text-amber-400/60" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/60 truncate">
                          Tag: {formatAddress(pledge.tagHash, 8)}
                        </p>
                        {pledge._bountyAmount && (
                          <p className="text-xs font-medium text-amber-400">
                            {(parseInt(pledge._bountyAmount) / 1_000_000).toFixed(2)} ALEO bounty
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleClaimBounty(pledge, idx)}
                        loading={claimingIdx === idx}
                        disabled={!claimAddress || !claimAddress.startsWith('aleo1') || claimingIdx !== null}
                      >
                        Pay Bounty
                      </Button>
                    </div>
                  ))}
                  {claimTxId && (
                    <TransactionIdDisplay txId={claimTxId} />
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center space-y-2">
                  <p className="text-sm text-white/40">No bounty pledges found</p>
                  <p className="text-xs text-white/25 max-w-sm mx-auto">
                    You reported this item without a recovery bounty. To add a bounty,
                    report a new item from your Vault and enter a bounty amount during the report.
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* ── REPORT NEW ITEM ── */}
          {reportableItems.length > 0 ? (
            <Card className="border-red-500/20">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-red-500/15 p-1.5">
                  <StolenAlertIcon size={18} className="text-red-400" />
                </div>
                <h2 className="font-heading text-lg font-semibold text-red-400/80">
                  Report an Item
                </h2>
              </div>
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3">
                <p className="text-xs text-red-400/70">
                  Reporting is permanent. The item will be blacklisted on the blockchain.
                </p>
              </div>
              <div className="space-y-2 mb-4">
                {reportableItems.map((artifact) => (
                  <button
                    key={artifact.tagHash}
                    onClick={() => setSelectedArtifact(artifact)}
                    className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-all ${
                      selectedArtifact?.tagHash === artifact.tagHash
                        ? 'border-red-500/50 bg-red-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className={`rounded-lg p-2 ${
                      selectedArtifact?.tagHash === artifact.tagHash
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/60'
                    }`}>
                      <DiamondIcon size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="font-heading font-semibold text-white">
                        Model #{artifact.modelId || '?'}
                      </p>
                      <p className="font-mono text-xs text-white/40">
                        {formatAddress(artifact.tagHash, 8)}
                      </p>
                    </div>
                    <StatusBadge status="authentic" />
                  </button>
                ))}
              </div>
              <Button
                variant="danger"
                onClick={() => setConfirmModal(true)}
                disabled={!selectedArtifact}
                size="lg"
                className="w-full"
              >
                Report as Stolen
              </Button>
            </Card>
          ) : stolenItems.length === 0 ? (
            <Card className="border-white/10 text-center py-8">
              <DiamondIcon size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-sm text-white/40">No items in your wallet</p>
              <p className="mt-1 text-xs text-white/25">
                Mint or receive items first, then you can manage stolen reports here.
              </p>
            </Card>
          ) : null}

        </motion.div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-red-500/30 bg-onyx-900 p-6 shadow-2xl"
          >
            <div className="mb-4 text-center">
              <StolenAlertIcon size={48} className="mx-auto mb-4 text-red-500" />
              <h3 className="font-heading text-xl font-bold text-white">
                Confirm Report
              </h3>
            </div>

            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-center text-sm text-red-400">
                Are you absolutely sure you want to report this item as stolen?
                <br />
                <strong>This action cannot be undone.</strong>
              </p>
            </div>

            <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="font-heading text-lg font-semibold text-white">
                Model #{selectedArtifact?.modelId}
              </p>
              <p className="font-mono text-xs text-white/40">
                {formatAddress(selectedArtifact?.tagHash || '', 10)}
              </p>
            </div>

            <div className="mb-6">
              <Input
                label="Recovery Bounty (optional, ALEO)"
                placeholder="e.g. 1 — incentivize recovery"
                value={bountyAmount}
                onChange={setBountyAmount}
                type="number"
              />
              <p className="mt-2 text-xs text-white/30">
                Deposit Aleo credits as a bounty for item recovery. Leave empty for a standard report.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setConfirmModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleReport}
                loading={loading}
                className="flex-1"
              >
                Report Stolen
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
