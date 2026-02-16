import { FC, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5QrcodeScanner } from 'html5-qrcode';
import toast from 'react-hot-toast';
import {
  ScanIcon,
  CheckCircleIcon,
  XCircleIcon,
  StolenAlertIcon,
  DiamondIcon,
  LoadingSpinner,
} from '../components/icons/Icons';
import { Button, Card, StatusBadge } from '../components/ui/Components';
import { api } from '../lib/api';
import { formatAddress, checkStolenStatus } from '../lib/aleo';
import { useOnyxWallet } from '../hooks/useOnyxWallet';

interface ScanResult {
  valid: boolean;
  authentic?: boolean;
  stolen?: boolean;
  artifact?: {
    tagHash: string;
    brandAddress: string;
    brandName?: string;
    modelId: number;
    mintedAt: string;
    owner: string;
  };
  error?: string;
}

export const Scan: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const autoScanTriggered = useRef(false);
  const { fetchRecords } = useOnyxWallet();

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Auto-scan when tagHash is in URL query params (e.g. /scan?tagHash=123456)
  useEffect(() => {
    const tagHash = searchParams.get('tagHash');
    if (tagHash && !autoScanTriggered.current && !loading && !result) {
      autoScanTriggered.current = true;
      // Clear the query param so a page refresh won't re-trigger
      setSearchParams({}, { replace: true });
      handleScanResult(tagHash);
    }
  }, [searchParams]);

  const startScanner = () => {
    setScanning(true);
    setResult(null);

    setTimeout(() => {
      if (!scannerContainerRef.current) return;

      scannerRef.current = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        false
      );

      scannerRef.current.render(
        (decodedText: string) => {
          handleScanResult(decodedText);
          stopScanner();
        },
        (err: unknown) => {
          console.debug('[Scan] Error:', err);
        }
      );
    }, 100);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(console.error);
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScanResult = async (qrData: string) => {
    setLoading(true);
    try {
      let tagHash = qrData;
      // Parse tagHash from QR data or URL
      if (qrData.includes('tagHash=')) {
        const urlParams = new URLSearchParams(qrData.split('?')[1]);
        tagHash = urlParams.get('tagHash') || qrData;
      }
      // Clean up the tag hash (remove 'field' suffix if present)
      tagHash = tagHash.replace('field', '').trim();

      // 1. Check on-chain stolen mapping
      console.log('[Scan] Checking stolen status for tag:', tagHash);
      const isStolen = await checkStolenStatus(tagHash);
      console.log('[Scan] Stolen status:', isStolen);

      // 2. Try backend artifact lookup (has real model/brand data if mint was synced)
      let response;
      try {
        response = await api.verifyArtifact(tagHash);
      } catch {
        response = { status: 'unknown' as const, authentic: false, stolen: false, message: '' };
      }
      console.log('[Scan] Backend artifact response:', response);

      // 3. If backend has no artifact data, also check stolen registry (has metadata since fix)
      let stolenInfo: { stolen: boolean; modelId?: number; brandAddress?: string; mintedAt?: string; reportedBy?: string } | null = null;
      if (response.status === 'unknown' || !response.brandAddress) {
        try {
          stolenInfo = await api.checkStolenStatus(tagHash);
          console.log('[Scan] Backend stolen registry info:', stolenInfo);
        } catch {
          stolenInfo = null;
        }
      }

      // 4. Search wallet records (owner's own items)
      let walletArtifact = null;
      if (!response.brandAddress || response.status === 'unknown') {
        console.log('[Scan] Searching wallet records...');
        const walletRecords = await fetchRecords();
        
        type WalletRecord = {
          data?: { 
            tag_hash?: string; 
            brand?: string; 
            model_id?: string; 
            serial_hash?: string;
          };
          owner?: string;
        };
        
        walletArtifact = (walletRecords as WalletRecord[]).find((record) => {
          const recordTagHash = record.data?.tag_hash?.replace('.private', '').replace('field', '') || '';
          return recordTagHash === tagHash;
        });
        console.log('[Scan] Found wallet artifact:', walletArtifact);
      }

      // Helper: resolve brand display name from brand address
      const resolveBrandName = async (brandAddr: string): Promise<string> => {
        if (!brandAddr) return '';
        try {
          const brandList = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/brands`);
          const data = await brandList.json();
          // data.brands is an array of { address, displayName }
          const brands = Array.isArray(data.brands) ? data.brands : Object.values(data.brands || {});
          const brand = (brands as Array<{ address: string; displayName: string }>).find(
            (b) => b.address === brandAddr
          );
          return brand?.displayName || '';
        } catch {
          return '';
        }
      };

      // 5. Build result from the BEST available real data source
      // First determine the brand address from the best source
      let finalBrandAddress = '';
      if (walletArtifact) {
        finalBrandAddress = (walletArtifact.data?.brand || '').replace('.private', '').replace('.public', '');
      } else if (response.brandAddress) {
        finalBrandAddress = response.brandAddress;
      } else if (stolenInfo?.brandAddress) {
        finalBrandAddress = stolenInfo.brandAddress;
      }
      // Resolve brand display name
      const brandName = finalBrandAddress ? await resolveBrandName(finalBrandAddress) : '';

      if (walletArtifact) {
        // Best source: wallet records have full decrypted data
        const parseU64 = (val: string | undefined) => {
          if (!val) return 0;
          return parseInt(val.replace('.private', '').replace('.public', '').replace('u64', ''), 10);
        };
        const ownerAddr = (walletArtifact.owner || '').replace('.private', '').replace('.public', '');
        
        setResult({
          valid: true,
          authentic: !isStolen,
          stolen: isStolen,
          artifact: {
            tagHash,
            brandAddress: finalBrandAddress,
            brandName,
            modelId: parseU64(walletArtifact.data?.model_id),
            mintedAt: new Date().toISOString(),
            owner: ownerAddr,
          },
        });
      } else if (response.authentic || (response.status !== 'unknown' && response.brandAddress)) {
        // Second best: backend has full artifact data
        setResult({
          valid: true,
          authentic: response.authentic && !isStolen,
          stolen: isStolen || response.stolen,
          artifact: {
            tagHash,
            brandAddress: finalBrandAddress,
            brandName,
            modelId: response.modelId || 0,
            mintedAt: response.mintedAt || new Date().toISOString(),
            owner: 'private',
          },
        });
      } else if (isStolen && stolenInfo?.stolen) {
        // Third: item is stolen — use metadata from stolen registry
        setResult({
          valid: true,
          authentic: false,
          stolen: true,
          artifact: {
            tagHash,
            brandAddress: finalBrandAddress,
            brandName,
            modelId: stolenInfo.modelId || 0,
            mintedAt: stolenInfo.mintedAt || new Date().toISOString(),
            owner: 'private',
          },
        });
      } else if (isStolen) {
        // Fourth: on-chain says stolen but no backend metadata at all
        setResult({
          valid: true,
          authentic: false,
          stolen: true,
          artifact: {
            tagHash,
            brandAddress: '',
            brandName: '',
            modelId: 0,
            mintedAt: new Date().toISOString(),
            owner: 'private',
          },
        });
      } else {
        // Truly not found anywhere
        setResult({
          valid: false,
          error: 'Item not found - not registered on chain',
        });
      }
    } catch (err) {
      console.error('[Scan] Verification error:', err);
      setResult({
        valid: false,
        error: 'Item not found or invalid QR code',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualVerify = () => {
    if (!manualInput.trim()) {
      toast.error('Please enter a tag hash');
      return;
    }
    handleScanResult(manualInput.trim());
  };

  const resetScan = () => {
    setResult(null);
    setManualInput('');
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1 className="mb-2 font-heading text-4xl font-bold gold-gradient-text">
          Verify Authenticity
        </h1>
        <p className="text-white/50">
          Scan a product's QR code to verify its authenticity
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card gold-border flex flex-col items-center justify-center p-12"
          >
            <LoadingSpinner size={48} className="mb-4 text-champagne-400" />
            <p className="text-white/50">Verifying on-chain...</p>
          </motion.div>
        ) : result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className="overflow-hidden">
              <div
                className={`-mx-6 -mt-6 mb-6 p-8 text-center ${
                  result.stolen
                    ? 'bg-gradient-to-b from-red-900/50 to-transparent'
                    : result.authentic
                      ? 'bg-gradient-to-b from-champagne-900/30 to-transparent'
                      : 'bg-gradient-to-b from-white/5 to-transparent'
                }`}
              >
                {result.stolen ? (
                  <StolenAlertIcon size={64} className="mx-auto mb-4 text-red-500" />
                ) : result.authentic ? (
                  <CheckCircleIcon size={64} className="mx-auto mb-4 text-champagne-400" />
                ) : (
                  <XCircleIcon size={64} className="mx-auto mb-4 text-white/40" />
                )}

                <h2 className="font-heading text-2xl font-bold">
                  {result.stolen ? (
                    <span className="text-red-400">Reported Stolen</span>
                  ) : result.authentic ? (
                    <span className="gold-gradient-text">Authentic</span>
                  ) : (
                    <span className="text-white/50">Not Found</span>
                  )}
                </h2>
              </div>

              {result.artifact && (
                <div className="mb-6 space-y-4">
                  <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="rounded-lg bg-gradient-gold p-3 text-onyx-950">
                      <DiamondIcon size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="font-heading text-lg font-semibold text-white">
                        Model #{result.artifact.modelId}
                      </p>
                      <p className="font-mono text-xs text-white/40">
                        {formatAddress(result.artifact.tagHash, 10)}
                      </p>
                    </div>
                    <StatusBadge status={result.stolen ? 'stolen' : 'authentic'} />
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/40">Brand</span>
                      <span className="font-mono text-white/70">
                        {result.artifact.brandName || formatAddress(result.artifact.brandAddress, 6) || 'private'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-white/40">Current Owner</span>
                      <span className="font-mono text-white/70">
                        {formatAddress(result.artifact.owner, 6)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Minted</span>
                      <span className="text-white/70">
                        {new Date(result.artifact.mintedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!result.valid && (
                <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-white/50">{result.error}</p>
                </div>
              )}

              <Button onClick={resetScan} variant="secondary" className="w-full">
                Scan Another
              </Button>
            </Card>
          </motion.div>
        ) : scanning ? (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="overflow-hidden">
              <div
                id="qr-reader"
                ref={scannerContainerRef}
                className="mb-6 overflow-hidden rounded-lg"
              />
              <Button onClick={stopScanner} variant="secondary" className="w-full">
                Cancel
              </Button>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <Card className="text-center">
              <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-8">
                <ScanIcon size={64} className="mx-auto text-champagne-400" />
              </div>
              <Button onClick={startScanner} size="lg" className="w-full">
                Start Camera Scan
              </Button>
            </Card>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-onyx-950 px-4 text-white/30">or</span>
              </div>
            </div>

            <Card>
              <label className="mb-2 block text-sm font-medium text-white/60">
                Enter Tag Hash Manually
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. 12345field..."
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-white/30 outline-none transition-all focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
                />
                <Button onClick={handleManualVerify} disabled={!manualInput.trim()}>
                  Verify
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        #qr-reader {
          border: none !important;
        }
        #qr-reader video {
          border-radius: 0.5rem;
        }
        #qr-reader__dashboard_section_csr button {
          background: linear-gradient(135deg, #D4AF37, #C9A030) !important;
          color: #0D0D0D !important;
          border: none !important;
          border-radius: 0.5rem !important;
          padding: 0.75rem 1.5rem !important;
          font-weight: 600 !important;
        }
        #qr-reader__dashboard_section_csr span {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        #qr-reader__dashboard_section_csr select {
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: white !important;
          border-radius: 0.5rem !important;
          padding: 0.5rem !important;
        }
        #qr-reader__status_span {
          color: rgba(255, 255, 255, 0.5) !important;
          background: transparent !important;
        }
      `}</style>
    </div>
  );
};
