import { FC, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import toast from 'react-hot-toast';
import {
  ProofSealIcon,
  DiamondIcon,
  CheckCircleIcon,
  XCircleIcon,
  LoadingSpinner,
  ShieldIcon,
} from '../components/icons/Icons';
import { Button, Card, Input, StatusBadge } from '../components/ui/Components';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { api } from '../lib/api';
import { formatAddress } from '../lib/aleo';
import type { Artifact } from '../lib/types';

export const Prove: FC = () => {
  const [searchParams] = useSearchParams();
  const verifyToken = searchParams.get('token');

  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeProveForResale, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated, artifacts, setArtifacts } = useUserStore();

  const [mode, setMode] = useState<'generate' | 'verify'>(verifyToken ? 'verify' : 'generate');
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [salt, setSalt] = useState('');
  const [generatedProof, setGeneratedProof] = useState<{
    token: string;
    txId: string;
  } | null>(null);

  const [verifyInput, setVerifyInput] = useState(verifyToken || '');
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    artifact?: {
      tagHash: string;
      modelId: number;
      brandAddress: string;
    };
    error?: string;
  } | null>(null);

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  useEffect(() => {
    if (wallet.connected && mode === 'generate') {
      const token = localStorage.getItem('onyx_token');
      if (!isAuthenticated || !token) {
        handleAuth();
      }
    }
  }, [wallet.connected, mode]);

  useEffect(() => {
    if (isAuthenticated && walletAddress && mode === 'generate') {
      loadArtifacts();
    }
  }, [isAuthenticated, walletAddress, mode]);

  useEffect(() => {
    if (verifyToken) {
      handleVerify(verifyToken);
    }
  }, [verifyToken]);

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
      console.error('[Prove] Load artifacts error:', err);
      toast.error('Failed to load artifacts');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGenerateProof = async () => {
    if (!selectedArtifact) return;

    const proofSalt = salt || Math.floor(Math.random() * 1000000000).toString();
    const result = await executeProveForResale(selectedArtifact, proofSalt);

    if (result) {
      setGeneratedProof(result);
      try {
        await api.submitProof({
          tagHash: selectedArtifact.tagHash,
          token: result.token,
          txId: result.txId,
        });
      } catch (err) {
        console.error('[Prove] Backend error:', err);
      }
    }
  };

  const handleVerify = async (token?: string) => {
    const tokenToVerify = token || verifyInput;
    if (!tokenToVerify) {
      toast.error('Please enter a proof token');
      return;
    }

    setLocalLoading(true);
    try {
      const response = await api.verifyProof(tokenToVerify);
      setVerifyResult({
        valid: response.valid,
        artifact: response.artifact,
      });
    } catch (err) {
      console.error('[Prove] Verify error:', err);
      setVerifyResult({
        valid: false,
        error: 'Invalid or expired proof token',
      });
    } finally {
      setLocalLoading(false);
    }
  };

  const resetGenerate = () => {
    setGeneratedProof(null);
    setSelectedArtifact(null);
    setSalt('');
    loadArtifacts();
  };

  const resetVerify = () => {
    setVerifyResult(null);
    setVerifyInput('');
  };

  const renderModeToggle = () => (
    <div className="mb-8 flex justify-center">
      <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setMode('generate')}
          className={`rounded-md px-6 py-2 text-sm font-medium transition-all ${
            mode === 'generate'
              ? 'bg-gradient-gold text-onyx-950'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Generate Proof
        </button>
        <button
          onClick={() => setMode('verify')}
          className={`rounded-md px-6 py-2 text-sm font-medium transition-all ${
            mode === 'verify'
              ? 'bg-gradient-gold text-onyx-950'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Verify Proof
        </button>
      </div>
    </div>
  );

  if (mode === 'verify') {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Resale Verification
          </h1>
          <p className="text-white/50">Verify a seller's proof of ownership</p>
        </motion.div>

        {renderModeToggle()}

        <AnimatePresence mode="wait">
          {localLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <LoadingSpinner size={48} className="mb-4 text-champagne-400" />
              <p className="text-white/50">Verifying proof...</p>
            </motion.div>
          ) : verifyResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="overflow-hidden">
                <div
                  className={`-mx-6 -mt-6 mb-6 p-8 text-center ${
                    verifyResult.valid
                      ? 'bg-gradient-to-b from-champagne-900/30 to-transparent'
                      : 'bg-gradient-to-b from-red-900/30 to-transparent'
                  }`}
                >
                  {verifyResult.valid ? (
                    <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
                  ) : (
                    <XCircleIcon size={64} className="mx-auto mb-4 text-red-400" />
                  )}
                  <h2 className="font-heading text-2xl font-bold">
                    {verifyResult.valid ? (
                      <span className="gold-gradient-text">Proof Valid</span>
                    ) : (
                      <span className="text-red-400">Invalid Proof</span>
                    )}
                  </h2>
                </div>

                {verifyResult.valid && verifyResult.artifact && (
                  <div className="mb-6 space-y-4">
                    <div className="flex items-center gap-4 rounded-lg border border-champagne-500/20 bg-champagne-500/10 p-4">
                      <div className="rounded-lg bg-gradient-gold p-3 text-onyx-950">
                        <DiamondIcon size={24} />
                      </div>
                      <div className="flex-1">
                        <p className="font-heading text-lg font-semibold text-white">
                          Model #{verifyResult.artifact.modelId}
                        </p>
                        <p className="font-mono text-xs text-white/40">
                          {formatAddress(verifyResult.artifact.tagHash, 10)}
                        </p>
                      </div>
                      <StatusBadge status="authentic" />
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2 text-champagne-400">
                        <ShieldIcon size={18} />
                        <span className="text-sm font-medium">Verified Seller</span>
                      </div>
                      <p className="mt-2 text-sm text-white/50">
                        The seller has cryptographically proven they own this item.
                        This proof was generated on the Aleo blockchain.
                      </p>
                    </div>
                  </div>
                )}

                {!verifyResult.valid && (
                  <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
                    <p className="text-red-400">
                      {verifyResult.error || 'This proof is invalid or has expired.'}
                    </p>
                  </div>
                )}

                <Button onClick={resetVerify} variant="secondary" className="w-full">
                  Verify Another
                </Button>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                    <ProofSealIcon size={32} className="text-champagne-400" />
                  </div>
                  <p className="text-sm text-white/50">
                    Enter the proof token provided by the seller
                  </p>
                </div>

                <Input
                  label="Proof Token"
                  placeholder="Enter proof token..."
                  value={verifyInput}
                  onChange={setVerifyInput}
                />

                <Button
                  onClick={() => handleVerify()}
                  disabled={!verifyInput.trim()}
                  size="lg"
                  className="mt-6 w-full"
                >
                  Verify Proof
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (!wallet.connected) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Resale Proof
          </h1>
          <p className="text-white/50">Generate or verify ownership proofs</p>
        </motion.div>

        {renderModeToggle()}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12 text-center"
        >
          <ProofSealIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h2 className="mb-4 font-heading text-2xl font-bold text-white">
            Connect to Generate Proofs
          </h2>
          <p className="mb-8 text-white/50">
            Connect your wallet to generate ownership proofs for your items
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
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Resale Proof
          </h1>
          <p className="text-white/50">Generate or verify ownership proofs</p>
        </motion.div>

        {renderModeToggle()}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12 text-center"
        >
          <ProofSealIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h2 className="mb-4 font-heading text-2xl font-bold text-white">
            Authenticate to Continue
          </h2>
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

  if (generatedProof) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
            Resale Proof
          </h1>
          <p className="text-white/50">Generate or verify ownership proofs</p>
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
                Proof Generated!
              </h2>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-champagne-500/30 bg-champagne-500/10 p-4">
                <p className="mb-2 text-xs text-champagne-400">Proof Token</p>
                <code className="block break-all font-mono text-sm text-white">
                  {generatedProof.token}
                </code>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Transaction</p>
                <p className="break-all font-mono text-sm text-white">
                  {formatAddress(generatedProof.txId, 12)}
                </p>
              </div>

              <p className="text-center text-sm text-white/40">
                Share this proof token with potential buyers so they can verify
                your ownership.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(generatedProof.token);
                  toast.success('Copied to clipboard!');
                }}
                className="flex-1"
              >
                Copy Token
              </Button>
              <Button onClick={resetGenerate} className="flex-1">
                Generate Another
              </Button>
            </div>
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
        className="mb-8 text-center"
      >
        <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
          Resale Proof
        </h1>
        <p className="text-white/50">Generate or verify ownership proofs</p>
      </motion.div>

      {renderModeToggle()}

      {localLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size={48} className="text-champagne-400" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-white/60">
                Select Item to Prove
              </label>
              {artifacts.filter((a) => !a.stolen && a._fromWallet).length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
                  <DiamondIcon size={32} className="mx-auto mb-2 text-white/30" />
                  <p className="text-sm text-white/40">
                    No items available for proof generation
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
              label="Salt (optional)"
              placeholder="Random number for additional privacy"
              value={salt}
              onChange={setSalt}
              disabled={!selectedArtifact}
            />

            <Button
              onClick={handleGenerateProof}
              loading={loading}
              disabled={!selectedArtifact}
              size="lg"
              className="mt-6 w-full"
            >
              Generate Proof
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
                How Resale Proofs Work
              </h3>
              <ul className="space-y-2 text-sm text-white/40">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  Proofs are generated on-chain using zero-knowledge cryptography
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  Buyers can verify your ownership without seeing private details
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-500/50" />
                  Each proof is unique and tied to your wallet address
                </li>
              </ul>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};
