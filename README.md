<p align="center">
  <img src="https://img.shields.io/badge/Aleo-ZK%20Privacy-gold?style=for-the-badge" alt="Aleo" />
  <img src="https://img.shields.io/badge/Leo-Smart%20Contract-black?style=for-the-badge" alt="Leo" />
  <img src="https://img.shields.io/badge/React-Frontend-blue?style=for-the-badge" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-Backend-green?style=for-the-badge" alt="Node.js" />
</p>

<h1 align="center">🔷 ONYX</h1>
<h3 align="center">Private Product Passports on Aleo Blockchain</h3>

<p align="center">
  <strong>Zero-Knowledge Authentication for Luxury Goods</strong>
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-smart-contract">Smart Contract</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-deployment">Deployment</a>
</p>

---

## 🌟 Overview

**ONYX** is a production-grade decentralized application (dApp) built on the **Aleo blockchain** that revolutionizes luxury goods authentication through **zero-knowledge proofs**. 

### The Problem
- 💰 Counterfeit luxury goods represent a **$500B+ annual** global problem
- 📄 Traditional authentication (paper certificates, QR codes) are easily forged
- 🔓 Current blockchain solutions expose too much information publicly

### Our Solution
- 🔐 **Zero-Knowledge Proofs**: Verify authenticity without revealing sensitive data
- 🔒 **Private Records**: Ownership information encrypted on-chain
- 🚨 **Public Stolen Registry**: Anyone can check if an item is reported stolen
- 🔄 **Cryptographic Transfer**: Secure ownership transfers with ZK proofs

---

## ✨ Features

### 🏭 For Luxury Brands
- **Brand Registration** - Register as authorized brand on-chain
- **Mint Passports** - Create tamper-proof digital certificates for products
- **Link NFC/RFID** - Connect physical chips to blockchain records

### 👤 For Consumers
- **Verify Authenticity** - Scan QR code to instantly verify product
- **Private Ownership** - Your purchase history stays private
- **Secure Transfer** - Transfer ownership with cryptographic proof
- **Report Stolen** - Flag items in public stolen registry

### 🔍 For Resellers
- **Generate Proof** - Create ZK proof of ownership for buyers
- **Verify History** - Check item isn't stolen before purchase
- **Privacy Preserved** - No need to reveal personal information

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ONYX ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐   │
│  │   Frontend  │────▶│   Backend   │────▶│   Aleo Blockchain   │   │
│  │  React/Vite │     │   Express   │     │   (Leo Contract)    │   │
│  └─────────────┘     └─────────────┘     └─────────────────────┘   │
│         │                   │                       │               │
│         │                   │                       │               │
│         ▼                   ▼                       ▼               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐   │
│  │ Leo Wallet  │     │   LowDB     │     │  Private Records    │   │
│  │   Shield    │     │  (Cache)    │     │  Public Mappings    │   │
│  └─────────────┘     └─────────────┘     └─────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Smart Contract** | Leo (Aleo's ZK Language) |
| **Frontend** | React 18 + TypeScript + Vite |
| **Backend** | Node.js + Express + TypeScript |
| **Styling** | Tailwind CSS + Framer Motion |
| **State** | Zustand |
| **Wallets** | Leo Wallet, Shield Wallet |
| **Database** | LowDB (JSON) |

---

## 📜 Smart Contract

### Deployed Contract
| Property | Value |
|----------|-------|
| **Program ID** | `onyxpriv_v1.aleo` |
| **Network** | Aleo Testnet Beta |
| **Deployment Block** | 14,092,647 |

### On-Chain Data Structure

```leo
program onyxpriv_v1.aleo {
    // Private record - only owner can decrypt
    record AssetArtifact {
        owner: address,        // Current owner (private)
        brand: address,        // Minting brand (private)
        tag_hash: field,       // NFC/RFID chip hash (private)
        serial_hash: field,    // Serial number hash (private)
        model_id: u64,         // Model identifier (private)
        nonce_seed: field,     // ZK proof nonce (private)
    }

    // Public mappings - anyone can read
    mapping stolen_tags: field => bool;   // Stolen item registry
    mapping minted_tags: field => bool;   // Prevents duplicate mints
}
```

### Contract Functions

| Function | Description | Privacy |
|----------|-------------|---------|
| `mint_artifact` | Create new product passport | Private record output |
| `transfer_artifact` | Transfer ownership | Consumes & creates records |
| `report_stolen` | Mark item as stolen | Updates public mapping |
| `prove_for_resale` | Generate ownership proof | Returns ZK proof token |

### Privacy Model

```
┌────────────────────────────────────────────────────────────────┐
│                     ALEO PRIVACY MODEL                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  PRIVATE (Encrypted)              PUBLIC (Visible)             │
│  ──────────────────              ────────────────              │
│  • Owner address                 • stolen_tags mapping         │
│  • Brand address                 • minted_tags mapping         │
│  • Tag hash                      • Transaction exists          │
│  • Serial hash                                                 │
│  • Model ID                                                    │
│                                                                │
│  Only the record OWNER can decrypt and view private data       │
│  Anyone can query public mappings to check stolen status       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🖥️ Application Pages

### 🏠 Home (`/`)
Landing page with hero section, feature cards, and call-to-action.

### 🔐 Vault (`/vault`)
**Your authenticated items dashboard**
- View all your AssetArtifact records from wallet
- See item details: Model ID, Tag Hash, Brand, Status
- Actions: Transfer, Report Stolen, Generate Proof
- Real-time stolen status from on-chain registry

### 🎨 Mint (`/mint`)
**Create new product passports** (Brands only)
- Register as authorized brand
- Enter Model ID and Tag Hash
- Generate QR code for physical product
- Transaction submitted to Aleo network

### 📱 Scan (`/scan`)
**Verify product authenticity**
- Camera QR code scanner
- Manual tag hash input
- Results: ✅ Authentic / 🚨 Stolen / ❓ Unknown
- Shows brand, model, and ownership info

---

## 🔗 Wallet Integration

### Supported Wallets
- **Leo Wallet** (Primary) - [Install](https://leo.app)
- **Shield Wallet** (Alternative) - [Install](https://shieldwallet.io)

### Wallet Operations
```typescript
// Connect wallet
const { publicKey, connected } = useWallet();

// Sign authentication message
const signature = await wallet.signMessage(messageBytes);

// Execute on-chain transaction
const txId = await wallet.executeTransaction({
  program: 'onyxpriv_v1.aleo',
  function: 'mint_artifact',
  inputs: [tagHash, serialHash, modelId, owner],
  fee: 1000000
});

// Fetch private records
const records = await wallet.requestRecords('onyxpriv_v1.aleo');
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Leo Wallet browser extension
- Aleo testnet credits

### Installation

```bash
# Clone repository
git clone https://github.com/goat-dev8/ONYX.git
cd ONYX

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Environment Setup

**Backend** (`backend/.env`):
```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-in-production
CORS_ORIGIN=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:3001
VITE_ALEO_PROGRAM_ID=onyxpriv_v1.aleo
VITE_ALEO_NETWORK=testnet
```

### Run Development

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Visit `http://localhost:5173` and connect your Leo Wallet!

---

## 🌐 Deployment

### Vercel (Frontend)

1. **Connect Repository**
   ```
   Vercel Dashboard → New Project → Import from GitHub → ONYX
   ```

2. **Configure Build**
   - Framework: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Environment Variables**
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com
   VITE_ALEO_PROGRAM_ID=onyxpriv_v1.aleo
   VITE_ALEO_NETWORK=testnet
   ```

### Render (Backend)

1. **Create Web Service**
   ```
   Render Dashboard → New → Web Service → Connect GitHub → ONYX
   ```

2. **Configure Service**
   - Name: `onyx-backend`
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Plan: Free or Starter

3. **Environment Variables**
   ```
   PORT=3001
   JWT_SECRET=your-production-secret-key-very-long-and-random
   CORS_ORIGIN=https://your-frontend.vercel.app
   NODE_ENV=production
   ```

### Deployment Checklist

- [ ] Update `CORS_ORIGIN` in Render to match Vercel URL
- [ ] Update `VITE_API_BASE_URL` in Vercel to match Render URL
- [ ] Generate strong `JWT_SECRET` for production
- [ ] Test wallet connection on deployed site
- [ ] Verify contract calls work on testnet

---

## 📁 Project Structure

```
ONYX/
├── contracts/                 # Leo smart contract
│   ├── src/
│   │   └── main.leo          # Contract source code
│   ├── program.json          # Program configuration
│   └── build/                # Compiled artifacts
│
├── backend/                   # Express API server
│   ├── src/
│   │   ├── index.ts          # Server entry point
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Auth middleware
│   │   └── lib/              # Utilities
│   └── data/                 # LowDB storage
│
├── frontend/                  # React application
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # UI components
│   │   ├── hooks/            # Custom hooks
│   │   ├── stores/           # Zustand state
│   │   └── lib/              # Utilities
│   └── public/               # Static assets
│
└── README.md                 # This file
```

---

## 🧪 Tested Transactions

| Action | TX ID | Block | Status |
|--------|-------|-------|--------|
| Deploy Contract | `at13s383gnmq...` | 14,092,647 | ✅ Accepted |
| Mint Artifact | `at1fth7q...` | 14,092,896 | ✅ Accepted |
| Transfer | `at1qtxj7g6uz...` | 14,093,999 | ✅ Accepted |
| Report Stolen | `at19ksdpv79p...` | 14,094,604 | ✅ Accepted |

---

## 🔒 Security

- **Private Keys**: Never stored on server, only in user's wallet
- **JWT Authentication**: Secure API access with signed tokens
- **CORS Protection**: Restricted to allowed origins
- **ZK Proofs**: Ownership verified without revealing identity
- **Rate Limiting**: Prevents abuse of authentication endpoints

---

## 🛣️ Roadmap

- [x] Smart contract deployment
- [x] Wallet integration (Leo + Shield)
- [x] Mint, Transfer, Report Stolen
- [x] QR code scanning
- [x] Stolen status registry
- [ ] Mobile app (React Native)
- [ ] NFC chip integration
- [ ] Brand dashboard analytics
- [ ] Multi-chain support

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

<p align="center">
  <strong>Built with 🔷 on Aleo - Zero-Knowledge Privacy</strong>
</p>

<p align="center">
  <a href="https://aleo.org">Aleo</a> •
  <a href="https://leo-lang.org">Leo</a> •
  <a href="https://explorer.aleo.org">Explorer</a>
</p>
