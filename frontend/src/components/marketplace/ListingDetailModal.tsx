import { FC, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldIcon, CheckCircleIcon, StolenAlertIcon, DiamondIcon, XCircleIcon } from '../icons/Icons';
import { Button } from '../ui/Components';
import { api } from '../../lib/api';
import type { Listing } from '../../lib/types';

interface ListingDetailModalProps {
  listing: Listing;
  onClose: () => void;
  onBuyWithEscrow: (listing: Listing) => void;
  onDelisted?: () => void;
}

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const conditionColors: Record<string, string> = {
  new: 'text-emerald-400',
  like_new: 'text-blue-400',
  good: 'text-yellow-400',
  fair: 'text-orange-400',
};

export const ListingDetailModal: FC<ListingDetailModalProps> = ({
  listing, onClose, onBuyWithEscrow, onDelisted: _onDelisted,
}) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    minted: boolean;
    stolen: boolean;
    backendRegistered?: boolean;
    verifiedAt: string;
  } | null>(null);

  const priceDisplay =
    listing.currency === 'aleo'
      ? `${(listing.price / 1_000_000).toFixed(listing.price % 1_000_000 === 0 ? 0 : 2)} ALEO`
      : `${(listing.price / 1_000_000).toFixed(listing.price % 1_000_000 === 0 ? 0 : 2)} USDCx`;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyListing(listing.id);
      setVerifyResult({
        minted: result.minted,
        stolen: result.stolen,
        backendRegistered: result.backendRegistered ?? true,
        verifiedAt: result.verifiedAt,
      });
    } catch (err) {
      console.error('[Marketplace] Verify failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const isBlocked = listing.onChainStolen || verifyResult?.stolen;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto
                     rounded-2xl border border-white/10 bg-onyx-950/95 backdrop-blur-xl shadow-2xl
                     shadow-black/50"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5
                     text-white/40 transition-colors hover:bg-black/60 hover:text-white"
          >
            <XCircleIcon size={18} />
          </button>

          {/* Image */}
          <div className="relative aspect-video overflow-hidden rounded-t-2xl bg-gradient-to-br
                        from-gray-800/50 to-gray-900/50">
            {listing.imageUrl ? (
              <img
                src={listing.imageUrl}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <DiamondIcon size={64} className="text-champagne-500/10" />
              </div>
            )}

            {/* Stolen banner */}
            {isBlocked && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-red-500/30 to-transparent
                            px-4 py-3">
                <div className="flex items-center gap-2 text-red-400">
                  <StolenAlertIcon size={16} />
                  <span className="text-sm font-semibold">Reported Stolen</span>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Brand + Model */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-champagne-400">
                {listing.brandName || 'ONYX'}
              </span>
              <span className="text-white/20">•</span>
              <span className="text-xs text-white/40">Model #{listing.modelId}</span>
              <span className="text-white/20">•</span>
              <span className={`text-xs font-medium ${conditionColors[listing.condition] || 'text-white/40'}`}>
                {conditionLabels[listing.condition] || listing.condition}
              </span>
            </div>

            {/* Title */}
            <h2 className="font-heading text-xl font-bold text-white leading-snug">
              {listing.title}
            </h2>

            {/* Description */}
            <p className="text-sm leading-relaxed text-white/50">
              {listing.description}
            </p>

            {/* Price card */}
            <div className="flex items-center justify-between rounded-xl border border-champagne-500/20
                          bg-champagne-500/5 p-4">
              <span className="text-sm text-white/50">Asking Price</span>
              <span className="bg-gradient-to-r from-champagne-300 to-gold-500 bg-clip-text
                             font-heading text-2xl font-bold text-transparent">
                {priceDisplay}
              </span>
            </div>

            {/* On-chain verification */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldIcon size={16} className="text-champagne-500" />
                <h3 className="text-sm font-semibold text-white">On-Chain Verification</h3>
              </div>

              {verifyResult ? (
                <div className="space-y-2">
                  {/* ONYX Registry status */}
                  <div className="flex items-center gap-2">
                    {verifyResult.backendRegistered ? (
                      <CheckCircleIcon size={15} className="text-emerald-400" />
                    ) : (
                      <XCircleIcon size={15} className="text-red-400" />
                    )}
                    <span className={`text-sm ${verifyResult.backendRegistered ? 'text-emerald-400' : 'text-red-400'}`}>
                      {verifyResult.backendRegistered ? 'Registered in ONYX system' : 'Not registered'}
                    </span>
                  </div>
                  {/* On-chain mint status */}
                  <div className="flex items-center gap-2">
                    {verifyResult.minted ? (
                      <CheckCircleIcon size={15} className="text-emerald-400" />
                    ) : (
                      <ShieldIcon size={15} className="text-yellow-400" />
                    )}
                    <span className={`text-sm ${verifyResult.minted ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {verifyResult.minted ? 'Confirmed on Aleo blockchain' : 'On-chain mint pending'}
                    </span>
                  </div>
                  {/* Stolen status */}
                  <div className="flex items-center gap-2">
                    {!verifyResult.stolen ? (
                      <CheckCircleIcon size={15} className="text-emerald-400" />
                    ) : (
                      <StolenAlertIcon size={15} className="text-red-400" />
                    )}
                    <span className={`text-sm ${!verifyResult.stolen ? 'text-emerald-400' : 'text-red-400'}`}>
                      {!verifyResult.stolen ? 'Not reported stolen' : 'REPORTED STOLEN'}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/25 mt-1">
                    Verified {new Date(verifyResult.verifiedAt).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-white/35">
                      Check this item against the Aleo blockchain in real time
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleVerify}
                    loading={verifying}
                    className="border border-white/10 text-xs"
                  >
                    {verifying ? 'Checking...' : 'Verify Now'}
                  </Button>
                </div>
              )}
            </div>

            {/* Privacy notice */}
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3.5">
              <div className="flex gap-2.5">
                <ShieldIcon size={14} className="mt-0.5 flex-shrink-0 text-emerald-500/50" />
                <p className="text-[11px] leading-relaxed text-white/35">
                  <span className="font-semibold text-white/45">Privacy Protected</span> — This
                  listing shows only metadata the seller chose to share. The item&apos;s tag hash,
                  serial number, and owner identity are encrypted on-chain. Verification uses
                  zero-knowledge commitments — no private data is revealed.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              {isBlocked ? (
                <div className="w-full rounded-xl border border-red-500/20 bg-red-500/5 p-4
                              text-center text-sm text-red-400">
                  <StolenAlertIcon size={18} className="mx-auto mb-1" />
                  This item has been reported stolen. Purchase disabled.
                </div>
              ) : listing.status === 'sold' ? (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4
                              text-center text-sm text-white/40">
                  This item has been sold.
                </div>
              ) : (
                <>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => onBuyWithEscrow(listing)}
                  >
                    Buy with Escrow
                  </Button>
                  <Button variant="ghost" onClick={onClose}
                          className="border border-white/10">
                    Close
                  </Button>
                </>
              )}
            </div>

            {/* Listing meta */}
            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-[10px] text-white/20">
                Listed {new Date(listing.createdAt).toLocaleDateString()}
              </span>
              {listing.lastVerifiedAt && (
                <span className="text-[10px] text-white/20">
                  Last verified {new Date(listing.lastVerifiedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};
