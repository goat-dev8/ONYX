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
import { formatAddress } from '../lib/aleo';
import { TransactionIdDisplay } from '../components/ui/PendingTx';
import type { Artifact } from '../lib/types';

export const Stolen: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeReportStolen, executeReportStolenWithBounty, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated, artifacts, setArtifacts } = useUserStore();

  const [localLoading, setLocalLoading] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [bountyAmount, setBountyAmount] = useState('');
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
      loadArtifacts();
    }
  }, [isAuthenticated, walletAddress]);

  const handleAuth = async () => {
    await authenticate();
  };

  const loadArtifacts = async () => {
    setLocalLoading(true);
    try {
      const response = await api.getMyArtifacts();
      const backendArtifacts = response.artifacts as unknown as Artifact[];

      try {
        const walletRecords = await fetchRecords();
        const enrichedArtifacts = backendArtifacts.map((artifact) => {
          const walletRecord = (walletRecords as Array<{ data?: { tag_hash?: string }; _plaintext?: string }>).find(
            (r) => r.data?.tag_hash?.includes(artifact.tagHash)
          );
          return {
            ...artifact,
            _fromWallet: !!walletRecord,
            _plaintext: walletRecord?._plaintext,
            _raw: walletRecord,
          };
        });
        setArtifacts(enrichedArtifacts);
      } catch {
        setArtifacts(backendArtifacts);
      }
    } catch (err) {
      console.error('[Stolen] Load artifacts error:', err);
      toast.error('Failed to load artifacts');
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
      txId = await executeReportStolenWithBounty(selectedArtifact, bountyValue);
    } else {
      txId = await executeReportStolen(selectedArtifact);
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
    loadArtifacts();
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

  return (
    <div className="mx-auto max-w-2xl py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="mb-2 font-heading text-4xl font-bold text-red-400">
          Report Stolen
        </h1>
        <p className="text-white/50">
          Mark an item as stolen to alert future scanners
        </p>
      </motion.div>

      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size={48} className="text-red-400" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-red-500/20">
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <StolenAlertIcon size={24} className="shrink-0 text-red-400" />
                <div>
                  <p className="font-semibold text-red-400">Warning</p>
                  <p className="text-sm text-red-400/70">
                    Reporting an item as stolen is permanent and cannot be undone.
                    The item will be blacklisted on the blockchain.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-white/60">
                Select Item to Report
              </label>
              {artifacts.filter((a) => !a.stolen && a._fromWallet).length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
                  <DiamondIcon size={32} className="mx-auto mb-2 text-white/30" />
                  <p className="text-sm text-white/40">
                    No items available to report
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {artifacts
                    .filter((a) => !a.stolen && a._fromWallet)
                    .map((artifact) => (
                      <button
                        key={artifact.tagHash}
                        onClick={() => setSelectedArtifact(artifact)}
                        className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-all ${
                          selectedArtifact?.tagHash === artifact.tagHash
                            ? 'border-red-500/50 bg-red-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div
                          className={`rounded-lg p-2 ${
                            selectedArtifact?.tagHash === artifact.tagHash
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          <DiamondIcon size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="font-heading font-semibold text-white">
                            Model #{artifact.modelId}
                          </p>
                          <p className="font-mono text-xs text-white/40">
                            {formatAddress(artifact.tagHash, 8)}
                          </p>
                        </div>
                        <StatusBadge status="authentic" />
                      </button>
                    ))}
                </div>
              )}
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

          {artifacts.filter((a) => a.stolen).length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-6"
            >
              <Card className="border-red-500/10 bg-onyx-900/50">
                <h3 className="mb-3 font-heading text-sm font-semibold text-red-400/70">
                  Previously Reported Stolen
                </h3>
                <div className="space-y-2">
                  {artifacts
                    .filter((a) => a.stolen)
                    .map((artifact) => (
                      <div
                        key={artifact.tagHash}
                        className="flex items-center gap-3 rounded-lg border border-red-500/10 bg-red-500/5 p-3"
                      >
                        <DiamondIcon size={16} className="text-red-400/50" />
                        <div className="flex-1">
                          <p className="text-sm text-white/50">
                            Model #{artifact.modelId}
                          </p>
                          <p className="font-mono text-xs text-white/30">
                            {formatAddress(artifact.tagHash, 8)}
                          </p>
                        </div>
                        <StatusBadge status="stolen" />
                      </div>
                    ))}
                </div>
              </Card>
            </motion.div>
          )}
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
