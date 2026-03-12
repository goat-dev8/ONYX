<p align="center">
  <img src="https://img.shields.io/badge/Aleo-Zero_Knowledge-gold?style=for-the-badge" alt="Aleo" />
  <img src="https://img.shields.io/badge/Leo_3.4-Smart_Contract-1a1a2e?style=for-the-badge" alt="Leo" />
  <img src="https://img.shields.io/badge/React_18-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Express-Backend-000?style=for-the-badge&logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Shield_Wallet-Integrated-8B5CF6?style=for-the-badge" alt="Shield Wallet" />
</p>

<h1 align="center">🔷 ONYX</h1>
<h3 align="center">Private Product Passports with Atomic Purchases on Aleo</h3>

<p align="center">
  <em>"Verify Without Revealing. Own Without Exposing. Trade Without Trusting."</em>
</p>

<p align="center">
  <code>onyxpriv_v7.aleo</code> + <code>onyxpriv_v7_pay.aleo</code> · Deployed on Aleo Testnet · 535 statements · 25 transitions · 10 record types · 8 mappings
</p>

<p align="center">
  <a href="https://onyx-drab-nine.vercel.app">🌐 Live App</a> ·
  <a href="https://explorer.aleo.org/program/onyxpriv_v7.aleo">📜 Core Contract</a> ·
  <a href="https://explorer.aleo.org/program/onyxpriv_v7_pay.aleo">💳 Payment Contract</a> ·
  <a href="https://youtu.be/bDmNRQb9aRY">📹 Demo Video</a>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> ·
  <a href="#how-onyx-works">Solution</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#smart-contracts">Smart Contracts</a> ·
  <a href="#privacy-model">Privacy</a> ·
  <a href="#atomic-purchase-system">Atomic Sales</a> ·
  <a href="#stolen-item--bounty-system">Bounties</a> ·
  <a href="#getting-started">Get Started</a>
</p>

---

## The Problem

The global counterfeit luxury goods market exceeds **$500 billion annually**. Existing solutions fail in three ways:

| Approach | Failure |
|----------|---------|
| Paper certificates | Easily forged, lost, or transferred separately from the item |
| Centralized databases | Single point of failure; brand controls all data; no consumer sovereignty |
| Public blockchains (ETH/SOL) | Expose ownership history, purchase prices, and wallet activity to **everyone** |

Luxury buyers need authentication they can **trust** — and **privacy** they can rely on.

## How ONYX Works

ONYX creates an **encrypted digital product passport** for every physical luxury item. Each passport is an `AssetArtifact` record on the Aleo blockchain — a private, owner-controlled proof of authenticity that can be verified by anyone without revealing who owns it.

```
Physical Item (watch, handbag, sneaker)
        │
        ▼
┌─────────────────────────────────┐
│   AssetArtifact (private record) │
│   ─────────────────────────────  │
│   owner:       encrypted         │  ◄── Only you can see this
│   brand:       encrypted         │
│   tag_hash:    encrypted         │
│   serial_hash: encrypted         │
│   model_id:    encrypted         │
│   nonce_seed:  encrypted         │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│   On-Chain Commitment            │
│   tag_uniqueness[BHP256(tag)]    │  ◄── Anyone can verify this exists
│   = true                         │      but CANNOT reverse-engineer
│                                  │      the tag hash from it
└─────────────────────────────────┘
```

**Six things you can do with an ONYX passport:**

1. **Verify** — Anyone scans a QR code → checks on-chain commitment → "Authentic" or "Stolen" — zero private data exposed
2. **Transfer** — Privately send ownership to another wallet — only sender and recipient know
3. **Sell Atomically** — List on marketplace → buyer pays → artifact + payment delivered in **one atomic transaction**
4. **Report Stolen** — Permanently flag the item on-chain — blocked from ALL transactions
5. **Claim Bounty** — Lock ALEO credits as recovery reward. Two claim paths: owner-authorized OR finder-provable
6. **Prove Ownership** — Generate cryptographic proof for a specific verifier without revealing your identity

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              ONYX ARCHITECTURE                                   │
│                                                                                  │
│   ┌────────────────┐        ┌────────────────┐        ┌──────────────────────┐   │
│   │    Frontend     │  REST  │    Backend      │  RPC   │   Aleo Blockchain    │   │
│   │   React + Vite  │──────▶│  Express + TS   │──────▶│  onyxpriv_v7.aleo    │   │
│   │   10 pages      │◀──────│  30+ endpoints  │◀──────│  onyxpriv_v7_pay     │   │
│   └───────┬─────────┘       └───────┬─────────┘       └──────────┬───────────┘   │
│           │                         │                            │               │
│           │ Wallet RPC              │ BHP256 WASM                │ ZK Records    │
│           ▼                         ▼                            ▼               │
│   ┌────────────────┐        ┌────────────────┐        ┌──────────────────────┐   │
│   │  Shield Wallet  │        │  LowDB (JSON)  │        │  10 Private Records  │   │
│   │  Record decrypt │        │  SHA-256 hashed │        │  8 Public Mappings   │   │
│   │  TX signing     │        │  addresses      │        │  BHP256 commitments  │   │
│   │  Credits mgmt   │        │  Zod validated  │        │  One-way hash keys   │   │
│   └────────────────┘        └────────────────┘        └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Principle

**Private data never leaves the wallet.** The backend stores only:
- `SHA-256(wallet_address)` — never the raw address
- `BHP256(tag_hash)` — the commitment, not the tag
- Listing metadata the seller **chose** to make public (title, image, price)
- Sale lifecycle state (pending → paid → completed)

**No on-chain mapping reveals who owns what, what was paid, or who bought from whom.**

---

## Smart Contracts

**Modular 2-program architecture** to stay within Aleo's per-program constraint limit:

| Program | Purpose | Statements | Lines |
|---------|---------|------------|-------|
| [`onyxpriv_v7.aleo`](https://explorer.aleo.org/program/onyxpriv_v7.aleo) | Core — passports, sales, bounties, proofs | 503 | 970 |
| [`onyxpriv_v7_pay.aleo`](https://explorer.aleo.org/program/onyxpriv_v7_pay.aleo) | Payments — USDCx & USAD stablecoin flows | 32 | ~200 |

The payment program calls back into the core via helper transitions (`reg_stablecoin_verify`, `reg_stablecoin_buy`) — secured with `assert_neq(self.caller, self.signer)` so only the payment program can invoke them, never a direct user call.

### Record Types (10)

| Record | Purpose |
|--------|---------|
| `AssetArtifact` | **The product passport** — encrypted proof of ownership with brand, model, serial, tag |
| `MintCertificate` | Brand's proof that they minted this item |
| `SaleRecord` | Locked artifact during sale — contains ALL artifact fields plus price & currency |
| `PurchaseReceipt` | Buyer's proof of payment — used for refund claims if seller doesn't deliver |
| `BuyerReceipt` | Buyer's payment confirmation after completed sale |
| `SellerReceipt` | Seller's revenue confirmation after completed sale |
| `EscrowReceipt` | Legacy escrow deposit proof |
| `BountyPledge` | Locked credits for stolen item recovery bounty |
| `ProofToken` | Cryptographic ownership proof for resale verification |
| `ProofChallenge` | Challenge record for proof verification (sent to specific verifier) |

**All records are private** — encrypted by Aleo's ZK system. Only the record owner can decrypt and read them.

### On-Chain Mappings (8)

| Mapping | Key | Value | What it reveals |
|---------|-----|-------|------------------|
| `admin` | `0u8` | address | Contract deployer |
| `registered_brands` | address | bool | Which addresses can mint |
| `tag_uniqueness` | BHP256(tag) | bool | "A product with this commitment exists" |
| `stolen_commitments` | BHP256(tag) | bool | "This product is reported stolen" |
| `escrow_timestamps` | BHP256(tag) | block height | "A payment was locked at this block" |
| `sale_active` | BHP256(tag) | bool | "A sale for this commitment is active" |
| `sale_paid` | BHP256(tag) | bool | "A sale for this commitment has been paid" |
| `bounty_amounts` | BHP256(tag) | u64 | "A bounty of this amount exists for a stolen item" |

> **Privacy evolution:** v2 had 14 mappings (leaked owner, serial, brand per artifact). v3 reduced to 5 with BHP256 commitments. v7 has 8 — only boolean flags on hashed keys + one bounty amount — minimal information leak by design.

### All Transitions (25)

**Core Program (`onyxpriv_v7.aleo`) — 21 transitions:**

```
Brand Management
  ├── register_brand()                                 — Self-register as brand (anyone)
  └── admin_remove_brand(address)                      — Admin deauthorize brand

Minting & Transfer
  ├── mint_artifact(tag, serial, model, owner)          — Brand creates product passport
  └── transfer_artifact(artifact, new_owner)            — Zero-trace private transfer

Stolen Reports & Bounty Claims
  ├── report_stolen(artifact)                           — Flag stolen (no bounty)
  ├── report_stolen_with_bounty(artifact, credits, amt) — Flag stolen + lock ALEO bounty
  ├── claim_bounty(pledge, claimer)                     — Owner-authorized bounty payout
  └── claim_bounty_recover(artifact, amount)            — Finder proves artifact → gets bounty

Verification & Proofs
  ├── pay_verification(credits, tag, amt, seller, ...)  — ALEO verification payment
  └── prove_for_resale(artifact, salt, verifier)        — Generate ZK ownership proof

Atomic Sale System
  ├── create_sale(artifact, price, currency)             — Lock artifact for sale
  ├── buy_sale_escrow(credits, tag, amount, seller)      — ALEO escrow payment
  ├── complete_sale_escrow(sale, buyer)                  — ATOMIC: artifact + credits
  ├── complete_sale_usdcx(sale, buyer)                   — ATOMIC: artifact (USDCx paid)
  ├── complete_sale_usad(sale, buyer)                     — ATOMIC: artifact (USAD paid)
  ├── cancel_sale(sale)                                   — Seller withdraws before payment
  ├── refund_sale_escrow(receipt)                         — Buyer reclaims after ~1000 blocks
  ├── refund_sale_usdcx(receipt)                          — State reset (off-chain USDCx)
  └── refund_sale_usad(receipt)                            — State reset (off-chain USAD)

Cross-Program Helpers (payment program only)
  ├── reg_stablecoin_verify(...)                          — Create receipts for stablecoin payment
  └── reg_stablecoin_buy(...)                              — Create PurchaseReceipt + update state
```

**Payment Program (`onyxpriv_v7_pay.aleo`) — 4 transitions:**
```
  ├── pay_verification_usdcx / pay_verification_usad     — Stablecoin verification payments
  └── buy_sale_usdcx / buy_sale_usad                     — Stablecoin sale purchases
```

---

## Privacy Model

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ONYX PRIVACY MODEL (v7)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ENCRYPTED (only record owner sees)     PUBLIC (anyone can check)            │
│  ──────────────────────────────────     ─────────────────────────            │
│  • Who owns each item                  • "An item with this commitment       │
│  • Tag hash & serial number               exists" (boolean)                  │
│  • Brand that minted it                 • "This commitment is flagged        │
│  • Model ID & nonce seed                  stolen" (boolean)                  │
│  • Sale price & currency                • "A sale is active/paid"            │
│  • Buyer/seller addresses                 (boolean, commitment-keyed)        │
│  • Payment amounts & receipts           • Bounty amounts (incentivize        │
│  • Transfer history (zero trace)          recovery)                          │
│  • Bounty pledge ownership              • Which addresses are brands         │
│                                         • Admin address                      │
│                                                                              │
│  BACKEND (hashed, never plaintext)      ON-CHAIN COMMITMENT SCHEME           │
│  ──────────────────────────────────     ─────────────────────────            │
│  • SHA-256(wallet_address) only         • tag_commitment = BHP256(tag_hash)  │
│  • Seller-chosen public metadata        • All sale/stolen/uniqueness keys    │
│  • Sale lifecycle state                   use same tag_commitment            │
│                                         • One-way: commitment → tag is       │
│                                           computationally infeasible         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What This Means in Practice

| Scenario | What's revealed | What stays private |
|----------|----------------|-------------------|
| Buyer scans QR code at a store | "This item is authentic and not stolen" | Who owns it, purchase price, history |
| Seller lists item on marketplace | Title, image, price, condition, brand name | Seller's real address, tag hash, serial |
| Buyer purchases item | "A sale was paid" (boolean commitment) | Buyer address, payment amount, item details |
| Item reported stolen | "This commitment is flagged stolen" | Who reported it, who owned it |
| Ownership transfer | **Nothing** | Both parties, the item, the transfer itself |
| Bounty posted | Amount of bounty | What item, who posted it |

---

## Atomic Purchase System

### The Problem Before v5

Buying an item required **two separate transactions**: buyer pays, then seller transfers. If the seller takes payment and never delivers — the buyer loses their money. This is the classic **trust gap** in peer-to-peer trade.

### The Solution: Three-Phase Atomic Sale

```
 SELLER                          BLOCKCHAIN                         BUYER
   │                                 │                                │
   │  1. create_sale(artifact)       │                                │
   │────────────────────────────────▶│                                │
   │  AssetArtifact consumed         │                                │
   │  SaleRecord created             │                                │
   │  sale_active[commit] = true     │                                │
   │                                 │                                │
   │                                 │   2. buy_sale_escrow(credits)  │
   │                                 │◀────────────────────────────────│
   │                                 │   Credits locked in program    │
   │                                 │   PurchaseReceipt → buyer      │
   │                                 │   sale_paid[commit] = true     │
   │                                 │                                │
   │  3. complete_sale_escrow()      │                                │
   │────────────────────────────────▶│                                │
   │                                 │                                │
   │          ┌──────────────────────┤  ATOMIC TRANSACTION:           │
   │          │  AssetArtifact ──────│─────────────────────────────▶  │
   │   ◀──────│  Credits             │   Artifact delivered to buyer  │
   │          │  BuyerReceipt ───────│─────────────────────────────▶  │
   │   ◀──────│  SellerReceipt       │   Receipts for both parties   │
   │          └──────────────────────┤                                │
   │                                 │   sale_active = false          │
   │                                 │   sale_paid = false            │
   │                                 │                                │
   │  IF ANY ASSERTION FAILS:        │                                │
   │  Nothing happens. Zero state    │                                │
   │  change. Buyer keeps credits.   │                                │
   │  Seller keeps artifact.         │                                │
```

### Triple Currency Support

| Currency | Buy Transition | Complete Transition | Refund | Protection |
|----------|---------------|-------------------|--------|------------|
| **ALEO** | `buy_sale_escrow` — credits locked in program | `complete_sale_escrow` — credits released to seller | `refund_sale_escrow` — credits returned | Full escrow |
| **USDCx** | `buy_sale_usdcx` — paid directly to seller | `complete_sale_usdcx` — artifact delivered | `refund_sale_usdcx` — state reset | Direct payment |
| **USAD** | `buy_sale_usad` — paid directly to seller | `complete_sale_usad` — artifact delivered | `refund_sale_usad` — state reset | Direct payment |

### Safety Mechanisms

| Protection | How it works |
|-----------|-------------|
| **Atomic delivery** | `complete_sale_*` delivers artifact AND releases payment in one TX — both happen or neither |
| **Buyer refund** | After ~1000 blocks (~80 min), buyer calls `refund_sale_escrow` to reclaim ALEO credits |
| **Seller cancel** | Before payment, seller calls `cancel_sale` to get artifact back |
| **Stolen blocking** | Every transition checks `stolen_commitments` — stolen items can't be sold or transferred |
| **Double-pay prevention** | `assert(!already_paid)` prevents multiple buyers paying for same item |
| **No half-states** | Artifact is in owner's wallet, locked in SaleRecord, or transferred — never split |

---

## Stolen Item & Bounty System

### Reporting
- `report_stolen(artifact)` — permanently flags item on-chain
- `report_stolen_with_bounty(artifact, credits, amount)` — flags + locks ALEO credits as recovery reward
- Once flagged: **blocked from all commerce** — can't transfer, sell, or verify as authentic

### Two Bounty Claim Methods

> *Directly addresses Wave 2 judge feedback: "no method to claim bounty yet"*

**1. Owner-Authorized (`claim_bounty`)**
```
Owner identifies finder → enters their address → calls claim_bounty(pledge, claimer)
→ Credits transferred to finder via credits.aleo
→ bounty_amounts mapping cleared
```

**2. Finder Recovery (`claim_bounty_recover`)**
```
Finder who has the artifact → calls claim_bounty_recover(artifact, amount)
→ Proves artifact possession (must have it in wallet)
→ Gets bounty credits automatically
→ Stolen flag CLEARED — item returns to normal circulation
→ New AssetArtifact minted to finder with updated nonce
```

### Blocking Mechanism
Every sale and transfer transition includes:
```leo
let computed_tag: field = BHP256::hash_to_field(artifact.tag_hash);
// In finalize:
assert(!stolen_commitments.get_or_use(computed_tag, false));
```

---

## Application Pages

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Animated landing page with feature highlights, privacy model visualization |
| **Vault** | `/vault` | Private dashboard: owned items, active sales (PendingSales), purchases with refund buttons, stolen alerts |
| **Marketplace** | `/marketplace` | Browse items with filters (brand, currency, condition, price sort) and pagination (20/page) |
| **Purchase** | `/purchase` | Atomic buy flow: ALEO escrow / USDCx / USAD with "Skip & Buy Anyway" for pending confirmations |
| **Mint** | `/mint` | Brand registration + artifact minting with QR code generation |
| **Scan** | `/scan` | QR camera scanner + manual tag input → real-time on-chain verification |
| **Transfer** | `/transfer` | Private zero-trace ownership transfer |
| **Prove** | `/prove` | Generate ZK ownership proof for specific verifier / verify existing proof |
| **Stolen** | `/stolen` | Report stolen items + bounty management with owner-claim and finder-recovery |
| **Escrow** | `/escrow` | Legacy escrow management |

### Complete User Flow

```
 BRAND                    SELLER                    BUYER                    VERIFIER
   │                        │                        │                        │
   │  register_brand()      │                        │                        │
   │  mint_artifact() ──────▶                        │                        │
   │  (QR code generated)   │                        │                        │
   │                        │                        │                        │
   │                        │  List on Marketplace   │                        │
   │                        │  create_sale()         │                        │
   │                        │  → Locked for Sale     │                        │
   │                        │                        │                        │
   │                        │                        │  Browse Marketplace    │
   │                        │                        │  Verify listing        │
   │                        │                        │  buy_sale_escrow()     │
   │                        │                        │  → Payment locked      │
   │                        │                        │                        │
   │                        │  complete_sale()       │                        │
   │                        │  → Credits received    │  → Artifact received   │
   │                        │     + SellerReceipt    │     + BuyerReceipt     │
   │                        │                        │                        │
   │                        │                        │  (Later, at a store)   │
   │                        │                        │                ────────▶
   │                        │                        │                Scan QR │
   │                        │                        │                ◀───────│
   │                        │                        │           "✅ Authentic"│
```

---

## API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/nonce` | — | Get signature nonce |
| POST | `/auth/verify` | — | Verify wallet signature → JWT |

### Brands
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/brands/register` | JWT | Register brand |
| GET | `/brands/me` | JWT | Current brand info |
| GET | `/brands/` | — | List all brands |
| GET | `/brands/chain-status/:address` | — | On-chain registration check |

### Artifacts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/artifacts/mint` | JWT | Record minted artifact |
| POST | `/artifacts/transfer` | JWT | Record transfer |
| POST | `/artifacts/stolen` | JWT | Report stolen |
| GET | `/artifacts/stolen/check/:tagHash` | — | Check stolen status |
| GET | `/artifacts/mine` | JWT | List owned artifacts |

### Marketplace
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/listings` | — | Browse with filters and pagination |
| GET | `/listings/:id` | — | Listing detail |
| GET | `/listings/:id/verify` | — | Fresh on-chain verification |
| POST | `/listings` | JWT | Create listing |
| PATCH | `/listings/:id` | JWT | Update listing |
| DELETE | `/listings/:id` | JWT | Delist item |

### Atomic Sales
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/sales/create` | JWT | Register new sale |
| POST | `/sales/purchase` | JWT | Record buyer payment |
| POST | `/sales/complete` | JWT | Record completion |
| POST | `/sales/cancel` | JWT | Cancel sale |
| POST | `/sales/refund` | JWT | Record refund |
| GET | `/sales/pending` | JWT | Sales awaiting action |

### Verification
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/verify/proof` | JWT | Submit ownership proof |
| GET | `/verify/token/:token` | — | Verify proof token |

---

## Getting Started

### Prerequisites
- Node.js 18+
- [Shield Wallet](https://chromewebstore.google.com/detail/shield-wallet) browser extension
- Aleo testnet credits (get from [faucet](https://faucet.aleo.org))

### Installation

```bash
git clone https://github.com/goat-dev8/ONYX.git
cd ONYX

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### Environment

**Backend** (`backend/.env`):
```env
PORT=3001
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_ALEO_PROGRAM_ID=onyxpriv_v7.aleo
VITE_ALEO_PAY_PROGRAM_ID=onyxpriv_v7_pay.aleo
VITE_ALEO_NETWORK=testnet
VITE_PROVABLE_API_BASE=https://api.explorer.provable.com/v1/testnet
```

### Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` and connect Shield Wallet.

---

## Deployment

### Smart Contracts (Deployed)

| Property | Core | Payment |
|----------|------|---------|
| Program | `onyxpriv_v7.aleo` | `onyxpriv_v7_pay.aleo` |
| Network | Aleo Testnet | Aleo Testnet |
| Deploy TX | `at1tzqv9n...se658l9` | `at1yvkf5l...s449s2h` |
| Deploy Cost | 31.047 credits | 8.008 credits |
| Leo Version | 3.4.0 | 3.4.0 |
| Statements | 503 | 32 |

### Frontend → Vercel

```
Root Directory: frontend
Build Command: npm run build
Output: dist
```

### Backend → Render

```
Root Directory: backend
Build: npm install && npm run build
Start: npm start
```

---

## Project Structure

```
ONYX/
├── contracts/                       # Core Leo smart contract
│   ├── src/main.leo                 # 970 lines, 21 transitions, 8 mappings
│   ├── imports/                     # test_usad_stablecoin.leo, test_usdcx_stablecoin.leo
│   ├── build/main.aleo              # Compiled Aleo instructions
│   └── tests/                       # Test plan + shell scripts
│
├── contracts_pay/                   # Payment Leo contract (stablecoins)
│   ├── src/main.leo                 # ~200 lines, 4 transitions
│   ├── imports/                     # Stablecoin Leo imports
│   └── build/main.aleo              # Compiled payment instructions
│
├── backend/                         # Express API server
│   ├── src/
│   │   ├── index.ts                 # Server entry, CORS, BHP256 preload
│   │   ├── types.ts                 # TypeScript interfaces
│   │   ├── lib/validate.ts          # Zod request validation (13+ schemas)
│   │   ├── middleware/auth.ts       # JWT authentication + rate limiting
│   │   ├── routes/
│   │   │   ├── auth.ts              # Wallet signature challenge-response
│   │   │   ├── brands.ts            # Brand CRUD + on-chain verification
│   │   │   ├── artifacts.ts         # Mint, transfer, stolen, verify
│   │   │   ├── listings.ts          # Marketplace CRUD + filters
│   │   │   ├── sales.ts             # Atomic sale lifecycle (8 endpoints)
│   │   │   └── verify.ts            # Proof submission + verification
│   │   └── services/
│   │       ├── db.ts                # LowDB JSON persistence (write queue)
│   │       ├── provableApi.ts       # On-chain mapping lookups via Explorer
│   │       └── bhp256.ts            # BHP256 commitment via WASM worker
│   ├── bhp256-worker.mjs            # WASM worker for BHP256 computation
│   └── data/db.json                 # Persistent JSON database
│
├── frontend/                        # React SPA
│   ├── src/
│   │   ├── App.tsx                  # Router with 10 lazy-loaded pages
│   │   ├── pages/                   # Home, Vault, Marketplace, Purchase, Mint,
│   │   │                            # Scan, Transfer, Prove, Stolen, Escrow
│   │   ├── components/
│   │   │   ├── PendingSales.tsx      # Active sales with Complete/Cancel
│   │   │   ├── marketplace/         # ListingCard, DetailModal, Filters
│   │   │   ├── ui/                  # Button, Card, Input, PendingTx
│   │   │   ├── icons/               # 14+ custom SVG icons
│   │   │   ├── layout/              # App shell + glass-morphism nav
│   │   │   └── providers/           # Wallet adapter context
│   │   ├── hooks/
│   │   │   └── useOnyxWallet.ts     # Central wallet hook (~1910 lines)
│   │   ├── stores/                  # Zustand: userStore, pendingTxStore
│   │   ├── lib/
│   │   │   ├── api.ts               # REST API client (30+ methods)
│   │   │   ├── aleo.ts              # Aleo config + record utilities
│   │   │   ├── commitment.ts        # BHP256 with WASM fallback
│   │   │   ├── types.ts             # TypeScript interfaces
│   │   │   └── usdcx.ts             # USDCx/USAD Merkle proof generation
│   │   └── styles/                  # Tailwind + luxury gold theme
│   └── vite.config.ts
│
├── docs/                            # Design documents
├── summaryv7.md                     # Complete technical summary
└── README.md                        # This file
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Blockchain | Aleo (testnet) | — |
| Smart Contract | Leo | 3.4.0 |
| Frontend | React | 18.2 |
| Build Tool | Vite | 5.4 |
| Language | TypeScript (strict) | 5.3 |
| Styling | Tailwind CSS | 3.3 |
| Animation | Framer Motion | 10.16 |
| Routing | React Router DOM | 6.20 |
| State | Zustand | 4.4 |
| Wallet | Shield Wallet Adapter | — |
| SDK | @provablehq/sdk | — |
| Backend | Express | 4.18 |
| Validation | Zod | 3.22 |
| Auth | JSON Web Tokens | 9.0 |
| Database | LowDB (JSON) | — |
| Stablecoins | USDCx + USAD (Aleo testnet) | — |
| Deployment | Vercel (FE) + Render (BE) | — |

---

## Testing

### Verified on Testnet

Full end-to-end testing with live transactions:

| Flow | Status |
|------|--------|
| Brand registration → Mint artifact → QR generation | ✅ |
| Marketplace listing → On-chain sale creation | ✅ |
| ALEO escrow purchase → Complete → Vault verification | ✅ |
| USDCx direct purchase → Complete → Vault verification | ✅ |
| USAD direct purchase → Complete → Vault verification | ✅ |
| Cancel sale → Marketplace cleanup | ✅ |
| Report stolen → Bounty lock → Bounty claim | ✅ |
| Refund after timeout (~1000 blocks) | ✅ |
| Insufficient credits rejection | ✅ |
| QR scan authenticity verification | ✅ |
| Private transfer (zero on-chain trace) | ✅ |
| Ownership proof generation + verification | ✅ |

---

## Version History

| Version | Key Changes |
|---------|-------------|
| **v1** | Proof of concept — basic mint and verify |
| **v2** | Brand system + escrow + stolen reports (14 mappings — over-exposed) |
| **v3** | Privacy overhaul — 14→5 mappings, BHP256 commitments, USDCx |
| **v4** | Marketplace + listings + bounty reports (no claim) |
| **v5** | Atomic purchases — `SaleRecord`/`PurchaseReceipt`, dual currency, zero trust gap |
| **v6** | 2-program split (constraint limits), USAD, bounty claims, self-service brands |
| **v7** | **Sale key fix** — eliminated `sale_id`, use `tag_commitment` directly, all TXs verified on testnet |

### Wave 3 Additions (v5 → v7)

| Feature | Description |
|---------|-------------|
| **Bounty claim system** | `claim_bounty` (owner-authorized) + `claim_bounty_recover` (finder-provable) |
| **USAD stablecoin** | Full integration across contracts, frontend, and backend |
| **2-program architecture** | Split core + payments to fit Aleo constraint limits |
| **Self-service brands** | `register_brand()` — removed admin bottleneck |
| **Sale key simplification** | `tag_commitment = BHP256(tag_hash)` instead of complex `sale_id` hash |
| **`bounty_amounts` mapping** | On-chain bounty tracking for transparency |
| **Purchase UX** | "Skip & Buy Anyway" for pending confirmations, refund timing info |

---

## Security

| Measure | Implementation |
|---------|---------------|
| Private keys | Never leave the wallet — all signing client-side |
| Authentication | Wallet signature → JWT token (server-validated) |
| CORS | Restricted to configured origin |
| Rate limiting | 100 requests / 15 min on auth endpoints |
| Address privacy | Backend stores `SHA-256(address)`, never plaintext |
| On-chain privacy | All mapping keys are one-way BHP256 commitments |
| Stolen blocking | Every sale/transfer checks `stolen_commitments` in finalize |
| Escrow safety | `credits.aleo` atomic deposits with 1000-block timeout refund |
| Input validation | Zod schemas on every API endpoint |
| Cross-program auth | `assert_neq(self.caller, self.signer)` on helper transitions |

---

## Links

| | |
|---|---|
| 🌐 Live App | [onyx-drab-nine.vercel.app](https://onyx-drab-nine.vercel.app) |
| 💻 GitHub | [github.com/goat-dev8/ONYX](https://github.com/goat-dev8/ONYX) |
| 📜 Core Contract | [`onyxpriv_v7.aleo`](https://explorer.aleo.org/program/onyxpriv_v7.aleo) |
| 💳 Payment Contract | [`onyxpriv_v7_pay.aleo`](https://explorer.aleo.org/program/onyxpriv_v7_pay.aleo) |
| 📹 Demo Video | [youtu.be/bDmNRQb9aRY](https://youtu.be/bDmNRQb9aRY) |

---

## License

MIT

---

<p align="center">
  <strong>Built on Aleo — Where Privacy Meets Proof 🔷</strong>
</p>
<p align="center">
  <a href="https://aleo.org">Aleo</a> ·
  <a href="https://leo-lang.org">Leo</a> ·
  <a href="https://explorer.aleo.org">Explorer</a>
</p>
