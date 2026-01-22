// Program ID - updated v2 with TRUE privacy (no public user contribution tracking)
export const PROGRAM_ID = "shielded_batch_dex_v2.aleo";

// Network configuration
export const NETWORK = "testnet";
export const API_URL = "https://api.explorer.provable.com/v1";

// Token configurations matching the Leo program
export const TOKENS = [
  {
    id: "1field",
    name: "ALEO",
    symbol: "ALEO",
    icon: "🔷",
    decimals: 6
  },
  {
    id: "2field",
    name: "USD Coin",
    symbol: "USDC",
    icon: "💵",
    decimals: 6
  },
  {
    id: "3field",
    name: "Wrapped BTC",
    symbol: "WBTC",
    icon: "🟠",
    decimals: 8
  },
  {
    id: "4field",
    name: "Wrapped ETH",
    symbol: "WETH",
    icon: "⟠",
    decimals: 18
  },
];

// Batch execution interval (in seconds)
export const BATCH_INTERVAL = 120; // 2 minutes

// Fee configuration (0.3% = 997/1000)
export const FEE_NUMERATOR = 997;
export const FEE_DENOMINATOR = 1000;
