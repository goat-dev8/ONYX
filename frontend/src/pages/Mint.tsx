import { FC, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast';
import {
  TagIcon,
  DiamondIcon,
  QRCodeIcon,
  CheckCircleIcon,
} from '../components/icons/Icons';
import { Button, Card, Input, Modal } from '../components/ui/Components';
import { PendingTxBanner, TransactionIdDisplay } from '../components/ui/PendingTx';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { usePendingTxStore } from '../stores/pendingTxStore';
import { formatAddress } from '../lib/aleo';
import { api } from '../lib/api';

export const Mint: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeMint, executeRegisterBrand, executeAuthorizeBrand, loading } = useOnyxWallet();
  const { user, isAuthenticated, isBrand, setUser } = useUserStore();
  const { addPendingTx } = usePendingTxStore();

  const [modelId, setModelId] = useState('');
  const [tagHash, setTagHash] = useState('');
  const [brandName, setBrandName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [mintedResult, setMintedResult] = useState<{
    tagHash: string;
    txId: string;
  } | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  useEffect(() => {
    if (wallet.connected) {
      const token = localStorage.getItem('onyx_token');
      if (!isAuthenticated || !token) {
        handleAuth();
      } else if (!isBrand) {
        // Already authenticated but not marked as brand — check backend
        checkExistingBrand();
      }
    }
  }, [wallet.connected, isAuthenticated]);

  const checkExistingBrand = async () => {
    try {
      const { brand } = await api.getMyBrand();
      if (brand) {
        setUser({
          ...user!,
          role: 'brand',
          brand: { address: brand.address, displayName: brand.displayName },
          brandName: brand.displayName,
        });
      }
    } catch {
      // Not a brand yet — that's fine
    }
  };

  const handleAuth = async () => {
    await authenticate();
  };

  const generateTagHash = () => {
    const random = Math.floor(Math.random() * 1e15);
    setTagHash(`${random}field`);
  };

  const handleMint = async () => {
    if (!modelId || !tagHash) {
      toast.error('Please fill in all fields');
      return;
    }

    const modelIdNum = parseInt(modelId, 10);
    if (isNaN(modelIdNum) || modelIdNum <= 0) {
      toast.error('Model ID must be a positive number');
      return;
    }

    const serialHash = Math.floor(Math.random() * 1e15).toString();
    const cleanTagHash = tagHash.replace('field', '');
    const result = await executeMint(
      cleanTagHash,
      serialHash,
      modelIdNum,
      walletAddress!
    );

    if (result) {
      // Track as pending for UX feedback
      addPendingTx({
        id: result,
        type: 'mint',
        meta: { tagHash: cleanTagHash, modelId: modelIdNum },
      });

      // Also register artifact in backend for verification lookups
      try {
        await api.mintArtifact({
          tagHash: cleanTagHash,
          modelId: modelIdNum,
          serialHash,
          initialOwner: walletAddress!,
          txId: result,
        });
        console.log('[Mint] Artifact registered in backend');
      } catch (err) {
        console.warn('[Mint] Backend registration failed (artifact still exists on-chain):', err);
      }

      setMintedResult({
        tagHash: cleanTagHash,
        txId: result,
      });
      setModelId('');
      setTagHash('');
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
          <TagIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold gold-gradient-text">
            Mint Product Passports
          </h1>
          <p className="mb-8 text-white/50">
            Connect your wallet to mint authenticated product passports
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
          <TagIcon size={64} className="mx-auto mb-6 text-champagne-400" />
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

  if (!isBrand) {
    const handleRegisterBrand = async () => {
      if (!brandName.trim()) {
        toast.error('Please enter a brand name');
        return;
      }
      
      setRegistering(true);
      try {
        const result = await api.registerBrand(brandName.trim());
        if (result.success) {
          // Register this brand on-chain (v3: self-registration, any user can call)
          toast.loading('Registering brand on-chain...', { id: 'brand-chain' });
          try {
            await executeRegisterBrand();
          } catch (chainErr) {
            console.warn('[Mint] On-chain brand registration failed:', chainErr);
            // Try v2 fallback (admin-only authorize_brand)
            try {
              await executeAuthorizeBrand(walletAddress!);
            } catch (v2Err) {
              console.warn('[Mint] v2 authorize_brand also failed (expected for non-admin):', v2Err);
            }
          }
          toast.dismiss('brand-chain');

          // Update user state to reflect brand status
          setUser({
            ...user!,
            role: 'brand',
            brand: result.brand,
            brandName: result.brand.displayName,
          });
          toast.success(`Brand "${brandName}" registered successfully!`);
        }
      } catch (err) {
        console.error('Brand registration error:', err);
        const msg = err instanceof Error ? err.message : 'Registration failed';
        if (msg.includes('already registered')) {
          // Brand exists in backend — just load it
          try {
            const { brand } = await api.getMyBrand();
            if (brand) {
              setUser({
                ...user!,
                role: 'brand',
                brand: { address: brand.address, displayName: brand.displayName },
                brandName: brand.displayName,
              });
              toast.success(`Welcome back, ${brand.displayName}!`);
            }
          } catch {
            toast.error('Could not load existing brand');
          }
        } else if (msg.includes('Invalid or expired token') || msg.includes('Missing or invalid')) {
          toast.error('Session expired — re-authenticating...');
          const ok = await authenticate();
          if (ok) {
            toast('Please try registering again.');
          }
        } else {
          toast.error(msg);
        }
      } finally {
        setRegistering(false);
      }
    };

    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border p-12"
        >
          <TagIcon size={64} className="mx-auto mb-6 text-champagne-400" />
          <h1 className="mb-4 font-heading text-3xl font-bold gold-gradient-text">
            Register Your Brand
          </h1>
          <p className="mb-6 text-white/50">
            Register as a luxury brand to mint authenticated product passports
          </p>
          
          <div className="mb-6">
            <Input
              placeholder="Enter your brand name (e.g., Rolex)"
              value={brandName}
              onChange={(val) => setBrandName(val)}
            />
          </div>
          
          <Button 
            onClick={handleRegisterBrand} 
            loading={registering} 
            size="lg"
            disabled={!brandName.trim()}
          >
            Register Brand
          </Button>
          
          <p className="mt-6 text-sm text-white/30">
            Connected as: {formatAddress(walletAddress || '', 8)}
          </p>
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
          Mint Product Passport
        </h1>
        <p className="text-white/50">
          Create an on-chain certificate of authenticity for your product
        </p>
      </motion.div>

      {/* Pending transaction banners */}
      <PendingTxBanner types={['mint', 'register_brand']} />

      {mintedResult ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="overflow-hidden">
            <div className="-mx-6 -mt-6 mb-6 bg-gradient-to-b from-champagne-900/30 to-transparent p-8 text-center">
              <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
              <h2 className="font-heading text-2xl font-bold gold-gradient-text">
                Successfully Minted!
              </h2>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="mb-1 text-xs text-white/40">Tag Hash</p>
                <p className="break-all font-mono text-sm text-white">
                  {mintedResult.tagHash}
                </p>
              </div>
              <TransactionIdDisplay txId={mintedResult.txId} label="Transaction ID" />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setQrModalOpen(true)}
                variant="secondary"
                className="flex-1"
              >
                <QRCodeIcon size={18} className="mr-2" />
                View QR Code
              </Button>
              <Button onClick={() => setMintedResult(null)} className="flex-1">
                Mint Another
              </Button>
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card>
            <div className="mb-6 flex items-center gap-4 rounded-lg border border-champagne-500/20 bg-champagne-500/10 p-4">
              <div className="rounded-lg bg-gradient-gold p-3 text-onyx-950">
                <DiamondIcon size={24} />
              </div>
              <div>
                <p className="font-heading font-semibold text-white">
                  {user?.brandName || 'Your Brand'}
                </p>
                <p className="font-mono text-xs text-white/40">
                  {formatAddress(walletAddress || '', 8)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                label="Model ID"
                type="number"
                placeholder="e.g. 1001"
                value={modelId}
                onChange={setModelId}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-white/60">
                  Tag Hash (NFC/RFID identifier)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagHash}
                    onChange={(e) => setTagHash(e.target.value)}
                    placeholder="e.g. 123456789field"
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-white/30 outline-none transition-all focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
                  />
                  <Button variant="secondary" onClick={generateTagHash}>
                    Generate
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleMint}
                loading={loading}
                disabled={!modelId || !tagHash}
                size="lg"
                className="mt-6 w-full"
              >
                Mint Passport
              </Button>
            </div>
          </Card>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-6"
          >
            <Card className="border-champagne-500/10 bg-onyx-900/50">
              <h3 className="mb-3 font-heading text-sm font-semibold text-white/70">
                How it works
              </h3>
              <ol className="space-y-2 text-sm text-white/40">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-champagne-500/20 text-xs text-champagne-400">
                    1
                  </span>
                  Enter a unique model ID for your product
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-champagne-500/20 text-xs text-champagne-400">
                    2
                  </span>
                  Generate or enter the NFC/RFID tag hash
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-champagne-500/20 text-xs text-champagne-400">
                    3
                  </span>
                  Sign the transaction to mint on-chain
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-champagne-500/20 text-xs text-champagne-400">
                    4
                  </span>
                  Print the QR code for your product
                </li>
              </ol>
            </Card>
          </motion.div>
        </motion.div>
      )}

      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Product QR Code"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 inline-block rounded-xl border border-white/10 bg-white p-4">
            <QRCodeCanvas
              id="onyx-qr-canvas"
              value={`${window.location.origin}/scan?tagHash=${mintedResult?.tagHash}`}
              size={200}
              level="H"
              includeMargin
            />
          </div>
          <p className="mb-4 text-sm text-white/50">
            Scan this code to verify authenticity
          </p>
          <Button
            onClick={() => {
              const canvas = document.getElementById('onyx-qr-canvas') as HTMLCanvasElement;
              if (canvas) {
                const link = document.createElement('a');
                link.download = `onyx-qr-${mintedResult?.tagHash}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
              }
            }}
            variant="secondary"
            className="w-full"
          >
            Download QR Code
          </Button>
        </div>
      </Modal>
    </div>
  );
};
