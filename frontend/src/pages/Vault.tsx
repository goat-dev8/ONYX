import { FC, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import toast from 'react-hot-toast';
import {
  VaultIcon,
  DiamondIcon,
  TransferIcon,
  StolenAlertIcon,
  ProofSealIcon,
  LoadingSpinner,
} from '../components/icons/Icons';
import { Button, Card, Modal, Input, StatusBadge } from '../components/ui/Components';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { api } from '../lib/api';
import { formatAddress, checkStolenStatus, saveLocalStolenTag } from '../lib/aleo';
import type { Artifact } from '../lib/types';

export const Vault: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeTransfer, executeReportStolen, executeProveForResale, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated, artifacts, setArtifacts } = useUserStore();
  
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  
  const [transferModal, setTransferModal] = useState(false);
  const [stolenModal, setStolenModal] = useState(false);
  const [proofModal, setProofModal] = useState(false);
  
  const [transferAddress, setTransferAddress] = useState('');
  const [proofSalt, setProofSalt] = useState('');
  const [generatedProof, setGeneratedProof] = useState<string | null>(null);

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
      // First fetch wallet records (they contain the actual on-chain artifacts)
      const walletRecords = await fetchRecords();
      console.log('[Vault] Wallet records:', walletRecords);
      
      // Parse wallet records into artifacts
      if (walletRecords.length > 0) {
        // Filter out non-AssetArtifact records (MintCertificate, ProofToken, etc.)
        const artifactRecords = walletRecords.filter((r: Record<string, unknown>) => {
          if (r._isMintCertificate || r._isProofToken || r._isProofChallenge || r._isBountyPledge || r._isEscrowReceipt || r._isBuyerReceipt) {
            console.log('[Vault] Skipping non-AssetArtifact record:', r._isMintCertificate ? 'MintCertificate' : r._isProofToken ? 'ProofToken' : r._isProofChallenge ? 'ProofChallenge' : r._isBountyPledge ? 'BountyPledge' : r._isEscrowReceipt ? 'EscrowReceipt' : 'BuyerReceipt');
            return false;
          }
          return true;
        });
        console.log('[Vault] Filtered to', artifactRecords.length, 'AssetArtifact records from', walletRecords.length, 'total');

        const walletArtifacts: Artifact[] = (artifactRecords as Array<{
          data?: { 
            tag_hash?: string; 
            serial_hash?: string; 
            model_id?: string; 
            brand?: string;
            nonce_seed?: string;
          };
          owner?: string;
          _plaintext?: string;
          _raw?: { id?: string; ciphertext?: string };
          _commitment?: string;
          _blockHeight?: number;
          id?: string;
          ciphertext?: string;
        }>).map((record, idx) => {
          // Strip visibility/type suffixes from Aleo values
          const parseField = (val: string | undefined) => {
            if (!val) return '';
            return val.replace(/\.private$/, '').replace(/\.public$/, '').replace(/field$/, '').trim();
          };
          const parseAddress = (val: string | undefined) => {
            if (!val) return '';
            return val.replace(/\.private$/, '').replace(/\.public$/, '').trim();
          };
          const parseU64 = (val: string | undefined) => {
            if (!val) return 0;
            const cleaned = val.replace(/\.private$/, '').replace(/\.public$/, '').replace(/u64$/, '').trim();
            return parseInt(cleaned, 10) || 0;
          };

          // Data should already be enriched by fetchRecords (which tries wallet data,
          // inline decrypt, and Aleo API decrypt fallback)
          const data = (record.data || {}) as Record<string, string>;

          const tagHashRaw = data.tag_hash || '';
          const serialHashRaw = data.serial_hash || '';
          const modelIdRaw = data.model_id || '';
          const brandRaw = data.brand || '';
          const ownerRaw = record.owner || parseAddress(data.owner || '');

          console.log(`[Vault] Record ${idx} fields:`, { tagHashRaw, serialHashRaw, modelIdRaw, brandRaw, ownerRaw,
            commitment: record._commitment?.substring(0, 20),
            hasPlaintext: !!record._plaintext,
            dataKeys: Object.keys(data).filter(k => !!data[k]),
          });
          
          // Use commitment as a stable unique ID since tagHash may be empty
          const stableId = record._commitment || record.id || `wallet_${idx}_${Date.now()}`;
          
          return {
            id: stableId,
            tagHash: parseField(tagHashRaw),
            serialHash: parseField(serialHashRaw),
            modelId: parseU64(modelIdRaw),
            brandAddress: parseAddress(brandRaw),
            currentOwner: parseAddress(ownerRaw),
            ownerAddress: parseAddress(ownerRaw),
            status: 'active' as const,
            mintedAt: new Date().toISOString(),
            stolen: false,
            createdTxId: '',
            lastUpdateTxId: '',
            _fromWallet: true,
            _plaintext: record._plaintext,
            _raw: record._raw || { id: record.id, ciphertext: record.ciphertext },
          };
        });

        // If wallet records have empty data, try to enrich from backend
        const needsEnrichment = walletArtifacts.some(a => !a.tagHash);
        if (needsEnrichment) {
          console.log('[Vault] Wallet records have empty fields, trying backend enrichment...');
          try {
            const response = await api.getMyArtifacts();
            const backendArtifacts = response.artifacts as unknown as Artifact[];
            if (backendArtifacts && backendArtifacts.length > 0) {
              console.log('[Vault] Backend has', backendArtifacts.length, 'artifacts, merging...');
              // Merge backend data into wallet artifacts by index order
              // (both lists are ordered by mint time, so they should align)
              walletArtifacts.forEach((wa, i) => {
                if (!wa.tagHash && backendArtifacts[i]) {
                  const ba = backendArtifacts[i];
                  wa.tagHash = ba.tagHash || wa.tagHash;
                  wa.serialHash = ba.serialHash || wa.serialHash;
                  wa.modelId = ba.modelId || wa.modelId;
                  wa.brandAddress = ba.brandAddress || wa.brandAddress;
                  wa.createdTxId = ba.createdTxId || '';
                  wa.mintedAt = ba.mintedAt || wa.mintedAt;
                  console.log(`[Vault] Enriched record ${i} from backend:`, { tagHash: wa.tagHash, modelId: wa.modelId });
                }
              });
            }
          } catch (err) {
            console.log('[Vault] Backend enrichment failed (non-critical):', err);
          }
        }
        
        // Check stolen status for each artifact from on-chain mapping
        // Skip check if tagHash is empty to avoid 404 errors
        const artifactsWithStolenStatus = await Promise.all(
          walletArtifacts.map(async (artifact) => {
            if (!artifact.tagHash) {
              return { ...artifact, stolen: false };
            }
            const isStolen = await checkStolenStatus(artifact.tagHash);
            return { ...artifact, stolen: isStolen };
          })
        );
        
        console.log('[Vault] Parsed wallet artifacts with stolen status:', artifactsWithStolenStatus);
        setArtifacts(artifactsWithStolenStatus);
      } else {
        // Fallback to backend artifacts if no wallet records
        try {
          const response = await api.getMyArtifacts();
          const backendArtifacts = response.artifacts as unknown as Artifact[];
          setArtifacts(backendArtifacts);
        } catch {
          setArtifacts([]);
        }
      }
    } catch (err) {
      console.error('[Vault] Load artifacts error:', err);
      toast.error('Failed to load artifacts');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedArtifact || !transferAddress) return;

    const txId = await executeTransfer(selectedArtifact, transferAddress);
    if (txId) {
      // On-chain transfer succeeded! Show success immediately
      toast.success('Transfer successful! Item transferred on-chain.');
      setTransferModal(false);
      setTransferAddress('');
      
      // Try to notify backend (optional, may fail if artifact not in DB)
      try {
        await api.transferArtifact({
          tagHash: selectedArtifact.tagHash,
          to: transferAddress,
          txId,
        });
      } catch (err) {
        // Backend notification failed - this is OK, on-chain transfer already succeeded
        console.log('[Vault] Backend sync skipped (artifact not in DB):', err);
      }
      
      // Refresh wallet records
      loadArtifacts();
    }
  };

  const handleReportStolen = async () => {
    if (!selectedArtifact) return;

    const txId = await executeReportStolen(selectedArtifact);
    if (txId) {
      // On-chain report succeeded!
      toast.success('Item reported as stolen on-chain!');
      setStolenModal(false);
      
      // CRITICAL: Save to localStorage FIRST for persistence
      // This ensures stolen status survives even if backend resets
      saveLocalStolenTag(selectedArtifact.tagHash, txId, walletAddress || undefined);
      console.log('[Vault] Saved stolen tag to localStorage');
      
      // Update backend registry with full artifact metadata for cross-account lookups
      try {
        await api.reportStolen({
          tagHash: selectedArtifact.tagHash,
          txId,
          modelId: selectedArtifact.modelId,
          brandAddress: selectedArtifact.brandAddress,
          serialHash: selectedArtifact.serialHash,
        });
        console.log('[Vault] Backend stolen registry updated with artifact metadata');
      } catch (err) {
        console.error('[Vault] Backend stolen update failed:', err);
        // Still show success since on-chain worked AND we saved locally
      }
      
      // Immediately update local state to show stolen status
      setArtifacts(artifacts.map((a: Artifact) => 
        a.tagHash === selectedArtifact.tagHash 
          ? { ...a, stolen: true }
          : a
      ));
      
      // Also reload to get fresh data
      setTimeout(() => loadArtifacts(), 2000);
    }
  };

  const handleGenerateProof = async () => {
    if (!selectedArtifact) return;

    const salt = proofSalt || Math.floor(Math.random() * 1000000000).toString();
    const result = await executeProveForResale(selectedArtifact, salt);
    if (result) {
      setGeneratedProof(result.token);
      toast.success('Proof generated successfully!');
      
      // Try to notify backend (optional)
      try {
        await api.submitProof({
          tagHash: selectedArtifact.tagHash,
          token: result.token,
          txId: result.txId,
        });
      } catch (err) {
        console.log('[Vault] Backend sync skipped:', err);
      }
    }
  };

  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <VaultIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold gold-gradient-text">
            Your Private Vault
          </h1>
          <p className="mb-8 text-white/50">
            Connect your wallet to access your authenticated luxury items
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
      <div className="mx-auto max-w-4xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <VaultIcon size={64} className="mx-auto mb-6 text-champagne-400" />
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

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
          My Vault
        </h1>
        <p className="text-white/50">
          {artifacts.length} authenticated item{artifacts.length !== 1 ? 's' : ''}
        </p>
      </motion.div>

      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size={48} className="text-champagne-400" />
        </div>
      ) : artifacts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card gold-border p-12 text-center"
        >
          <DiamondIcon size={48} className="mx-auto mb-4 text-white/30" />
          <h3 className="mb-2 font-heading text-xl text-white/70">No Items Yet</h3>
          <p className="text-sm text-white/40">
            Your authenticated luxury items will appear here
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence>
            {artifacts.map((artifact, index) => (
              <motion.div
                key={artifact.tagHash || artifact.id || `artifact_${index}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card hover className="h-full">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="rounded-lg bg-gradient-gold p-2 text-onyx-950">
                      <DiamondIcon size={24} />
                    </div>
                    <StatusBadge status={artifact.stolen ? 'stolen' : 'authentic'} />
                  </div>

                  <h3 className="mb-1 font-heading text-lg font-semibold text-white">
                    Model #{artifact.modelId}
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(artifact.tagHash);
                      toast.success('Tag hash copied!');
                    }}
                    className="mb-4 flex items-center gap-1 rounded bg-white/5 px-2 py-1 font-mono text-xs text-white/40 transition-colors hover:bg-white/10 hover:text-white/60"
                    title="Click to copy tag hash"
                  >
                    {formatAddress(artifact.tagHash, 8)}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>

                  <div className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/40">Brand</span>
                      <span className="text-white/70">
                        {formatAddress(artifact.brandAddress, 4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Minted</span>
                      <span className="text-white/70">
                        {new Date(artifact.mintedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedArtifact(artifact);
                        setTransferModal(true);
                      }}
                      disabled={artifact.stolen || !artifact._fromWallet}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:border-champagne-500/30 hover:text-champagne-400 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Transfer"
                    >
                      <TransferIcon size={18} className="mx-auto" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedArtifact(artifact);
                        setStolenModal(true);
                      }}
                      disabled={artifact.stolen || !artifact._fromWallet}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:border-red-500/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Report Stolen"
                    >
                      <StolenAlertIcon size={18} className="mx-auto" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedArtifact(artifact);
                        setProofModal(true);
                        setGeneratedProof(null);
                      }}
                      disabled={artifact.stolen || !artifact._fromWallet}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:border-champagne-500/30 hover:text-champagne-400 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Generate Proof"
                    >
                      <ProofSealIcon size={18} className="mx-auto" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Modal
        isOpen={transferModal}
        onClose={() => setTransferModal(false)}
        title="Transfer Ownership"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/50">
            Transfer this item to a new owner. This action is irreversible.
          </p>
          <Input
            label="Recipient Address"
            placeholder="aleo1..."
            value={transferAddress}
            onChange={setTransferAddress}
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setTransferModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!transferAddress}
              loading={loading}
              className="flex-1"
            >
              Transfer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={stolenModal}
        onClose={() => setStolenModal(false)}
        title="Report Stolen"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">
              <strong>Warning:</strong> This will permanently mark this item as stolen.
              Anyone scanning it will see the stolen status.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setStolenModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReportStolen}
              loading={loading}
              className="flex-1"
            >
              Report Stolen
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={proofModal}
        onClose={() => setProofModal(false)}
        title="Generate Resale Proof"
      >
        <div className="space-y-4">
          {!generatedProof ? (
            <>
              <p className="text-sm text-white/50">
                Generate a cryptographic proof for resale verification.
              </p>
              <Input
                label="Salt (optional)"
                placeholder="Random number for privacy"
                value={proofSalt}
                onChange={setProofSalt}
              />
              <Button onClick={handleGenerateProof} loading={loading} className="w-full">
                Generate Proof
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-champagne-500/30 bg-champagne-500/10 p-4">
                <p className="mb-2 text-xs text-champagne-400">Proof Token</p>
                <code className="block break-all font-mono text-sm text-white">
                  {generatedProof}
                </code>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(generatedProof);
                  toast.success('Copied to clipboard!');
                }}
                className="w-full"
              >
                Copy Proof
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
