<p align="center">
  <img src="https://img.shields.io/badge/Aleo-Zero_Knowledge-gold?style=for-the-badge" alt="Aleo" />
  <img src="https://img.shields.io/badge/Leo-Smart_Contract-1a1a2e?style=for-the-badge" alt="Leo" />
  <img src="https://img.shields.io/badge/React_18-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Express-Backend-000?style=for-the-badge&logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<h1 align="center">ONYX</h1>
<h3 align="center">Private Product Passports with Atomic Purchases on Aleo</h3>

<p align="center">
  <em>Zero-knowledge authentication for luxury goods — verify without revealing, own without exposing, trade without trusting.</em>
</p>

<p align="center">
  <code>onyxpriv_v5.aleo</code> · Deployed on Aleo Testnet · 944 lines of Leo · 22 transitions · 25 tests passed
</p>

<p align="center">
  <a href="#the-problem">Problem</a> ·
  <a href="#how-onyx-works">Solution</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#smart-contract">Smart Contract</a> ·
  <a href="#privacy-model">Privacy</a> ·
  <a href="#atomic-purchase-system">Atomic Sales</a> ·
  <a href="#getting-started">Get Started</a>
</p>

---

## The Problem

The global counterfeit luxury goods market exceeds **$500 billion annually**. Existing solutions fail in three ways:

| Approach | Failure |
|----------|---------|
| Paper certificates | Easily forged, lost, or transferred separately from the item |
| Centralized databases | Single point of failure; brand controls all data; no consumer sovereignty |
| Public blockchains | Expose ownership history, purchase prices, and wallet activity to anyone |

Luxury buyers need authentication they can **trust** — and **privacy** they can rely on. These two requirements have been fundamentally at odds. Until now.

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

**Five things you can do with an ONYX passport:**

1. **Verify** — Anyone scans a QR code → checks on-chain commitment → sees "Authentic" or "Stolen" — no private data exposed
2. **Transfer** — Privately send ownership to another wallet — only sender and recipient know
3. **Report Stolen** — Permanently flag the item on-chain so it's blocked from all transactions
4. **Prove Ownership** — Generate a cryptographic proof for potential buyers without revealing your identity
5. **Sell Atomically** — List on the marketplace, receive payment, and deliver the passport in a single atomic transaction

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              ONYX ARCHITECTURE                                   │
│                                                                                  │
│   ┌────────────────┐        ┌────────────────┐        ┌──────────────────────┐   │
│   │    Frontend     │  API   │    Backend      │  RPC   │   Aleo Blockchain    │   │
│   │   React + Vite  │──────▶│  Express + TS   │──────▶│  onyxpriv_v5.aleo    │   │
│   │   Port 5173     │◀──────│  Port 3001      │◀──────│  7 mappings          │   │
│   └───────┬─────────┘       └───────┬─────────┘       └──────────┬───────────┘   │
│           │                         │                            │               │
│           │ Wallet RPC              │ BHP256                     │ Records       │
│           ▼                         ▼                            ▼               │
│   ┌────────────────┐        ┌────────────────┐        ┌──────────────────────┐   │
│   │  Shield Wallet  │        │  LowDB (JSON)  │        │  Private Records     │   │
│   │  Record decrypt │        │  Listings/Sales │        │  AssetArtifact       │   │
│   │  TX signing     │        │  Artifacts/Auth │        │  SaleRecord          │   │
│   │  Credits mgmt   │        │  Event log      │        │  PurchaseReceipt     │   │
│   └────────────────┘        └────────────────┘        │  BuyerReceipt        │   │
│                                                        │  SellerReceipt       │   │
│                                                        └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Principle

**Private data never leaves the wallet.** The backend stores only:
- `SHA-256(wallet_address)` — never the raw address
- `BHP256(tag_hash)` — the commitment, not the tag
- Listing metadata the seller **chose** to make public (title, image, price)
- Sale lifecycle state (pending → paid → completed)

The Aleo blockchain stores only:
- Boolean commitments (`tag_uniqueness[commitment] = true`)
- Stolen flags (`stolen_commitments[commitment] = true`)
- Sale state booleans (`sale_active`, `sale_paid`)

**No on-chain mapping reveals who owns what, what was paid, or who bought from whom.**

---

## Smart Contract

**Program:** `onyxpriv_v5.aleo` · **Language:** Leo 3.4.0 · **Lines:** 944 · **Constraints:** 503

### Record Types (10)

| Record | Purpose |
|--------|---------|
| `AssetArtifact` | The product passport — encrypted proof of ownership with brand, model, serial, tag |
| `MintCertificate` | Brand's proof that they minted this item |
| `SaleRecord` | Locked artifact during sale — contains ALL artifact fields plus price, currency, sale_id |
| `PurchaseReceipt` | Buyer's proof of payment — used for refund claims if seller doesn't deliver |
| `BuyerReceipt` | Buyer's payment confirmation after completed sale |
| `SellerReceipt` | Seller's payment confirmation after completed sale |
| `EscrowReceipt` | Legacy escrow deposit proof (v4 compatibility) |
| `ProofToken` | Cryptographic ownership proof for resale verification |
| `ProofChallenge` | Challenge record for proof generation |
| `BountyPledge` | Locked credits for stolen item recovery bounty |

### On-Chain Mappings (7)

| Mapping | Key | Value | What it reveals |
|---------|-----|-------|-----------------|
| `admin` | `0` | address | Who deployed the contract |
| `registered_brands` | address | bool | Which addresses can mint |
| `tag_uniqueness` | BHP256(tag) | bool | "A product with this commitment exists" |
| `stolen_commitments` | BHP256(tag) | bool | "This product is reported stolen" |
| `escrow_timestamps` | BHP256(id) | block height | "A payment was locked at this block" |
| `sale_active` | BHP256(sale_id) | bool | "A sale with this commitment is active" |
| `sale_paid` | BHP256(sale_id) | bool | "A sale with this commitment has been paid" |

> **Privacy evolution:** v2 had 14 mappings (leaked owner, serial, brand per artifact). v3 reduced to 5 with BHP256 commitments. v5 added only 2 boolean mappings for atomic sales — minimal information leak by design.

### All 22 Transitions

```
Brand Management
  ├── register_brand()                    — Self-register as a brand (no admin needed)
  └── admin_remove_brand(address)         — Admin removes a brand

Minting & Transfer
  ├── mint_artifact(tag, serial, model, owner)  — Brand creates product passport
  └── transfer_artifact(artifact, new_owner)    — Private ownership transfer

Stolen Reports
  ├── report_stolen(artifact)                   — Flag item on-chain (irreversible)
  └── report_stolen_with_bounty(artifact, credits, amount) — Flag + lock bounty

Resale Proofs
  └── prove_for_resale(artifact, salt, verifier) — Generate ZK ownership proof

Atomic Sale System (v5)
  ├── create_sale(artifact, price, currency, salt)       — Lock artifact for sale
  ├── buy_sale_escrow(credits, tag, amount, seller, id)  — Pay with ALEO
  ├── buy_sale_usdcx(token, seller, amount, tag, id)     — Pay with USDCx
  ├── complete_sale_escrow(sale, buyer)   — ATOMIC: artifact + credits in one TX
  ├── complete_sale_usdcx(sale, buyer)    — ATOMIC: artifact delivery
  ├── cancel_sale(sale)                   — Seller withdraws (before payment only)
  ├── refund_sale_escrow(receipt)         — Buyer reclaims after timeout
  └── refund_sale_usdcx(receipt)          — Reset state for USDCx refund

Legacy Escrow (v4)
  ├── create_escrow(credits, tag, amount, seller, salt)  — Lock credits
  ├── release_escrow(receipt)             — Pay seller
  └── refund_escrow(receipt)              — Reclaim after timeout

Verification Payments (v4)
  ├── pay_verification(credits, seller, amount, tag, salt)  — Pay with ALEO
  └── pay_verification_usdcx(token, seller, amount, ...)    — Pay with USDCx

Migration
  ├── bootstrap_stolen(commitment)        — Admin migrates stolen flags
  └── bootstrap_tag(commitment)           — Admin migrates tag data
```

---

## Privacy Model

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ONYX PRIVACY MODEL (v5)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ENCRYPTED (only record owner sees)     PUBLIC (anyone can check)            │
│  ──────────────────────────────────     ─────────────────────────            │
│  • Who owns each item                  • "An item with this commitment       │
│  • Item tag hash & serial number          exists" (boolean)                  │
│  • Brand that minted the item           • "This commitment is flagged        │
│  • Model ID & nonce seed                  stolen" (boolean)                  │
│  • Sale price & currency                • "A sale is active/paid"            │
│  • Buyer/seller addresses                 (boolean, commitment-keyed)        │
│  • Payment amounts & receipts           • Which addresses are brands         │
│  • Transfer history                     • Admin address                      │
│                                                                              │
│  BACKEND (hashed, never plaintext)      ON-CHAIN COMMITMENT SCHEME           │
│  ──────────────────────────────────     ─────────────────────────            │
│  • SHA-256(wallet_address) as seller ID • tag_commitment = BHP256(tag_hash)  │
│  • Listing metadata (seller chose       • sale_id = BHP256(tag + salt +      │
│    to publish: title, image, price)       seller_hash)                       │
│  • Sale lifecycle state                 • sale_commitment = BHP256(sale_id)  │
│                                         • Knowing commitment ≠ knowing tag   │
│                                           (one-way hash, irreversible)       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What This Means in Practice

| Scenario | What's revealed | What stays private |
|----------|----------------|-------------------|
| Buyer scans QR code at a store | "This item is authentic and not stolen" | Who owns it, purchase price, history |
| Seller lists item on marketplace | Title, image, price, condition, brand name | Seller's real address, tag hash, serial |
| Buyer purchases item | "A sale was paid" (boolean commitment) | Buyer address, payment amount, item details |
| Item reported stolen | "This commitment is flagged stolen" | Who reported it, who owned it |
| Ownership transfer | Nothing | Both parties, the item, the transfer itself |

---

## Atomic Purchase System

### The Problem ONYX v5 Solves

In previous versions (v3/v4), buying an item required **two separate transactions**: the buyer pays, then the seller transfers the artifact. If the seller takes payment and never delivers — the buyer loses their money. This is the classic **trust gap** in peer-to-peer trade.

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

### Safety Mechanisms

| Protection | How it works |
|-----------|-------------|
| **Buyer refund** | After ~1000 blocks (~80 min), buyer calls `refund_sale_escrow` to reclaim credits |
| **Seller cancel** | Before payment, seller calls `cancel_sale` to get artifact back |
| **Stolen blocking** | Every transition checks `stolen_commitments` — stolen items can't be sold |
| **Double-pay prevention** | `assert(!already_paid)` prevents multiple buyers from paying |
| **Atomic delivery** | `complete_sale` delivers artifact AND releases credits in one TX — both happen or neither |

### Dual Currency Support

| Currency | Buy Transition | Complete Transition | Refund |
|----------|---------------|-------------------|--------|
| **ALEO** | `buy_sale_escrow` — credits locked in program | `complete_sale_escrow` — credits released to seller | `refund_sale_escrow` — credits returned to buyer |
| **USDCx** | `buy_sale_usdcx` — stablecoin paid to seller directly | `complete_sale_usdcx` — artifact delivered | `refund_sale_usdcx` — state reset (off-chain coordination) |

---

## Application Pages

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Landing page with feature highlights and call-to-action |
| **Vault** | `/vault` | Private dashboard: owned items, active sales, locked artifacts. Auto-refreshes every 30s. |
| **Marketplace** | `/marketplace` | Browse authenticated items with filters (brand, currency, condition, price sort, pagination) |
| **Purchase** | `/purchase` | Atomic buy flow with ALEO or USDCx payment |
| **Mint** | `/mint` | Brand registration + artifact minting with QR code generation |
| **Scan** | `/scan` | QR code scanner + manual tag input for authenticity verification |
| **Transfer** | `/transfer` | Private ownership transfer to another wallet |
| **Prove** | `/prove` | Generate or verify cryptographic ownership proofs |
| **Stolen** | `/stolen` | Report items as stolen with optional bounty |
| **Escrow** | `/escrow` | Legacy escrow system for private deals outside the marketplace |

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
   │                        │                        │                "Authentic"
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
| GET | `/brands/:address` | — | Lookup brand |
| GET | `/brands/chain-status/:address` | — | On-chain registration check |

### Artifacts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/artifacts/mint` | JWT | Record minted artifact |
| POST | `/artifacts/transfer` | JWT | Record transfer |
| POST | `/artifacts/stolen` | JWT | Report stolen |
| GET | `/artifacts/stolen/check/:tagHash` | — | Check stolen status |
| GET | `/artifacts/mine` | JWT | List owned artifacts |
| GET | `/artifacts/:tagHash` | — | Verify authenticity |

### Marketplace
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/listings` | — | Browse with filters and pagination |
| GET | `/listings/my/all` | JWT | Seller's own listings |
| GET | `/listings/:id` | — | Listing detail |
| GET | `/listings/:id/verify` | — | On-chain verification |
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
| GET | `/sales/pending-completions` | JWT | Sales awaiting completion |
| GET | `/sales/my/all` | JWT | User's sales |
| GET | `/sales/by-listing/:listingId` | — | Sale by listing |
| GET | `/sales/:saleId/status` | — | Sale status + on-chain state |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Shield Wallet browser extension
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
VITE_ALEO_PROGRAM_ID=onyxpriv_v5.aleo
VITE_ALEO_NETWORK=testnet
```

### Run

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173` and connect Shield Wallet.

---

## Deployment

### Smart Contract

| Property | Value |
|----------|-------|
| Program | `onyxpriv_v5.aleo` |
| Network | Aleo Testnet |
| Deploy TX | `at13f6yk45rhzldf0hren4ddnyjlf3kzgejt8fk65ttfs6686agng9sn7w6dv` |
| Cost | 32.856674 credits |
| Leo version | 3.4.0 |
| Constraints | 503 |

### Frontend → Vercel

```
Root Directory: frontend
Build Command: npm run build
Output: dist
```

Environment: `VITE_API_BASE_URL=https://your-backend.onrender.com`

### Backend → Render

```
Root Directory: backend
Build: npm install && npm run build
Start: npm start
```

Environment: `JWT_SECRET`, `CORS_ORIGIN`, `PORT=3001`

---

## Project Structure

```
ONYX/
├── contracts_v5/                    # Leo smart contract (v5 — current)
│   ├── src/main.leo                 # 944 lines, 22 transitions, 7 mappings
│   ├── imports/                     # credits.aleo, test_usdcx_stablecoin.aleo
│   ├── build/main.aleo              # Compiled Aleo instructions
│   └── tests/                       # Test plan + shell scripts
│
├── backend/                         # Express API server
│   ├── src/
│   │   ├── index.ts                 # Server entry, route mounting, BHP256 preload
│   │   ├── types.ts                 # TypeScript interfaces
│   │   ├── lib/validate.ts          # Zod request validation schemas
│   │   ├── middleware/auth.ts       # JWT authentication
│   │   ├── routes/
│   │   │   ├── auth.ts              # Nonce/signature authentication
│   │   │   ├── brands.ts            # Brand registration & lookup
│   │   │   ├── artifacts.ts         # Mint, transfer, stolen, verify
│   │   │   ├── listings.ts          # Marketplace CRUD + filters
│   │   │   └── sales.ts             # Atomic sale lifecycle
│   │   └── services/
│   │       ├── db.ts                # LowDB JSON persistence
│   │       ├── provableApi.ts       # On-chain mapping lookups
│   │       └── bhp256.ts            # BHP256 commitment computation
│   └── data/db.json                 # Persistent database
│
├── frontend/                        # React SPA
│   ├── src/
│   │   ├── App.tsx                  # Router with 10 lazy-loaded pages
│   │   ├── pages/                   # Home, Vault, Marketplace, Purchase, Mint,
│   │   │                            # Scan, Transfer, Prove, Stolen, Escrow
│   │   ├── components/
│   │   │   ├── marketplace/         # ListingCard, ListingDetailModal, Filters
│   │   │   ├── PendingSales.tsx      # Active/past sales with Complete/Cancel
│   │   │   ├── ui/                  # Button, Card, Input, PendingTx
│   │   │   ├── icons/               # SVG icon components
│   │   │   └── layout/              # App shell + navigation
│   │   ├── hooks/
│   │   │   └── useOnyxWallet.ts     # Central wallet hook (~1910 lines)
│   │   ├── stores/                  # Zustand: userStore, pendingTxStore
│   │   ├── lib/                     # API client, types, aleo utils, commitment
│   │   └── styles/index.css         # Tailwind + custom theme
│   └── vite.config.ts
│
├── contracts/                       # Legacy v4 contract (preserved)
├── summaryv5.md                     # Complete project documentation
└── README.md                        # This file
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Blockchain | Aleo (testnet) | — |
| Smart Contract | Leo | 3.4.0 |
| Frontend | React | 18.2 |
| Build Tool | Vite | 5.0 |
| Language | TypeScript (strict) | 5.3 |
| Styling | Tailwind CSS | 3.3 |
| Animation | Framer Motion | 10.16 |
| Routing | React Router DOM | 6.20 |
| State | Zustand | 4.4 |
| Wallet | Shield Wallet Adapter | 0.3.0-alpha.2 |
| SDK | @provablehq/sdk | 0.9.15 |
| Backend | Express | 4.18 |
| Validation | Zod | 3.22 |
| Auth | JSON Web Tokens | 9.0 |
| Database | LowDB (JSON) | — |
| Stablecoin | USDCx (test_usdcx_stablecoin.aleo) | — |

---

## Testing

### 25 Tests Passed on Testnet

| # | Test | Result |
|---|------|--------|
| 1 | Leo contract build (503 constraints) | PASS |
| 2 | Deploy to testnet (32.85 credits) | PASS |
| 3 | Brand self-registration (v5) | PASS |
| 4 | Brand re-registration (v4→v5 migration) | PASS |
| 5 | Mint artifact | PASS |
| 6 | View artifacts in Vault | PASS |
| 7 | Create marketplace listing | PASS |
| 8 | Create on-chain sale (create_sale) | PASS |
| 9 | Register sale with backend | PASS |
| 10 | Reject purchase with insufficient credits | PASS |
| 11 | Backend createSale endpoint | PASS |
| 12 | SaleRecord vs MintCertificate detection | PASS |
| 13 | TypeScript compilation (frontend) | PASS |
| 14 | TypeScript compilation (backend) | PASS |
| 15 | Backend startup + BHP256 service | PASS |
| 16 | Marketplace filters & pagination | PASS |
| 17 | Full ALEO purchase (buy_sale_escrow) | PASS |
| 18 | Complete ALEO sale (artifact + credits) | PASS |
| 19 | Buyer sees artifact after ALEO purchase | PASS |
| 20 | Full USDCx purchase (buy_sale_usdcx) | PASS |
| 21 | Complete USDCx sale (artifact delivery) | PASS |
| 22 | Buyer sees artifact after USDCx purchase | PASS |
| 23 | End-to-end: Mint → List → Buy → Complete → Vault | PASS |
| 24 | USDCx fractional pricing (0.30 USDCx) | PASS |
| 25 | Cancel sale (on-chain + marketplace cleanup) | PASS |

### 25 Bugs Fixed

All bugs discovered during development and testing were identified, root-caused, and resolved. See [summaryv5.md](summaryv5.md) for the complete bug log with root causes and fixes.

Key fixes include:
- Atomic sale field naming (`saleSalt` → `onChainSaleId` across 7 files)
- SaleRecord detection priority over MintCertificate
- USDCx 6-decimal price scaling across 6 display files
- Cancel sale marketplace cleanup (on-chain + backend + listing deletion)
- Vault auto-refresh with silent mode and debounce
- Insufficient credits handling with exact error messages

---

## Version History

| Version | Key Changes |
|---------|-------------|
| **v1** | Proof of concept — basic mint and verify |
| **v2** | Brand system + escrow + stolen reports (14 mappings — over-exposed) |
| **v3** | Privacy overhaul — 14→5 mappings, BHP256 commitments, no per-artifact public data |
| **v4** | Marketplace + listings + USDCx stablecoin + bounty system |
| **v5** | Atomic purchases — 8 new transitions, `SaleRecord`/`PurchaseReceipt` records, dual currency, zero trust gap |

---

## Security

| Measure | Implementation |
|---------|---------------|
| Private keys | Never leave the wallet — all signing client-side |
| Authentication | Wallet signature → JWT token (server-validated) |
| CORS | Restricted to configured origin |
| Rate limiting | 100 requests / 15 min on auth endpoints |
| Address privacy | Backend stores `SHA-256(address)`, never plaintext |
| On-chain privacy | All lookups use one-way BHP256 commitments |
| Stolen blocking | Every sale/transfer transition checks `stolen_commitments` |
| Escrow safety | `credits.aleo` atomic deposits with 1000-block timeout refund |
| Input validation | Zod schemas on every API endpoint |

---

## License

MIT

---

<p align="center">
  <strong>Built on Aleo — Where Privacy Meets Proof</strong>
</p>
<p align="center">
  <a href="https://aleo.org">Aleo</a> ·
  <a href="https://leo-lang.org">Leo</a> ·
  <a href="https://explorer.aleo.org">Explorer</a>
</p>
