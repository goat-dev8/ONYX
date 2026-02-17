import { FC, useState, useEffect, useCallback, useRef } from 'react';
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
  MarketplaceIcon,
  LoadingSpinner,
} from '../components/icons/Icons';
import { Button, Card, Modal, Input, StatusBadge } from '../components/ui/Components';
import { PendingTxBanner, PendingTxCard } from '../components/ui/PendingTx';
import { PendingSales } from '../components/PendingSales';
import { useOnyxWallet } from '../hooks/useOnyxWallet';
import { useUserStore } from '../stores/userStore';
import { usePendingTxStore } from '../stores/pendingTxStore';
import { api } from '../lib/api';
import { formatAddress, checkStolenStatus, saveLocalStolenTag } from '../lib/aleo';
import { computeBHP256Commitment } from '../lib/commitment';
import type { Artifact } from '../lib/types';

export const Vault: FC = () => {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const { authenticate, executeTransfer, executeReportStolen, executeProveForResale, executeCreateSale, executeCancelSale, fetchRecords, loading } = useOnyxWallet();
  const { isAuthenticated, artifacts, setArtifacts } = useUserStore();
  const { addPendingTx, hasPendingOfType, getPendingByType } = usePendingTxStore();
  
  const [localLoading, setLocalLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [saleRecords, setSaleRecords] = useState<Array<Record<string, unknown>>>([]);
  const [cancellingIdx, setCancellingIdx] = useState<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshRef = useRef<number>(0);
  
  const [transferModal, setTransferModal] = useState(false);
  const [stolenModal, setStolenModal] = useState(false);
  const [proofModal, setProofModal] = useState(false);
  
  const [transferAddress, setTransferAddress] = useState('');
  const [proofSalt, setProofSalt] = useState('');
  const [generatedProof, setGeneratedProof] = useState<string | null>(null);

  // Marketplace listing modal state
  const [listingModal, setListingModal] = useState(false);
  const [listingTitle, setListingTitle] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingCondition, setListingCondition] = useState<'new' | 'like_new' | 'good' | 'fair'>('new');
  const [listingPrice, setListingPrice] = useState('');
  const [listingCurrency, setListingCurrency] = useState<'aleo' | 'usdcx'>('aleo');
  const [listingImageUrl, setListingImageUrl] = useState('');
  const [listingLoading, setListingLoading] = useState(false);

  const walletAddress = wallet.connected
    ? (wallet as unknown as { address: string }).address
    : null;

  const handleAuth = async () => {
    await authenticate();
  };

  const loadArtifacts = useCallback(async (silent = false) => {
    // Debounce: skip if refreshed within last 2 seconds
    const now = Date.now();
    if (now - lastRefreshRef.current < 2000 && !silent) return;
    lastRefreshRef.current = now;

    if (!silent) setLocalLoading(true);
    try {
      // First fetch wallet records (they contain the actual on-chain artifacts)
      const walletRecords = await fetchRecords();
      console.log('[Vault] Wallet records:', walletRecords);
      
      // Parse wallet records into artifacts
      if (walletRecords.length > 0) {
        // Filter out non-AssetArtifact records (MintCertificate, ProofToken, SaleRecord, etc.)
        const saleRecs: Array<Record<string, unknown>> = [];
        const artifactRecords = walletRecords.filter((rec) => {
          const r = rec as Record<string, unknown>;
          if (r._isSaleRecord) {
            console.log('[Vault] Found SaleRecord — will show with cancel option');
            saleRecs.push(r);
            return false;
          }
          if (r._isMintCertificate || r._isProofToken || r._isProofChallenge || r._isBountyPledge || r._isEscrowReceipt || r._isBuyerReceipt || r._isPurchaseReceipt) {
            console.log('[Vault] Skipping non-AssetArtifact record:', r._isMintCertificate ? 'MintCertificate' : r._isProofToken ? 'ProofToken' : r._isProofChallenge ? 'ProofChallenge' : r._isBountyPledge ? 'BountyPledge' : r._isEscrowReceipt ? 'EscrowReceipt' : r._isPurchaseReceipt ? 'PurchaseReceipt' : 'BuyerReceipt');
            return false;
          }
          return true;
        });
        setSaleRecords(saleRecs);
        console.log('[Vault] Filtered to', artifactRecords.length, 'AssetArtifact records from', walletRecords.length, 'total,', saleRecs.length, 'SaleRecords');

        // Auto-register: update any backend sales with pending_ onChainSaleId
        if (saleRecs.length > 0 && isAuthenticated) {
          autoRegisterSaleRecords(saleRecs);
        }

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
      setInitialLoad(false);
    }
  }, [fetchRecords, isAuthenticated, walletAddress]);

  // Refresh callback for child components (PendingSales, PendingTxBanner, etc.)
  const handleChildRefresh = useCallback(() => {
    loadArtifacts(true);
  }, [loadArtifacts]);

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
  }, [isAuthenticated, walletAddress, loadArtifacts]);

  // Auto-refresh every 30s for pending transactions
  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    refreshTimerRef.current = setInterval(() => {
      loadArtifacts(true); // silent refresh
    }, 30_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isAuthenticated, walletAddress, loadArtifacts]);

  const handleTransfer = async () => {
    if (!selectedArtifact || !transferAddress) return;

    const txId = await executeTransfer(selectedArtifact, transferAddress);
    if (txId) {
      addPendingTx({
        id: txId,
        type: 'transfer',
        meta: { tagHash: selectedArtifact.tagHash, newOwner: transferAddress },
      });
      // On-chain transfer succeeded! Show success immediately
      toast.success('Transfer submitted! Waiting for confirmation...');
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
      addPendingTx({
        id: txId,
        type: 'report_stolen',
        meta: { tagHash: selectedArtifact.tagHash, modelId: selectedArtifact.modelId },
      });
      // On-chain report succeeded!
      toast.success('Stolen report submitted! Waiting for confirmation...');
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
      addPendingTx({
        id: result.txId,
        type: 'prove_for_resale',
        meta: { tagHash: selectedArtifact.tagHash },
      });
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

  // Auto-register SaleRecords: when wallet records load, match them to backend sales
  // and update any pending_ onChainSaleId with the real on-chain sale_id.
  const autoRegisterSaleRecords = async (saleRecs: Array<Record<string, unknown>>) => {
    try {
      const myListings = await api.getMyListings();
      if (!myListings.listings || myListings.listings.length === 0) return;

      for (const rec of saleRecs) {
        const data = (rec.data || {}) as Record<string, string>;
        const tagHash = (data.tag_hash || '').replace(/\.private$/, '').replace(/field$/, '').trim();
        const onChainSaleId = (data.sale_id || '').replace(/\.private$/, '').replace(/field$/, '').trim();

        if (!tagHash || !onChainSaleId) continue;

        // Find matching listing by tagHash
        const matchingListing = myListings.listings.find(
          (l: { tagHash: string; status: string }) => l.tagHash === tagHash && (l.status === 'active' || l.status === 'reserved')
        );

        if (!matchingListing) continue;

        // Try to update the backend sale with the real onChainSaleId
        try {
          const result = await api.updateSaleOnChainId({
            listingId: matchingListing.id,
            onChainSaleId,
          });
          if (result.updated) {
            console.log('[Vault] Auto-registered sale for listing', matchingListing.id, 'onChainSaleId:', onChainSaleId.slice(0, 20));
            toast.success(`Sale auto-registered for "${matchingListing.title}" — buyers can now purchase!`);
          }
        } catch (err) {
          // Not critical — will retry on next load
          console.warn('[Vault] Auto-register failed for listing', matchingListing.id, ':', err);
        }
      }
    } catch (err) {
      console.warn('[Vault] Auto-register scan failed:', err);
    }
  };

  const handleListForSale = async () => {
    if (!selectedArtifact || !listingTitle || !listingPrice) return;

    setListingLoading(true);
    try {
      // Compute tag commitment (BHP256 hash of tag_hash)
      let tagCommitment: string | null = null;
      if (selectedArtifact.tagHash) {
        tagCommitment = await computeBHP256Commitment(selectedArtifact.tagHash);
      }
      if (!tagCommitment) {
        toast.error('Unable to compute tag commitment. Tag hash may be empty.');
        setListingLoading(false);
        return;
      }

      // Convert price to smallest units (both ALEO and USDCx use 6 decimals)
      const priceValue = Math.round(parseFloat(listingPrice) * 1_000_000);

      if (isNaN(priceValue) || priceValue <= 0) {
        toast.error('Please enter a valid price');
        setListingLoading(false);
        return;
      }

      // 1. Create listing in backend
      const listingResult = await api.createListing({
        tagCommitment,
        tagHash: selectedArtifact.tagHash,
        modelId: selectedArtifact.modelId,
        title: listingTitle.trim(),
        description: listingDescription.trim(),
        condition: listingCondition,
        imageUrl: listingImageUrl.trim() || undefined,
        price: priceValue,
        currency: listingCurrency,
        brandAddress: selectedArtifact.brandAddress || undefined,
      });

      // 2. Create on-chain sale (atomic purchase)
      const saleSalt = `${Date.now()}`;
      const currencyCode = listingCurrency === 'aleo' ? 0 : 1;
      try {
        // Find the artifact record from wallet
        const artifactRecord = {
          tagHash: selectedArtifact.tagHash,
          _plaintext: selectedArtifact._plaintext,
          _raw: selectedArtifact._raw,
        } as { _plaintext?: string; _raw?: Record<string, unknown>; tagHash: string };

        const saleResult = await executeCreateSale(
          artifactRecord,
          priceValue,
          currencyCode as 0 | 1,
          saleSalt
        );

        if (saleResult) {
          // 3. Register sale in backend
          // Note: we don't know the on-chain sale_id yet (it's computed on-chain via BHP256).
          // Store a placeholder — auto-registration will update it when SaleRecord appears in wallet.
          try {
            await api.createSale({
              listingId: listingResult.id,
              saleId: saleResult.saleId,
              onChainSaleId: `pending_${saleResult.txId}`,
              createSaleTxId: saleResult.txId,
            });
            toast.success('Sale created on-chain! It will become buyable once the transaction confirms.');
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[Vault] Backend sale registration failed:', errMsg);
            toast.error(`Backend sale registration failed: ${errMsg}`);
          }

          addPendingTx({
            id: saleResult.txId,
            type: 'create_sale',
            meta: { saleId: saleResult.saleId, title: listingTitle },
          });
        }
      } catch (err) {
        // Listing created but on-chain sale failed — seller can retry
        console.warn('[Vault] On-chain sale creation failed, listing still created:', err);
        toast.error('Listing created, but on-chain sale failed. Please delist and re-list.');
      }

      toast.success('Listed on marketplace!');
      setListingModal(false);
      resetListingForm();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create listing';
      toast.error(errorMsg);
    } finally {
      setListingLoading(false);
    }
  };

  const resetListingForm = () => {
    setListingTitle('');
    setListingDescription('');
    setListingCondition('new');
    setListingPrice('');
    setListingCurrency('aleo');
    setListingImageUrl('');
  };

  const handleCancelSaleRecord = async (idx: number) => {
    const saleRec = saleRecords[idx];
    if (!saleRec) return;
    setCancellingIdx(idx);
    try {
      const txId = await executeCancelSale(saleRec as { _plaintext?: string; _raw?: Record<string, unknown> });
      if (txId) {
        addPendingTx({
          id: txId,
          type: 'cancel_sale',
          meta: { action: 'cancel_sale' },
        });

        // Notify backend to cancel the sale and re-activate the listing
        const data = (saleRec.data || {}) as Record<string, string>;
        const tagHash = (data.tag_hash || '').replace(/\.private$/, '').replace(/field$/, '').trim();
        if (tagHash) {
          try {
            const myListings = await api.getMyListings();
            const matchingListing = myListings.listings.find(
              (l: { tagHash: string }) => l.tagHash === tagHash
            );
            if (matchingListing) {
              // Find the backend sale for this listing
              try {
                const saleResult = await api.getSaleByListing(matchingListing.id);
                if (saleResult.found && saleResult.sale) {
                  await api.cancelSale({ saleId: saleResult.sale.saleId, cancelTxId: txId });
                  console.log('[Vault] Backend sale cancelled for listing', matchingListing.id);
                }
              } catch (err) {
                console.warn('[Vault] Backend sale cancel failed:', err);
              }
              // Also delete the listing from marketplace
              try {
                await api.deleteListing(matchingListing.id);
                console.log('[Vault] Listing deleted from marketplace:', matchingListing.id);
              } catch (err) {
                console.warn('[Vault] Listing delete failed:', err);
              }
            }
          } catch (err) {
            console.warn('[Vault] Could not clean up marketplace listing:', err);
          }
        }

        toast.success('Sale cancelled! Artifact will return to your vault.');
        // Remove from local list
        setSaleRecords(prev => prev.filter((_, i) => i !== idx));
        // Refresh after short delay
        setTimeout(() => loadArtifacts(), 3000);
      }
    } catch (err) {
      console.error('[Vault] Cancel sale error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to cancel sale');
    } finally {
      setCancellingIdx(null);
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
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── HEADER ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 font-heading text-4xl font-bold gold-gradient-text">
              My Vault
            </h1>
            <p className="text-sm text-white/40">
              {localLoading && initialLoad
                ? 'Loading your items...'
                : `${artifacts.length} authenticated item${artifacts.length !== 1 ? 's' : ''}${saleRecords.length > 0 ? ` · ${saleRecords.length} locked for sale` : ''}`}
            </p>
          </div>
          <button
            onClick={() => loadArtifacts()}
            disabled={localLoading}
            className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-all disabled:opacity-40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${localLoading ? 'animate-spin' : 'group-hover:rotate-90'}`}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            {localLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </motion.div>

      {/* ── PENDING TX BANNERS ── */}
      <PendingTxBanner
        types={['mint', 'transfer', 'report_stolen', 'prove_for_resale', 'create_sale', 'cancel_sale', 'complete_sale_escrow', 'complete_sale_usdcx']}
        onConfirmed={handleChildRefresh}
      />

      {/* ── AUTHENTICATED ITEMS ── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-gradient-gold p-1.5 text-onyx-950">
            <DiamondIcon size={18} />
          </div>
          <h2 className="font-heading text-lg font-semibold text-white/80">
            Authenticated Items
          </h2>
        </div>

        {localLoading && initialLoad ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <LoadingSpinner size={48} className="mx-auto text-champagne-400" />
              <p className="text-sm text-white/30 animate-pulse">Decrypting wallet records...</p>
            </div>
          </div>
        ) : artifacts.length === 0 && !hasPendingOfType('mint') && saleRecords.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card gold-border p-12 text-center"
          >
            <DiamondIcon size={48} className="mx-auto mb-4 text-white/20" />
            <h3 className="mb-2 font-heading text-xl text-white/60">No Items Yet</h3>
            <p className="text-sm text-white/30">
              Mint or receive luxury items to see them here
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence>
              {/* Pending mint/transfer cards */}
              {getPendingByType('mint').map((ptx) => (
                <PendingTxCard key={ptx.id} tx={ptx} />
              ))}

              {artifacts.map((artifact, index) => (
                <motion.div
                  key={artifact.tagHash || artifact.id || `artifact_${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
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
                      <button
                        onClick={() => {
                          setSelectedArtifact(artifact);
                          resetListingForm();
                          setListingModal(true);
                        }}
                        disabled={artifact.stolen || !artifact._fromWallet || !artifact.tagHash}
                        className="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:border-emerald-500/30 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                        title="List for Sale"
                      >
                        <MarketplaceIcon size={18} className="mx-auto" />
                      </button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* ── MY SALES ── */}
      {isAuthenticated && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-champagne-500/15 p-1.5">
              <MarketplaceIcon size={18} className="text-champagne-400" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-white/80">
              My Sales
            </h2>
          </div>
          <PendingSales onRefresh={handleChildRefresh} />
        </section>
      )}

      {/* ── LOCKED FOR SALE (On-chain SaleRecords) ── */}
      {saleRecords.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/15 p-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h2 className="font-heading text-lg font-semibold text-amber-400/80">
              Locked for Sale
            </h2>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400/60">
              {saleRecords.length}
            </span>
          </div>
          <p className="mb-4 text-xs text-white/30">
            These artifacts are locked on-chain in active sales. Cancel the sale to get your artifact back.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saleRecords.map((rec, idx) => {
              const data = (rec.data || {}) as Record<string, string>;
              const tagHash = (data.tag_hash || '').replace(/\.private$/, '').replace(/field$/, '').trim();
              const saleIdField = (data.sale_id || '').replace(/\.private$/, '').replace(/field$/, '').trim();
              const salePrice = (data.price || '').replace(/\.private$/, '').replace(/u64$/, '').trim();
              const saleCurrency = (data.currency || '').replace(/\.private$/, '').replace(/u8$/, '').trim();
              const currencyLabel = saleCurrency === '1' ? 'USDCx' : 'ALEO';
              return (
                <div key={idx} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-400/70">Sale Record</span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">Locked</span>
                  </div>
                  {tagHash && (
                    <p className="font-mono text-xs text-white/40 truncate">Tag: {tagHash.slice(0,12)}...</p>
                  )}
                  {salePrice && (
                    <p className="font-mono text-xs text-white/40">Price: {(parseInt(salePrice) / 1_000_000).toFixed(2)} {currencyLabel}</p>
                  )}
                  {saleIdField ? (
                    <p className="font-mono text-xs text-green-400/50 truncate">Sale ID: {saleIdField.slice(0,12)}... (auto-registered)</p>
                  ) : (
                    <p className="font-mono text-xs text-amber-400/50">Awaiting on-chain confirmation...</p>
                  )}
                  <button
                    onClick={() => handleCancelSaleRecord(idx)}
                    disabled={cancellingIdx === idx}
                    className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {cancellingIdx === idx ? 'Cancelling...' : 'Cancel Sale & Unlock Artifact'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
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

      <Modal
        isOpen={listingModal}
        onClose={() => setListingModal(false)}
        title="List for Sale"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/50">
            List this item on the marketplace. Your identity remains hidden — only
            the metadata you provide below will be public.
          </p>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs text-emerald-400/80">
              <strong>Privacy:</strong> Your wallet address, tag hash, and serial number
              are never revealed to buyers. The listing uses a zero-knowledge commitment.
            </p>
          </div>

          <Input
            label="Title"
            placeholder="e.g., Rolex Submariner Date 41mm"
            value={listingTitle}
            onChange={setListingTitle}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-white/60">
              Description
            </label>
            <textarea
              placeholder="Describe the item's condition, history, and any notable features..."
              value={listingDescription}
              onChange={(e) => setListingDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm
                       text-white placeholder-white/30 outline-none transition-colors
                       focus:border-champagne-500/40 focus:bg-white/[0.07] resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/60">
              Condition
            </label>
            <div className="flex gap-2">
              {([
                { value: 'new', label: 'New' },
                { value: 'like_new', label: 'Like New' },
                { value: 'good', label: 'Good' },
                { value: 'fair', label: 'Fair' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setListingCondition(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    listingCondition === opt.value
                      ? 'border-champagne-500/30 bg-champagne-500/15 text-champagne-300'
                      : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={listingPrice}
                onChange={(e) => setListingPrice(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm
                         text-white placeholder-white/30 outline-none transition-colors
                         focus:border-champagne-500/40 focus:bg-white/[0.07]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">
                Currency
              </label>
              <div className="flex h-[46px] overflow-hidden rounded-lg border border-white/10">
                <button
                  onClick={() => setListingCurrency('aleo')}
                  className={`flex-1 text-xs font-medium transition-all ${
                    listingCurrency === 'aleo'
                      ? 'bg-champagne-500/20 text-champagne-300'
                      : 'bg-white/[0.02] text-white/40 hover:bg-white/5'
                  }`}
                >
                  ALEO
                </button>
                <button
                  onClick={() => setListingCurrency('usdcx')}
                  className={`flex-1 text-xs font-medium transition-all ${
                    listingCurrency === 'usdcx'
                      ? 'bg-champagne-500/20 text-champagne-300'
                      : 'bg-white/[0.02] text-white/40 hover:bg-white/5'
                  }`}
                >
                  USDCx
                </button>
              </div>
            </div>
          </div>

          <Input
            label="Image URL (optional)"
            placeholder="https://..."
            value={listingImageUrl}
            onChange={setListingImageUrl}
          />

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              onClick={() => setListingModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleListForSale}
              disabled={!listingTitle.trim() || listingTitle.trim().length < 3 || !listingPrice || !listingDescription.trim()}
              loading={listingLoading}
              className="flex-1"
            >
              List for Sale
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
