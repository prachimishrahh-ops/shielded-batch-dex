<p align="center">
  <img src="https://img.shields.io/badge/Built%20on-Aleo-blue?style=for-the-badge" alt="Built on Aleo"/>
  <img src="https://img.shields.io/badge/Status-Live%20on%20Testnet-brightgreen?style=for-the-badge" alt="Live on Testnet"/>
  <img src="https://img.shields.io/badge/Smart%20Contracts-Leo-orange?style=for-the-badge" alt="Leo Smart Contracts"/>
</p>

<h1 align="center">Shielded Batch DEX</h1>

<p align="center">
  <strong>Prove everything. Reveal nothing.</strong><br/>
  A privacy-first decentralized exchange that eliminates MEV through zero-knowledge batch auctions.
</p>

<p align="center">
  <a href="https://testnet.explorer.provable.com/program/shielded_batch_dex_v2.aleo">View Contract</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#privacy-model">Privacy Model</a>
</p>

---

## The Problem: $500M/Year Lost to MEV

Every major DEX exposes your trades to predators:

| Attack Type | How It Works | Your Loss |
|-------------|--------------|-----------|
| **Front-running** | Bots see your trade, execute first | Higher price |
| **Sandwich attacks** | Bot trades before AND after you | Squeezed on both sides |
| **Information leakage** | Order sizes reveal strategies | Competitive disadvantage |

**On transparent blockchains, MEV extraction is a feature, not a bug.**

---

## The Solution: Cryptographic Fairness

Shielded Batch DEX combines **Aleo's zero-knowledge proofs** with **Penumbra-inspired batch auction mechanics**:

```
Traditional DEX                    Shielded Batch DEX
─────────────────                  ──────────────────
Amounts visible to all      →      Amounts encrypted in ZK proofs
Sequential execution        →      Batch execution (no line to cut)
Bots can front-run          →      MEV mathematically eliminated
Different prices per user   →      Uniform clearing price for ALL
```

---

## Privacy Model

This is not "hide your address" privacy. This is **hide your NUMBERS** privacy.

| Data | Visibility | Implementation |
|------|------------|----------------|
| **Swap amounts** | PRIVATE | Encrypted in ZK proofs |
| **Your trades in batch** | PRIVATE | Commitment-based participation |
| **Balance mapping keys** | OBFUSCATED | BHP256 hash of (address, token) |
| **Claim amounts** | PRIVATE | Private records |
| Batch totals | Public | Required for price calculation |
| Clearing price | Public | Fair for all participants |

### How Privacy Is Achieved

```leo
// 1. Balance keys are hashed - not plaintext lookups
inline get_balance_key(account: address, token: field) -> field {
    return BHP256::hash_to_field(BalanceKey { account, token });
}

// 2. Swap intents include cryptographic nonce for unlinkability
record SwapIntent {
    owner: address,
    batch_id: u64,
    token_in: field,
    token_out: field,
    amount_in: u128,    // PRIVATE - hidden from validators
    nonce: field,       // Unique per swap for privacy
}

// 3. Batch execution reveals only aggregate, not individual amounts
transition execute_batch(...) {
    // Validators see: "batch executed at price X"
    // Validators DON'T see: "Alice swapped 100, Bob swapped 50"
}
```

---

## Technical Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHIELDED BATCH DEX                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   FRONTEND   │────▶│  LEO WASM    │────▶│ ALEO NETWORK │    │
│  │   Next.js    │     │  SDK Client  │     │   Testnet    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         │              ZK Proofs             On-chain           │
│         │              Generated             Verification       │
│         ▼                    ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  PRIVACY LAYER                          │   │
│  │  • BHP256 hashed mapping keys                          │   │
│  │  • Private records for swap intents                    │   │
│  │  • Encrypted amounts in transitions                    │   │
│  │  • Commitment-based batch participation                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Smart Contract (Leo)

**Core Functions:**

| Function | Privacy Level | Description |
|----------|---------------|-------------|
| `submit_swap_intent` | Amount HIDDEN | Submit private swap to batch |
| `execute_batch` | Totals public | Execute all swaps at uniform price |
| `claim_batch_output` | Output HIDDEN | Claim your share with ZK proof |
| `deposit_public` | Public | Deposit tokens (faucet for testnet) |
| `create_pool` | Public | Create liquidity pool |

**Key Data Structures:**

```leo
struct BalanceKey {
    account: address,
    token: field
}

record SwapIntent {
    owner: address,
    batch_id: u64,
    token_in: field,
    token_out: field,
    amount_in: u128,  // Private - never revealed
    nonce: field,     // Cryptographic nonce
}

record BatchOutput {
    owner: address,
    batch_id: u64,
    token: field,
    amount: u128,     // Private claim amount
}
```

### Frontend Stack

- **Framework**: Next.js 15 + React 19
- **Styling**: Tailwind CSS with custom dark theme
- **Wallet**: Leo Wallet via @demox-labs/aleo-wallet-adapter
- **ZK Client**: @provablehq/sdk for client-side BHP256 hashing
- **State**: React hooks with real-time balance updates

---

## User Experience

### Clean, Intuitive Interface

- **One-click wallet connection** with Leo Wallet
- **Real-time balance updates** using BHP256 hash computation
- **Visual batch timer** showing time until execution
- **Transaction status notifications** with explorer links
- **Mobile-responsive design** for all screen sizes

### User Flow

```
1. Connect Wallet     →  One click, instant connection
2. Claim Test Tokens  →  Faucet with immediate feedback
3. Submit Swap        →  Amount hidden, batch timer visible
4. Wait for Batch     →  ~2 minute windows, transparent countdown
5. Claim Output       →  Private records, ZK-verified claims
```

---

## Real-World Use Cases

### Why This Matters

**For Retail Traders:**
- No more losing money to MEV bots
- Trade size stays confidential
- Fair execution guaranteed by math, not trust

**For Institutions:**
- Dark pool functionality without centralized custody
- Compliance-friendly: prove trade validity without exposing strategy
- Institutional-grade privacy on public infrastructure

**For DeFi Protocols:**
- Template for MEV-resistant applications
- Demonstrates programmable privacy at scale
- Path toward compliant private finance

### Market Opportunity

- MEV extraction: **$500M+/year** stolen from users
- Dark pool market: **$1.5T+** daily volume seeking privacy
- Privacy DeFi: Fastest growing sector in crypto

---

## What Makes This Different

1. **Amount Privacy, Not Just Address Privacy**
   - Most "privacy DEXs" hide your address but show amounts
   - We hide the NUMBERS - the actual trade sizes

2. **Batch Auctions, Not AMM**
   - Inspired by Penumbra's ZSwap research
   - Uniform clearing price eliminates ordering advantage
   - MEV is mathematically impossible, not just difficult

3. **Native Aleo Integration**
   - BHP256 hashing for mapping keys (not plaintext)
   - Private records for swap intents
   - Leo smart contracts with full ZK capabilities

4. **Client-Side ZK Computation**
   - Balance key hashing done in browser via WASM
   - No reliance on centralized APIs for privacy

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Leo Wallet](https://www.leo.app/) browser extension
- Aleo testnet credits ([faucet](https://faucet.aleo.org/))

### Run Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/shielded-batch-dex.git
cd shielded-batch-dex

# Install frontend dependencies
cd frontend
npm install --legacy-peer-deps

# Start development server
npm run dev
```

Visit `http://localhost:3000` and connect your Leo Wallet.

---

## Live Deployment

| Resource | Link |
|----------|------|
| **Smart Contract** | [shielded_batch_dex_v2.aleo](https://testnet.explorer.provable.com/program/shielded_batch_dex_v2.aleo) |
| **Network** | Aleo Testnet |
| **Explorer** | [Provable Explorer](https://testnet.explorer.provable.com/) |

---

## Project Structure

```
shielded-batch-dex/
├── batch_dex/                 # Leo smart contract
│   ├── src/main.leo          # Core contract logic
│   ├── build/                # Compiled artifacts
│   └── program.json          # Contract metadata
├── frontend/                  # Next.js application
│   ├── src/
│   │   ├── app/              # Pages and layouts
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom hooks (useContract)
│   │   └── config/           # Constants and config
│   └── package.json
└── README.md
```

---

## Roadmap

- [x] Core batch swap mechanism
- [x] Private swap intents with ZK proofs
- [x] BHP256 hashed balance keys
- [x] Testnet deployment
- [x] Faucet for testing
- [x] Real-time balance updates
- [ ] Private LP positions
- [ ] Multi-hop routing
- [ ] Cross-chain bridges
- [ ] Mainnet deployment

---

## Inspired By

- **[Penumbra](https://penumbra.zone/)** - ZSwap batch auction mechanism and sealed-bid research
- **[Aleo](https://aleo.org/)** - Programmable privacy infrastructure and Leo language

---

## License

MIT

---

<p align="center">
  <strong>Prove everything. Reveal nothing.</strong><br/>
  <sub>Built with zero-knowledge proofs on Aleo.</sub>
</p>
