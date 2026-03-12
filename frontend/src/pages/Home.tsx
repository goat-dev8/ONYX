import { FC } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldIcon,
  TagIcon,
  TransferIcon,
  ScanIcon,
  ProofSealIcon,
  VaultIcon,
  LogoIcon,
  MarketplaceIcon,
} from '../components/icons/Icons';
import { Button } from '../components/ui/Components';

/* ─── animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

/* ─── inline SVGs used in sections ─── */
const LockSvg: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="20" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
    <path d="M16 20V14a8 8 0 1116 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="24" cy="32" r="3" fill="currentColor" />
    <path d="M24 35v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ZkProofSvg: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
    <circle cx="24" cy="24" r="13" stroke="currentColor" strokeWidth="1.5" />
    <path d="M18 24l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="4" r="2" fill="currentColor" />
    <circle cx="24" cy="44" r="2" fill="currentColor" />
    <circle cx="4" cy="24" r="2" fill="currentColor" />
    <circle cx="44" cy="24" r="2" fill="currentColor" />
  </svg>
);

const AtomicSvg: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="24" cy="24" rx="20" ry="8" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="24" cy="24" rx="20" ry="8" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 24 24)" />
    <ellipse cx="24" cy="24" rx="20" ry="8" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 24 24)" />
    <circle cx="24" cy="24" r="3.5" fill="currentColor" />
  </svg>
);

const CurrencySvg: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="24" r="14" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="30" cy="24" r="14" stroke="currentColor" strokeWidth="1.5" />
    <path d="M24 14v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
  </svg>
);

const BountySvg: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M24 4l4 8 9 1.3-6.5 6.3L32 29 24 24.5 16 29l1.5-9.4L11 13.3l9-1.3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 34l-4 10 8-4 8 4 8-4 8 4-4-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ─── data ─── */
const stats = [
  { value: '26', label: 'On-Chain Transitions' },
  { value: '10', label: 'Private Record Types' },
  { value: '3', label: 'Currencies Supported' },
  { value: '0', label: 'Data Leaked' },
];

const features = [
  {
    icon: TagIcon,
    title: 'Encrypted Product Passports',
    description:
      'Every luxury item receives a unique AssetArtifact record — encrypted on Aleo. Only the owner\'s wallet can decrypt it. No one else can see what you own.',
    color: 'from-champagne-400 to-gold-600',
  },
  {
    icon: ShieldIcon,
    title: 'Zero-Knowledge Verification',
    description:
      'Scan any QR code to verify authenticity instantly. The check uses BHP256 commitments — proving existence without revealing the item, owner, or history.',
    color: 'from-emerald-400 to-emerald-600',
  },
  {
    icon: TransferIcon,
    title: 'Private Ownership Transfers',
    description:
      'Transfer items with zero on-chain trace. No mapping writes, no public state changes. Only sender and receiver know the transfer happened.',
    color: 'from-blue-400 to-blue-600',
  },
  {
    icon: MarketplaceIcon,
    title: 'Atomic Marketplace',
    description:
      'Buy and sell with one-transaction guarantees. Artifact delivery and payment happen atomically — both succeed or neither does. No trust required.',
    color: 'from-violet-400 to-violet-600',
  },
  {
    icon: ProofSealIcon,
    title: 'Cryptographic Resale Proofs',
    description:
      'Prove you own an item to a specific verifier without revealing your address, purchase price, or any other asset. Verifier-targeted ProofToken records.',
    color: 'from-rose-400 to-rose-600',
  },
  {
    icon: VaultIcon,
    title: 'Recovery Bounties',
    description:
      'Report stolen items on-chain with optional ALEO bounties. Stolen items are permanently blocked from commerce. Finders claim bounties with proof of possession.',
    color: 'from-amber-400 to-amber-600',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Brand Mints Passport',
    desc: 'A registered brand calls mint_artifact() with the item\'s tag hash and serial. An encrypted AssetArtifact record is created for the owner. A BHP256 commitment is stored on-chain — proving existence without revealing the item.',
    icon: TagIcon,
  },
  {
    step: '02',
    title: 'Anyone Can Verify',
    desc: 'Scan a QR code or enter a tag hash. ONYX checks the on-chain commitment — if it exists, the item is authentic. If it\'s flagged stolen, you\'ll see a red alert. No login, no wallet, no personal data exposed.',
    icon: ScanIcon,
  },
  {
    step: '03',
    title: 'List on Marketplace',
    desc: 'The owner creates a sale listing with price and currency (ALEO, USDCx, or USAD). The artifact is locked in a SaleRecord — it can\'t be transferred or listed elsewhere until the sale completes or is cancelled.',
    icon: MarketplaceIcon,
  },
  {
    step: '04',
    title: 'Atomic Purchase',
    desc: 'The buyer pays with their chosen currency. For ALEO, credits are escrowed in the program. For stablecoins, tokens go directly to the seller. The seller then completes the sale — artifact and payment exchange atomically in one transaction.',
    icon: ShieldIcon,
  },
];

const privacyRows = [
  { data: 'Who owns an item', visible: false, detail: 'Encrypted in AssetArtifact record — only owner\'s wallet decrypts' },
  { data: 'Item tag hash & serial', visible: false, detail: 'Inside private records. On-chain: only BHP256 commitment (irreversible)' },
  { data: 'Transfer history', visible: false, detail: 'Zero on-chain trace — no mapping writes on transfer' },
  { data: 'Payment amounts', visible: false, detail: 'In encrypted receipt records — buyer and seller only' },
  { data: 'Buyer & seller addresses', visible: false, detail: 'SHA-256 hashed in backend — never returned in API responses' },
  { data: 'Brand registration', visible: true, detail: 'Public by design — brands must be verifiable by anyone' },
  { data: 'Stolen status', visible: true, detail: 'Public by design — to block stolen items from commerce globally' },
  { data: 'Item exists (tag uniqueness)', visible: true, detail: 'BHP256 commitment → boolean. Reveals nothing about the item itself' },
];

export const Home: FC = () => {
  return (
    <div className="mx-auto max-w-6xl">
      {/* ═══════════ HERO ═══════════ */}
      <section className="relative py-20 text-center md:py-28">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="relative z-10"
        >
          {/* animated logo */}
          <motion.div
            animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.06, 1] }}
            transition={{ duration: 7, repeat: Infinity, repeatType: 'reverse' }}
            className="mx-auto mb-8"
          >
            <LogoIcon size={130} className="mx-auto drop-shadow-[0_0_40px_rgba(212,163,115,0.35)]" />
          </motion.div>

          <h1 className="mb-6 font-heading text-5xl font-bold leading-tight md:text-7xl lg:text-8xl">
            <span className="gold-gradient-text">Private Product</span>
            <br />
            <span className="text-white">Passports</span>
          </h1>

          <p className="mx-auto mb-4 max-w-3xl text-lg leading-relaxed text-white/60 md:text-xl">
            The first privacy-preserving luxury goods authentication platform on Aleo.
            Mint encrypted digital passports, verify authenticity with zero-knowledge proofs,
            and trade on an atomic marketplace — all without revealing your identity.
          </p>

          <p className="mx-auto mb-10 max-w-2xl text-sm text-white/40">
            Built with 26 on-chain transitions &bull; 10 encrypted record types &bull; 3 currencies &bull; BHP256 commitment privacy
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/marketplace">
              <Button size="lg">
                <MarketplaceIcon size={20} />
                Explore Marketplace
              </Button>
            </Link>
            <Link to="/scan">
              <Button variant="secondary" size="lg">
                <ScanIcon size={20} />
                Verify Item
              </Button>
            </Link>
            <Link to="/vault">
              <Button variant="secondary" size="lg">
                <VaultIcon size={20} />
                My Vault
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* background glow orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ opacity: [0.25, 0.5, 0.25], scale: [1, 1.15, 1] }}
            transition={{ duration: 9, repeat: Infinity, repeatType: 'reverse' }}
            className="absolute -left-1/4 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-gradient-radial from-champagne-500/20 to-transparent blur-3xl"
          />
          <motion.div
            animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.2, 1] }}
            transition={{ duration: 11, repeat: Infinity, repeatType: 'reverse', delay: 2 }}
            className="absolute -right-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-gradient-radial from-rose-gold/15 to-transparent blur-3xl"
          />
          <motion.div
            animate={{ opacity: [0.1, 0.25, 0.1] }}
            transition={{ duration: 6, repeat: Infinity, repeatType: 'reverse', delay: 1 }}
            className="absolute left-1/2 top-0 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-gradient-radial from-champagne-300/10 to-transparent blur-3xl"
          />
        </div>
      </section>

      {/* ═══════════ STATS BAR ═══════════ */}
      <motion.section
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        {stats.map((s, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="glass-card gold-border flex flex-col items-center justify-center p-6"
          >
            <span className="font-heading text-3xl font-bold gold-gradient-text md:text-4xl">{s.value}</span>
            <span className="mt-1 text-xs uppercase tracking-widest text-white/40">{s.label}</span>
          </motion.div>
        ))}
      </motion.section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mb-14 text-center"
        >
          <span className="mb-3 inline-block rounded-full border border-champagne-500/30 bg-champagne-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-champagne-400">
            How It Works
          </span>
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-5xl">
            From Mint to Market in <span className="gold-gradient-text">Four Steps</span>
          </h2>
          <p className="mx-auto max-w-2xl text-white/50">
            Every luxury item goes through a transparent lifecycle — while keeping your identity completely private.
          </p>
        </motion.div>

        <div className="relative">
          {/* vertical line connector */}
          <div className="absolute left-8 top-0 hidden h-full w-px bg-gradient-to-b from-champagne-500/40 via-champagne-500/20 to-transparent md:left-1/2 md:block" />

          <div className="space-y-12 md:space-y-16">
            {howItWorks.map((item, i) => {
              const Icon = item.icon;
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: isLeft ? -40 : 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className={`relative flex flex-col items-center gap-6 md:flex-row ${isLeft ? '' : 'md:flex-row-reverse'}`}
                >
                  {/* step number circle */}
                  <div className="z-10 hidden shrink-0 md:block md:w-1/2" />
                  <div className="absolute left-8 z-20 hidden h-12 w-12 items-center justify-center rounded-full border-2 border-champagne-500/50 bg-onyx-950 md:left-1/2 md:flex md:-translate-x-1/2">
                    <span className="text-sm font-bold text-champagne-400">{item.step}</span>
                  </div>
                  {/* card */}
                  <div className={`glass-card gold-border group w-full p-6 transition-all duration-300 hover:border-champagne-400/50 md:w-1/2`}>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold text-onyx-950 shadow-gold transition-transform duration-300 group-hover:scale-110">
                        <Icon size={20} />
                      </div>
                      <span className="font-heading text-sm font-semibold uppercase tracking-widest text-champagne-500 md:hidden">{item.step}</span>
                      <h3 className="font-heading text-lg font-semibold text-white">{item.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-white/50">{item.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ PRIVACY MODEL ═══════════ */}
      <section className="py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Privacy by Design
          </span>
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-5xl">
            What the World Sees vs. <span className="gold-gradient-text">What You Keep</span>
          </h2>
          <p className="mx-auto max-w-2xl text-white/50">
            Every piece of data has a clear privacy boundary. Only boolean flags on hashed keys are public — by design, to prevent counterfeiting and stolen-item resale.
          </p>
        </motion.div>

        {/* Privacy ZK diagram */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="mb-12 grid gap-4 md:grid-cols-3"
        >
          {/* block: private data */}
          <motion.div variants={itemVariants} className="glass-card border-emerald-500/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <LockSvg className="h-8 w-8 text-emerald-400" />
              <h3 className="font-heading text-lg font-semibold text-emerald-400">Fully Private</h3>
            </div>
            <p className="mb-3 text-xs uppercase tracking-widest text-white/30">Encrypted in Aleo Records</p>
            <ul className="space-y-2 text-sm text-white/60">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Owner identity &amp; wallet address</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Tag hash, serial number, model ID</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Full transfer history</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Payment amounts &amp; receipts</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Buyer &amp; seller addresses</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> Resale proof tokens</li>
            </ul>
          </motion.div>

          {/* block: ZK commitment layer */}
          <motion.div variants={itemVariants} className="glass-card border-champagne-500/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <ZkProofSvg className="h-8 w-8 text-champagne-400" />
              <h3 className="font-heading text-lg font-semibold text-champagne-400">BHP256 Commitments</h3>
            </div>
            <p className="mb-3 text-xs uppercase tracking-widest text-white/30">One-Way Hash Layer</p>
            <ul className="space-y-2 text-sm text-white/60">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-400" /> tag_commitment = BHP256(tag_hash)</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-400" /> sale_id = BHP256(tag + salt + seller)</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-400" /> bounty_key = BHP256(tag_hash)</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-400" /> escrow_id = BHP256(nonce)</li>
            </ul>
            <p className="mt-4 rounded-lg border border-champagne-500/20 bg-champagne-500/5 px-3 py-2 text-xs text-champagne-300/80">
              Observers see commitments but can <strong>never reverse</strong> them to find the original data.
            </p>
          </motion.div>

          {/* block: public (minimal) */}
          <motion.div variants={itemVariants} className="glass-card border-amber-500/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <svg viewBox="0 0 48 48" fill="none" className="h-8 w-8 text-amber-400" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                <path d="M24 14v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="34" r="2" fill="currentColor" />
              </svg>
              <h3 className="font-heading text-lg font-semibold text-amber-400">Public (By Design)</h3>
            </div>
            <p className="mb-3 text-xs uppercase tracking-widest text-white/30">Only Booleans on Hashed Keys</p>
            <ul className="space-y-2 text-sm text-white/60">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" /> Brand registered? → enables verification</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" /> Item exists? → powers scan check</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" /> Stolen flag? → blocks all commerce</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" /> Sale active / paid? → prevents double-spend</li>
            </ul>
            <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
              Public data reveals <strong>nothing</strong> about who, what item, or how much — only that &quot;some hash exists.&quot;
            </p>
          </motion.div>
        </motion.div>

        {/* Privacy table */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass-card gold-border overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-widest text-white/40">
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Visible On-Chain?</th>
                  <th className="px-6 py-4">How It&apos;s Protected</th>
                </tr>
              </thead>
              <tbody>
                {privacyRows.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-medium text-white/80">{r.data}</td>
                    <td className="px-6 py-3">
                      {r.visible ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Private
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-white/50">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-champagne-500/30 bg-champagne-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-champagne-400">
            Core Features
          </span>
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-5xl">
            Everything You Need, <span className="gold-gradient-text">Nothing Exposed</span>
          </h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={i}
                variants={itemVariants}
                className="glass-card gold-border group relative overflow-hidden p-6 transition-all duration-300 hover:border-champagne-400/50"
              >
                {/* gradient glow on hover */}
                <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${f.color} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20`} />
                <div className="relative z-10">
                  <div className="mb-4 inline-flex rounded-xl bg-gradient-gold p-3 text-onyx-950 shadow-gold transition-all duration-300 group-hover:shadow-gold-lg group-hover:scale-110">
                    <Icon size={24} />
                  </div>
                  <h3 className="mb-2 font-heading text-xl font-semibold text-white">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-white/50">{f.description}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ═══════════ ATOMIC + MULTI-CURRENCY ═══════════ */}
      <section className="py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-violet-400">
            Commerce
          </span>
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-5xl">
            Atomic Purchases, <span className="gold-gradient-text">Three Currencies</span>
          </h2>
          <p className="mx-auto max-w-2xl text-white/50">
            Artifact delivery and payment happen in a single transaction. If either fails, nothing happens. Pay with native ALEO credits (escrowed for buyer protection) or stablecoins USDCx / USAD (direct to seller).
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Atomic explainer */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="glass-card gold-border p-8">
            <div className="mb-6 flex items-center gap-4">
              <AtomicSvg className="h-12 w-12 text-champagne-400" />
              <div>
                <h3 className="font-heading text-xl font-semibold text-white">Atomic Exchange</h3>
                <p className="text-sm text-white/40">All-or-nothing in one transaction</p>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { phase: 'Create', desc: 'Seller locks artifact in SaleRecord', color: 'bg-champagne-500' },
                { phase: 'Pay', desc: 'Buyer sends payment (escrowed or direct)', color: 'bg-blue-500' },
                { phase: 'Complete', desc: 'Artifact → buyer, credits → seller, receipts → both', color: 'bg-emerald-500' },
              ].map((p, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${p.color}`} />
                  <div>
                    <span className="text-sm font-semibold text-white">{p.phase}</span>
                    <p className="text-xs text-white/40">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-emerald-300/80">
                <strong>Safety:</strong> Timeout refund after ~1000 blocks • Stolen items blocked • Double-pay prevention • Seller cancel before payment
              </p>
            </div>
          </motion.div>

          {/* Currency cards */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="space-y-4">
            {[
              {
                name: 'ALEO Credits',
                program: 'credits.aleo',
                badge: 'Escrowed',
                badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                desc: 'Native Aleo credits locked in program balance until seller completes. Full refund after timeout.',
              },
              {
                name: 'USDCx',
                program: 'test_usdcx_stablecoin.aleo',
                badge: 'Direct',
                badgeColor: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                desc: 'Aleo official testnet stablecoin. Private transfer_private with Merkle tree compliance proofs.',
              },
              {
                name: 'USAD',
                program: 'test_usad_stablecoin.aleo',
                badge: 'Direct',
                badgeColor: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
                desc: 'Additional stablecoin support. Same private transfer flow with freeze-list proof compliance.',
              },
            ].map((c, i) => (
              <div key={i} className="glass-card border-white/10 p-5 transition-all duration-300 hover:border-champagne-500/30">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-heading text-lg font-semibold text-white">{c.name}</h4>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.badgeColor}`}>{c.badge}</span>
                </div>
                <p className="mb-1 font-mono text-xs text-champagne-500/60">{c.program}</p>
                <p className="text-xs text-white/40">{c.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════ TECHNOLOGY ═══════════ */}
      <section className="py-20">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full border border-champagne-500/30 bg-champagne-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-champagne-400">
            Architecture
          </span>
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-5xl">
            Two Programs, <span className="gold-gradient-text">Zero Compromise</span>
          </h2>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-6 md:grid-cols-2">
          <motion.div variants={itemVariants} className="glass-card border-champagne-500/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold text-onyx-950">
                <TagIcon size={20} />
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold text-white">onyxpriv_v6.aleo</h3>
                <p className="font-mono text-xs text-champagne-500/60">525 statements • Core Logic</p>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm text-white/50">
              <li>• 22 transitions — mint, transfer, sale, escrow, stolen, bounty, proof</li>
              <li>• 10 encrypted record types</li>
              <li>• 8 BHP256-committed mappings</li>
              <li>• Full atomic sale lifecycle</li>
            </ul>
          </motion.div>

          <motion.div variants={itemVariants} className="glass-card border-blue-500/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <CurrencySvg className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold text-white">onyxpriv_v6_pay.aleo</h3>
                <p className="font-mono text-xs text-blue-400/60">170 statements • Payments</p>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm text-white/50">
              <li>• 4 transitions — USDCx & USAD payments</li>
              <li>• Cross-program calls to core contract</li>
              <li>• Merkle tree compliance proofs</li>
              <li>• Private stablecoin transfer_private flow</li>
            </ul>
          </motion.div>
        </motion.div>

        {/* tech stack badges */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-8 flex flex-wrap justify-center gap-3"
        >
          {[
            'Leo 3.4.0',
            'React 18',
            'TypeScript',
            'Tailwind CSS',
            'Framer Motion',
            'Shield Wallet',
            'Vite 5',
            'Express.js',
            'BHP256 WASM',
            'Provable API',
          ].map((t, i) => (
            <span
              key={i}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50 transition-colors hover:border-champagne-500/30 hover:text-champagne-400"
            >
              {t}
            </span>
          ))}
        </motion.div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="glass-card gold-border relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-champagne-500/5 via-transparent to-rose-gold/5" />
          <div className="relative z-10 p-8 text-center md:p-14">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 4, repeat: Infinity, repeatType: 'reverse' }}
              className="mx-auto mb-6 w-fit"
            >
              <BountySvg className="h-16 w-16 text-champagne-400" />
            </motion.div>
            <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-4xl">
              Own Your <span className="gold-gradient-text">Authenticity</span>
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-white/50">
              Browse the marketplace, verify any item in seconds, or manage your private vault of authenticated luxury goods.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/marketplace">
                <Button size="lg">
                  <MarketplaceIcon size={20} />
                  Browse Marketplace
                </Button>
              </Link>
              <Link to="/scan">
                <Button variant="secondary" size="lg">
                  <ScanIcon size={20} />
                  Scan &amp; Verify
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══════════ FOOTER LINKS ═══════════ */}
      <section className="pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { to: '/mint', icon: TagIcon, title: 'Brand Portal', desc: 'Register your brand and mint encrypted product passports' },
            { to: '/prove', icon: ProofSealIcon, title: 'Resale Proofs', desc: 'Generate or verify cryptographic ownership proofs' },
            { to: '/stolen', icon: ShieldIcon, title: 'Stolen Recovery', desc: 'Report stolen items and manage recovery bounties' },
          ].map((link, i) => {
            const Icon = link.icon;
            return (
              <Link key={i} to={link.to} className="glass-card gold-border group flex items-start gap-4 p-5 transition-all duration-300 hover:border-champagne-400/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-gold text-onyx-950 shadow-gold transition-transform duration-300 group-hover:scale-110">
                  <Icon size={18} />
                </div>
                <div>
                  <h4 className="font-heading text-base font-semibold text-white">{link.title}</h4>
                  <p className="text-xs text-white/40">{link.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};
