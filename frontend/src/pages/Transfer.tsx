import { FC, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import toast from 'react-hot-toast';
import {
  TransferIcon,
  DiamondIcon,
  CheckCircleIcon,
  LoadingSpinner,
} from '../components/icons/Icons';
import { Button, Card, Input, StatusBadge } from '../components/ui/Components';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { api } from '../lib/api';
import { formatAddress } from '../lib/aleo';
import type { Artifact } from '../lib/types';

export const Transfer: FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedTag = searchParams.get('tag');

  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeTransfer, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated, artifacts, setArtifacts } = useUserStore();

  const [localLoading, setLocalLoading] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [transferComplete, setTransferComplete] = useState<{
    tagHash: string;
    to: string;
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

  useEffect(() => {
    if (preselectedTag && artifacts.length > 0) {
      const artifact = artifacts.find((a) => a.tagHash === preselectedTag);
      if (artifact) {
        setSelectedArtifact(artifact);
      }
    }
  }, [preselectedTag, artifacts]);

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
      console.error('[Transfer] Load artifacts error:', err);
      toast.error('Failed to load artifacts');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedArtifact || !recipientAddress) return;

    if (!recipientAddress.startsWith('aleo1')) {
      toast.error('Invalid recipient address');
      return;
    }

    const txId = await executeTransfer(selectedArtifact, recipientAddress);
    if (txId) {
      try {
        await api.transferArtifact({
          tagHash: selectedArtifact.tagHash,
          to: recipientAddress,
          txId,
        });
        setTransferComplete({
          tagHash: selectedArtifact.tagHash,
          to: recipientAddress,
          txId,
        });
      } catch (err) {
        console.error('[Transfer] Backend error:', err);
        setTransferComplete({
          tagHash: selectedArtifact.tagHash,
          to: recipientAddress,
          txId,
        });
      }
    }
  };

  const resetTransfer = () => {
    setTransferComplete(null);
    setSelectedArtifact(null);
    setRecipientAddress('');
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
          <TransferIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold gold-gradient-text">
            Transfer Ownership
          </h1>
          <p className="mb-8 text-white/50">
            Connect your wallet to transfer item ownership
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
          <TransferIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold gold-gradient-text">
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

  if (transferComplete) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="overflow-hidden">
            <div className="-mx-6 -mt-6 mb-6 bg-gradient-to-b from-champagne-900/30 to-transparent p-8 text-center">
              <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
              <h2 className="font-heading text-2xl font-bold gold-gradient-text">
                Transfer Complete!
              </h2>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Item</p>
                <p className="font-mono text-sm text-white">
                  {formatAddress(transferComplete.tagHash, 10)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">New Owner</p>
                <p className="font-mono text-sm text-white">
                  {formatAddress(transferComplete.to, 10)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Transaction</p>
                <p className="break-all font-mono text-sm text-white">
                  {formatAddress(transferComplete.txId, 12)}
                </p>
              </div>
            </div>

            <Button onClick={resetTransfer} className="w-full">
              Transfer Another
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
        <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
          Transfer Ownership
        </h1>
        <p className="text-white/50">
          Securely transfer item ownership to a new wallet
        </p>
      </motion.div>

      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size={48} className="text-champagne-400" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-white/60">
                Select Item to Transfer
              </label>
              {artifacts.filter((a) => !a.stolen && a._fromWallet).length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
                  <DiamondIcon size={32} className="mx-auto mb-2 text-white/30" />
                  <p className="text-sm text-white/40">
                    No transferable items in your vault
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
                            ? 'border-champagne-500/50 bg-champagne-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div
                          className={`rounded-lg p-2 ${
                            selectedArtifact?.tagHash === artifact.tagHash
                              ? 'bg-gradient-gold text-onyx-950'
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

            <Input
              label="Recipient Address"
              placeholder="aleo1..."
              value={recipientAddress}
              onChange={setRecipientAddress}
              disabled={!selectedArtifact}
            />

            <Button
              onClick={handleTransfer}
              loading={loading}
              disabled={!selectedArtifact || !recipientAddress}
              size="lg"
              className="mt-6 w-full"
            >
              Transfer Ownership
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
                Important
              </h3>
              <ul className="space-y-2 text-sm text-white/40">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  Transfers are permanent and cannot be reversed
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  Double-check the recipient address before confirming
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  The new owner will have full control over the item
                </li>
              </ul>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};
