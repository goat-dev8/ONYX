import { FC, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ListingFilters } from '../../lib/types';

interface MarketplaceFiltersProps {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
  total: number;
}

const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const conditionOptions = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

export const MarketplaceFilters: FC<MarketplaceFiltersProps> = ({ filters, onChange, total }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (patch: Partial<ListingFilters>) => {
    onChange({ ...filters, ...patch, page: 1 });
  };

  const activeFilterCount = [
    filters.brand,
    filters.currency,
    filters.condition?.length,
    filters.minPrice,
    filters.maxPrice,
  ].filter(Boolean).length;

  const clearAll = () => {
    onChange({ sort: filters.sort || 'newest', limit: filters.limit || 20 });
  };

  return (
    <div className="space-y-3">
      {/* Main filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10
                      bg-white/[0.03] backdrop-blur-xl p-3 sm:p-4">
        {/* Search by brand */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search brand..."
            value={filters.brand || ''}
            onChange={(e) => update({ brand: e.target.value || undefined })}
            className="w-36 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                     text-white placeholder-white/30 outline-none transition-colors
                     focus:border-champagne-500/40 focus:bg-white/[0.07]"
          />
          {filters.brand && (
            <button
              onClick={() => update({ brand: undefined })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60
                       transition-colors text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <select
          value={filters.sort || 'newest'}
          onChange={(e) => update({ sort: e.target.value as ListingFilters['sort'] })}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm
                   text-white outline-none transition-colors cursor-pointer
                   focus:border-champagne-500/40 [&>option]:bg-gray-900 [&>option]:text-white"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Currency toggle */}
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {(['all', 'aleo', 'usdcx'] as const).map((c) => {
            const isActive = c === 'all'
              ? !filters.currency
              : filters.currency === c;
            return (
              <button
                key={c}
                onClick={() => update({ currency: c === 'all' ? undefined : c })}
                className={`px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-champagne-500/20 text-champagne-300'
                    : 'bg-white/[0.02] text-white/40 hover:bg-white/5 hover:text-white/60'
                }`}
              >
                {c === 'all' ? 'All' : c.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs
                    font-medium transition-all duration-200 ${
                      showAdvanced || activeFilterCount > 0
                        ? 'border-champagne-500/30 bg-champagne-500/10 text-champagne-400'
                        : 'border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/60'
                    }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="12" y1="18" x2="20" y2="18" />
            <circle cx="6" cy="12" r="2" fill="currentColor" />
            <circle cx="10" cy="18" r="2" fill="currentColor" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full
                           bg-champagne-500 text-[10px] font-bold text-black">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear all */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-white/30 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}

        {/* Results count */}
        <div className="ml-auto text-sm text-white/30">
          <span className="font-medium text-white/50">{total}</span>{' '}
          {total === 1 ? 'item' : 'items'}
        </div>
      </div>

      {/* Advanced filter panel */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-white/5
                          bg-white/[0.02] p-4">
              {/* Condition */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Condition
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {conditionOptions.map((c) => {
                    const isActive = filters.condition?.includes(c.value);
                    return (
                      <button
                        key={c.value}
                        onClick={() => {
                          const current = filters.condition || [];
                          const next = isActive
                            ? current.filter((v) => v !== c.value)
                            : [...current, c.value];
                          update({ condition: next.length > 0 ? next : undefined });
                        }}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium
                                  transition-all duration-200 ${
                                    isActive
                                      ? 'bg-champagne-500/20 text-champagne-300 border border-champagne-500/30'
                                      : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
                                  }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price range */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Price Range {filters.currency === 'usdcx' ? '(USDCx)' : '(ALEO)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.minPrice !== undefined
                      ? (filters.currency === 'usdcx' ? filters.minPrice : filters.minPrice / 1_000_000)
                      : ''}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      if (isNaN(raw) || e.target.value === '') {
                        update({ minPrice: undefined });
                      } else {
                        update({
                          minPrice: filters.currency === 'usdcx' ? raw : Math.round(raw * 1_000_000),
                        });
                      }
                    }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5
                             text-xs text-white placeholder-white/25 outline-none
                             focus:border-champagne-500/40"
                  />
                  <span className="text-white/20 text-xs">—</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.maxPrice !== undefined
                      ? (filters.currency === 'usdcx' ? filters.maxPrice : filters.maxPrice / 1_000_000)
                      : ''}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      if (isNaN(raw) || e.target.value === '') {
                        update({ maxPrice: undefined });
                      } else {
                        update({
                          maxPrice: filters.currency === 'usdcx' ? raw : Math.round(raw * 1_000_000),
                        });
                      }
                    }}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5
                             text-xs text-white placeholder-white/25 outline-none
                             focus:border-champagne-500/40"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
