import { FC } from 'react';
import { motion } from 'framer-motion';
import { ShieldIcon, CheckCircleIcon, StolenAlertIcon, DiamondIcon } from '../icons/Icons';
import type { Listing } from '../../lib/types';

interface ListingCardProps {
  listing: Listing;
  onClick: (listing: Listing) => void;
}

const conditionLabels: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const conditionColors: Record<string, string> = {
  new: 'bg-emerald-500/20 text-emerald-400',
  like_new: 'bg-blue-500/20 text-blue-400',
  good: 'bg-yellow-500/20 text-yellow-400',
  fair: 'bg-orange-500/20 text-orange-400',
};

export const ListingCard: FC<ListingCardProps> = ({ listing, onClick }) => {
  const priceDisplay =
    listing.currency === 'aleo'
      ? `${(listing.price / 1_000_000).toFixed(listing.price % 1_000_000 === 0 ? 0 : 2)} ALEO`
      : `${(listing.price / 1_000_000).toFixed(listing.price % 1_000_000 === 0 ? 0 : 2)} USDCx`;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]
                 backdrop-blur-xl cursor-pointer transition-colors duration-300
                 hover:border-champagne-500/30"
      onClick={() => onClick(listing)}
    >
      {/* Hover glow effect */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-champagne-500/10 blur-3xl" />
      </div>

      {/* Image / Placeholder */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-800/50 to-gray-900/50">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <DiamondIcon size={48} className="text-champagne-500/15" />
          </div>
        )}

        {/* Top-right verification badge */}
        <div className="absolute right-3 top-3 z-10">
          {listing.onChainStolen ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1
                           text-[11px] font-semibold text-white shadow-lg shadow-red-500/30">
              <StolenAlertIcon size={12} />
              Stolen
            </span>
          ) : listing.onChainMinted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1
                           text-[11px] font-semibold text-white shadow-lg shadow-emerald-500/30">
              <CheckCircleIcon size={12} />
              Verified
            </span>
          ) : null}
        </div>

        {/* Sold overlay */}
        {listing.status === 'sold' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2
                           font-heading text-sm font-bold text-emerald-400 tracking-wider">
              SOLD
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative p-4 space-y-3">
        {/* Brand + Model row */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-champagne-400/80">
            {listing.brandName || 'ONYX'}
          </span>
          <span className="text-[10px] text-white/30">•</span>
          <span className="text-[11px] text-white/40">
            #{listing.modelId}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-heading text-[15px] font-semibold leading-tight text-white line-clamp-2
                      group-hover:text-champagne-300 transition-colors duration-300">
          {listing.title}
        </h3>

        {/* Price + Condition */}
        <div className="flex items-center justify-between pt-1">
          <span className="bg-gradient-to-r from-champagne-300 to-gold-500 bg-clip-text
                         font-heading text-lg font-bold text-transparent">
            {priceDisplay}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            conditionColors[listing.condition] || 'bg-gray-500/20 text-gray-400'
          }`}>
            {conditionLabels[listing.condition] || listing.condition}
          </span>
        </div>

        {/* Privacy footer */}
        <div className="flex items-center gap-1.5 border-t border-white/5 pt-2">
          <ShieldIcon size={11} className="text-emerald-500/40" />
          <span className="text-[10px] text-white/25 tracking-wide">
            Owner hidden • ZK verified
          </span>
        </div>
      </div>
    </motion.div>
  );
};

/** Skeleton loading card */
export const ListingCardSkeleton: FC = () => (
  <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] animate-pulse">
    <div className="aspect-[4/3] bg-white/[0.03]" />
    <div className="p-4 space-y-3">
      <div className="h-2.5 w-16 rounded bg-white/[0.06]" />
      <div className="h-4 w-3/4 rounded bg-white/[0.06]" />
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 rounded bg-white/[0.06]" />
        <div className="h-4 w-14 rounded-full bg-white/[0.06]" />
      </div>
    </div>
  </div>
);
