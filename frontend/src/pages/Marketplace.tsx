import { FC, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DiamondIcon,
  ShieldIcon,
} from '../components/icons/Icons';
import { ListingCard, ListingCardSkeleton } from '../components/marketplace/ListingCard';
import { MarketplaceFilters } from '../components/marketplace/MarketplaceFilters';
import { ListingDetailModal } from '../components/marketplace/ListingDetailModal';
import { api } from '../lib/api';
import type { Listing, ListingFilters, ListingsResponse } from '../lib/types';

const ITEMS_PER_PAGE = 20;

export const Marketplace: FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- State ---
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Initialize filters from URL params
  const [filters, setFilters] = useState<ListingFilters>(() => {
    const initial: ListingFilters = {
      sort: (searchParams.get('sort') as ListingFilters['sort']) || 'newest',
      limit: ITEMS_PER_PAGE,
      page: parseInt(searchParams.get('page') || '1', 10) || 1,
    };
    const brand = searchParams.get('brand');
    if (brand) initial.brand = brand;
    const currency = searchParams.get('currency') as 'aleo' | 'usdcx' | null;
    if (currency) initial.currency = currency;
    const condition = searchParams.get('condition');
    if (condition) initial.condition = condition.split(',');
    return initial;
  });

  // --- Data fetching ---
  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const response: ListingsResponse = await api.getListings(filters);
      setListings(response.listings);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      console.error('[Marketplace] Failed to load listings:', err);
      toast.error('Failed to load marketplace listings');
      setListings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Sync filters to URL (without causing re-renders)
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.brand) params.set('brand', filters.brand);
    if (filters.currency) params.set('currency', filters.currency);
    if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
    if (filters.condition?.length) params.set('condition', filters.condition.join(','));
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  // --- Handlers ---
  const handleFilterChange = (newFilters: ListingFilters) => {
    setFilters({ ...newFilters, limit: ITEMS_PER_PAGE });
  };

  const handleCardClick = (listing: Listing) => {
    setSelectedListing(listing);
  };

  const handleCloseDetail = () => {
    setSelectedListing(null);
  };

  const handleBuyWithEscrow = (listing: Listing) => {
    setSelectedListing(null);
    // Navigate to escrow page with pre-filled data
    const params = new URLSearchParams({
      tagHash: listing.tagHash,
      amount: String(listing.price),
      currency: listing.currency,
      title: listing.title,
      seller: listing.brandAddress,
    });
    navigate(`/escrow?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Render ---
  return (
    <div className="mx-auto max-w-7xl space-y-6 py-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <div className="flex items-center justify-center gap-3">
          <DiamondIcon size={32} className="text-champagne-400" />
          <h1 className="font-heading text-3xl font-bold gold-gradient-text sm:text-4xl">
            Marketplace
          </h1>
        </div>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/40">
          Browse authenticated luxury goods with zero-knowledge privacy.
          Every item is verifiable on the Aleo blockchain without revealing
          the owner&apos;s identity.
        </p>
      </motion.div>

      {/* Privacy banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4"
      >
        <div className="flex items-start gap-3 sm:items-center">
          <ShieldIcon size={20} className="mt-0.5 flex-shrink-0 text-emerald-500/60 sm:mt-0" />
          <div className="flex-1 text-xs leading-relaxed text-white/40">
            <span className="font-semibold text-emerald-400/70">Privacy First</span>
            {' — '}
            Seller identities are always hidden. Items are verified via zero-knowledge
            commitments — no private data (tag hash, serial number, owner address) is
            ever exposed. Buyers use escrow for safe, trustless purchases.
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <MarketplaceFilters
          filters={filters}
          onChange={handleFilterChange}
          total={total}
        />
      </motion.div>

      {/* Listings grid */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 space-y-4"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full
                          border border-white/10 bg-white/[0.03]">
              <DiamondIcon size={36} className="text-white/15" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-white/60">
              No listings found
            </h3>
            <p className="max-w-sm text-center text-sm text-white/30">
              {filters.brand || filters.currency || filters.condition?.length
                ? 'Try adjusting your filters to see more results.'
                : 'Be the first to list an authenticated item. Go to your Vault to get started.'}
            </p>
            {(filters.brand || filters.currency || filters.condition?.length) && (
              <button
                onClick={() => setFilters({ sort: 'newest', limit: ITEMS_PER_PAGE })}
                className="rounded-lg border border-champagne-500/20 bg-champagne-500/10 px-4 py-2
                         text-xs font-medium text-champagne-400 transition-colors
                         hover:bg-champagne-500/20"
              >
                Clear Filters
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {listings.map((listing, idx) => (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.4) }}
              >
                <ListingCard listing={listing} onClick={handleCardClick} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-2 py-6"
        >
          <button
            onClick={() => handlePageChange((filters.page || 1) - 1)}
            disabled={(filters.page || 1) <= 1}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm
                     text-white/50 transition-colors hover:border-white/20 hover:text-white/70
                     disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              const current = filters.page || 1;
              // Show first, last, current, and adjacent pages
              return (
                page === 1 ||
                page === totalPages ||
                Math.abs(page - current) <= 1
              );
            })
            .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
              // Insert ellipsis for gaps
              if (idx > 0) {
                const prev = arr[idx - 1];
                if (page - prev > 1) acc.push('ellipsis');
              }
              acc.push(page);
              return acc;
            }, [])
            .map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`e-${idx}`} className="px-2 text-white/20">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => handlePageChange(item)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                    (filters.page || 1) === item
                      ? 'bg-champagne-500/20 text-champagne-300 border border-champagne-500/30'
                      : 'border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70'
                  }`}
                >
                  {item}
                </button>
              ),
            )}

          <button
            onClick={() => handlePageChange((filters.page || 1) + 1)}
            disabled={(filters.page || 1) >= totalPages}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm
                     text-white/50 transition-colors hover:border-white/20 hover:text-white/70
                     disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next →
          </button>
        </motion.div>
      )}

      {/* Listing detail modal */}
      <AnimatePresence>
        {selectedListing && (
          <ListingDetailModal
            listing={selectedListing}
            onClose={handleCloseDetail}
            onBuyWithEscrow={handleBuyWithEscrow}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
