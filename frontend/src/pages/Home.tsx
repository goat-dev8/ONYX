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
} from '../components/icons/Icons';
import { Button } from '../components/ui/Components';

const features = [
  {
    icon: TagIcon,
    title: 'Private Passports',
    description:
      'Each luxury item receives a unique encrypted passport stored on Aleo blockchain with zero-knowledge privacy.',
  },
  {
    icon: ShieldIcon,
    title: 'Authenticity Verification',
    description:
      'Instantly verify any item authenticity by scanning its QR code. No personal data exposed.',
  },
  {
    icon: TransferIcon,
    title: 'Secure Transfers',
    description:
      'Transfer ownership privately. Only you and the recipient know the transaction details.',
  },
  {
    icon: ProofSealIcon,
    title: 'Resale Proofs',
    description:
      'Generate cryptographic proofs for resale without revealing your identity or purchase history.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

export const Home: FC = () => {
  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative py-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <motion.div
            animate={{ 
              rotate: [0, 5, -5, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 6, 
              repeat: Infinity,
              repeatType: 'reverse'
            }}
            className="mx-auto mb-8"
          >
            <LogoIcon size={120} className="mx-auto" />
          </motion.div>

          <h1 className="mb-6 font-heading text-5xl font-bold md:text-7xl">
            <span className="gold-gradient-text">Private Product</span>
            <br />
            <span className="text-white">Passports</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/60">
            Luxury goods authentication powered by zero-knowledge proofs.
            Verify authenticity, transfer ownership, and prove provenance
            without revealing your identity.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/scan">
              <Button size="lg">
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

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            animate={{
              opacity: [0.3, 0.5, 0.3],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
            className="absolute -left-1/4 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-gradient-radial from-champagne-500/20 to-transparent blur-3xl"
          />
          <motion.div
            animate={{
              opacity: [0.2, 0.4, 0.2],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              repeatType: 'reverse',
              delay: 1,
            }}
            className="absolute -right-1/4 top-1/3 h-96 w-96 rounded-full bg-gradient-radial from-rose-gold/15 to-transparent blur-3xl"
          />
        </div>
      </section>

      <section className="py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 font-heading text-3xl font-semibold text-white md:text-4xl">
            Privacy-First Authentication
          </h2>
          <p className="text-white/50">
            Built on Aleo blockchain for true zero-knowledge privacy
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-6 md:grid-cols-2"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className="glass-card gold-border group p-6 transition-all duration-300 hover:border-champagne-400/50"
              >
                <div className="mb-4 inline-flex rounded-xl bg-gradient-gold p-3 text-onyx-950 shadow-gold transition-all duration-300 group-hover:shadow-gold-lg">
                  <Icon size={24} />
                </div>
                <h3 className="mb-2 font-heading text-xl font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <section className="py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="glass-card gold-border overflow-hidden"
        >
          <div className="relative p-8 text-center md:p-12">
            <div className="absolute inset-0 bg-gradient-to-r from-champagne-500/5 via-transparent to-rose-gold/5" />
            <div className="relative z-10">
              <h2 className="mb-4 font-heading text-2xl font-semibold gold-gradient-text md:text-3xl">
                Ready to Authenticate?
              </h2>
              <p className="mb-8 text-white/50">
                Scan any QR code to verify authenticity instantly
              </p>
              <Link to="/scan">
                <Button size="lg">
                  <ScanIcon size={20} />
                  Start Scanning
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};
