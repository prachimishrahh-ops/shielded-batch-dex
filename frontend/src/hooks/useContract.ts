"use client";

import { useCallback, useState, useEffect } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { Transaction, WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID, API_URL } from "@/config/constants";

// SDK types for dynamic import
type InitializeWasm = () => Promise<void>;
type BHP256Class = new () => { hash: (input: unknown[]) => { toString: () => string } };
type PlaintextClass = { fromString: (str: string) => unknown };

export interface SwapIntentParams {
  tokenInId: string;
  tokenOutId: string;
  amountIn: string;
  minAmountOut: string;
}

export interface ClaimParams {
  batchId: number;
  tokenInId: string;
  tokenOutId: string;
}

export interface PoolInfo {
  reserve_a: string;
  reserve_b: string;
  total_lp: string;
}

export interface BatchInfo {
  id: number;
  total_a: string;
  total_b: string;
  participants: number;
  executed: boolean;
}

// WASM module cache for dynamic import
let wasmModule: {
  initializeWasm: InitializeWasm;
  BHP256: BHP256Class;
  Plaintext: PlaintextClass;
} | null = null;
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

// Dynamically import and initialize WASM (singleton pattern, client-side only)
async function ensureWasmInitialized(): Promise<typeof wasmModule> {
  // Only run on client
  if (typeof window === 'undefined') {
    throw new Error('WASM can only be initialized on the client side');
  }

  if (wasmInitialized && wasmModule) return wasmModule;

  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        // Dynamic import to avoid SSR issues
        const sdk = await import('@provablehq/sdk');
        wasmModule = {
          initializeWasm: sdk.initializeWasm,
          BHP256: sdk.BHP256 as unknown as BHP256Class,
          Plaintext: sdk.Plaintext as unknown as PlaintextClass,
        };

        await wasmModule.initializeWasm();
        wasmInitialized = true;
        console.log('[WASM] Initialized successfully');
      } catch (err) {
        console.error('[WASM] Initialization failed:', err);
        wasmInitPromise = null;
        throw err;
      }
    })();
  }

  await wasmInitPromise;
  return wasmModule!;
}

/**
 * Compute the balance mapping key matching the Leo contract's get_balance_key function.
 *
 * Leo contract uses:
 *   struct BalanceKey { account: address, token: field }
 *   inline get_balance_key(account_addr: address, token: field) -> field {
 *     return BHP256::hash_to_field(BalanceKey { account: account_addr, token: token });
 *   }
 *
 * @param address - The Aleo address (e.g., "aleo1...")
 * @param tokenId - The token field ID (e.g., "1field")
 * @returns The computed field hash as a string
 */
async function computeBalanceKey(address: string, tokenId: string): Promise<string> {
  const sdk = await ensureWasmInitialized();
  if (!sdk) {
    throw new Error('Failed to initialize WASM SDK');
  }

  // Ensure tokenId has the "field" suffix
  const normalizedTokenId = tokenId.endsWith('field') ? tokenId : `${tokenId}field`;

  // Create the struct plaintext matching Leo's BalanceKey { account: address, token: field }
  // Format: { account: aleo1..., token: 1field }
  const structStr = `{ account: ${address}, token: ${normalizedTokenId} }`;
  console.log('[computeBalanceKey] Creating struct plaintext:', structStr);

  try {
    // Parse the struct string into a Plaintext object
    const structPlaintext = sdk.Plaintext.fromString(structStr);

    // Convert plaintext to bits for hashing (BHP256 expects bit array)
    const bits = (structPlaintext as unknown as { toBitsLe: () => boolean[] }).toBitsLe();
    console.log('[computeBalanceKey] Converted to bits, length:', bits.length);

    // Create BHP256 hasher and hash the bits
    const hasher = new sdk.BHP256();
    const hashResult = hasher.hash(bits);

    // Convert to string format for API query
    const hashString = hashResult.toString();
    console.log('[computeBalanceKey] Hash result:', hashString);

    return hashString;
  } catch (error) {
    console.error('[computeBalanceKey] Error computing hash:', error);
    throw error;
  }
}

// Parse Aleo value string to number
function parseAleoValue(value: string | null): number {
  if (!value || value === "null" || value === "\"null\"") return 0;

  // Remove surrounding quotes if present (API returns "14921652u64" with quotes)
  let cleaned = value.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove type suffix like "u128" or "u64" or "field"
  cleaned = cleaned.replace(/u\d+$/, "").replace(/field$/, "");

  const parsed = parseInt(cleaned);
  console.log(`[parseAleoValue] Input: ${value} -> Cleaned: ${cleaned} -> Parsed: ${parsed}`);

  return parsed || 0;
}

// Format number for display (divide by 1_000_000 for 6 decimals)
function formatAmount(value: number, decimals: number = 6): string {
  return (value / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals
  });
}

export function useContract() {
  const { publicKey, requestTransaction, requestRecordPlaintexts, requestRecords } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submit a private swap intent to the batch
  const submitSwapIntent = useCallback(
    async (params: SwapIntentParams) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const amountInU128 = `${BigInt(Math.floor(parseFloat(params.amountIn) * 1_000_000))}u128`;
        const minAmountOutU128 = `${BigInt(Math.floor(parseFloat(params.minAmountOut) * 1_000_000))}u128`;

        // Generate a unique nonce for privacy (random 128-bit number as field)
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const nonceValue = Array.from(randomBytes).reduce(
          (acc, byte, i) => acc + BigInt(byte) * (BigInt(256) ** BigInt(i)),
          BigInt(0)
        );
        const nonce = `${nonceValue}field`;

        console.log('[submitSwapIntent] Generated nonce for privacy:', nonce);

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "submit_swap_intent",
          [
            params.tokenInId,
            params.tokenOutId,
            amountInU128,
            minAmountOutU128,
            nonce,  // Unique nonce for commitment-based privacy
          ],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit swap intent";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // Execute an instant swap (non-batch)
  const swapInstant = useCallback(
    async (params: SwapIntentParams) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const amountInU128 = `${BigInt(Math.floor(parseFloat(params.amountIn) * 1_000_000))}u128`;
        const minAmountOutU128 = `${BigInt(Math.floor(parseFloat(params.minAmountOut) * 1_000_000))}u128`;

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "swap_instant",
          [
            params.tokenInId,
            params.tokenOutId,
            amountInU128,
            minAmountOutU128,
          ],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to execute swap";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // Create a new pool (when no pool exists)
  const createPool = useCallback(
    async (tokenA: string, tokenB: string, amountA: string, amountB: string, minLP: string) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        console.log('[createPool] Creating new pool with:', { tokenA, tokenB, amountA, amountB, minLP });

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "create_pool", // Use create_pool for new pools
          [
            tokenA,
            tokenB,
            `${BigInt(Math.floor(parseFloat(amountA) * 1_000_000))}u128`,
            `${BigInt(Math.floor(parseFloat(amountB) * 1_000_000))}u128`,
            `${BigInt(Math.floor(parseFloat(minLP) * 1_000_000))}u128`,
          ],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        console.log('[createPool] Transaction submitted:', txId);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create pool";
        console.error('[createPool] Error:', err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // Add liquidity to existing pool
  const addLiquidity = useCallback(
    async (tokenA: string, tokenB: string, amountA: string, amountB: string, minLP: string) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        console.log('[addLiquidity] Adding to existing pool:', { tokenA, tokenB, amountA, amountB, minLP });

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "add_liquidity_public",
          [
            tokenA,
            tokenB,
            `${BigInt(Math.floor(parseFloat(amountA) * 1_000_000))}u128`,
            `${BigInt(Math.floor(parseFloat(amountB) * 1_000_000))}u128`,
            `${BigInt(Math.floor(parseFloat(minLP) * 1_000_000))}u128`,
          ],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        console.log('[addLiquidity] Transaction submitted:', txId);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add liquidity";
        console.error('[addLiquidity] Error:', err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // Claim batch output
  // Takes a record object that should have a `plaintext` field containing the full record with _nonce
  const claimBatchOutput = useCallback(
    async (claimRecord: { plaintext?: string; ciphertext?: string; data?: Record<string, string> }) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        // Use the plaintext record which includes the _nonce for transaction input
        // The plaintext should be in format: "{ owner: aleo1..., batch_id: 1u64, ..., _nonce: ... }"
        let recordInput: string;

        if (claimRecord.plaintext) {
          // Use the full plaintext (includes _nonce needed for spending)
          recordInput = claimRecord.plaintext;
          console.log('[claimBatchOutput] Using plaintext record with nonce');
        } else if (claimRecord.ciphertext) {
          // If only ciphertext available, use it (wallet may decrypt)
          recordInput = claimRecord.ciphertext;
          console.log('[claimBatchOutput] Using ciphertext (wallet will decrypt)');
        } else {
          // Fallback - try to serialize the record
          recordInput = JSON.stringify(claimRecord);
          console.warn('[claimBatchOutput] No plaintext/ciphertext, using serialized data');
        }

        console.log('[claimBatchOutput] Record input:', recordInput.substring(0, 100) + '...');

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "claim_batch_output",
          [recordInput],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to claim batch output";
        console.error('[claimBatchOutput] Error:', message, err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  // Get user's records (claims, intents, etc.)
  // Uses requestRecordPlaintexts to get records WITH nonce for transaction inputs
  const getUserRecords = useCallback(async () => {
    if (!requestRecordPlaintexts && !requestRecords) {
      return { claims: [], intents: [], lpTokens: [] };
    }

    try {
      let records: unknown[] = [];

      // Try requestRecordPlaintexts first - this returns records WITH _nonce needed for transactions
      if (requestRecordPlaintexts) {
        try {
          console.log('[getUserRecords] Trying requestRecordPlaintexts for full record data with nonce...');
          // Wrap in Promise to ensure all errors are caught as rejections
          const plaintextRecords = await Promise.resolve().then(() => requestRecordPlaintexts(PROGRAM_ID)).catch((e) => {
            console.warn('[getUserRecords] requestRecordPlaintexts permission error:', e?.message || e);
            return null;
          });
          console.log('[getUserRecords] Got plaintext records:', plaintextRecords?.length || 0);

          // Parse plaintext records - they come as strings like "{owner: aleo1..., amount: 100u128, _nonce: ...}"
          records = (plaintextRecords || []).map((record: { plaintext?: string; ciphertext?: string; id?: string }) => {
            // The plaintext string needs to be preserved for transaction input
            const plaintext = record.plaintext || '';
            const ciphertext = record.ciphertext || '';

            // Parse the data fields from the plaintext for filtering
            const data: Record<string, string> = {};
            const fieldMatches = plaintext.matchAll(/(\w+):\s*([^,}]+)/g);
            for (const match of fieldMatches) {
              const [, key, value] = match;
              if (key && value && key !== 'owner' && key !== '_nonce') {
                data[key] = value.trim();
              }
            }

            return {
              id: record.id || ciphertext.slice(0, 20),
              plaintext, // Full plaintext with _nonce for transaction input
              ciphertext,
              data,
            };
          });
        } catch (plaintextError) {
          console.warn('[getUserRecords] requestRecordPlaintexts failed, trying requestRecords:', plaintextError);
        }
      }

      // Fallback to requestRecords if plaintexts not available
      if (records.length === 0 && requestRecords) {
        try {
          console.log('[getUserRecords] Falling back to requestRecords (records may not have nonce)...');
          // Wrap in Promise to ensure all errors are caught as rejections
          const basicRecords = await Promise.resolve().then(() => requestRecords(PROGRAM_ID)).catch((e) => {
            console.warn('[getUserRecords] requestRecords permission error:', e?.message || e);
            return null;
          });
          records = basicRecords || [];
          console.log('[getUserRecords] Got basic records:', records.length);
        } catch (recordsError) {
          console.warn('[getUserRecords] requestRecords also failed:', recordsError);
          // Continue with empty records - don't break the app
        }
      }

      // Filter records by type
      const claims = records.filter((r: unknown) => {
        const rec = r as { data?: { batch_id?: string }; plaintext?: string };
        return rec.data?.batch_id !== undefined || (rec.plaintext && rec.plaintext.includes('batch_id'));
      });

      const intents = records.filter((r: unknown) => {
        const rec = r as { data?: { token_in?: string }; plaintext?: string };
        return rec.data?.token_in !== undefined || (rec.plaintext && rec.plaintext.includes('token_in'));
      });

      const lpTokens = records.filter((r: unknown) => {
        const rec = r as { data?: { lp_amount?: string }; plaintext?: string };
        return rec.data?.lp_amount !== undefined || (rec.plaintext && rec.plaintext.includes('lp_amount'));
      });

      console.log('[getUserRecords] Filtered - claims:', claims.length, 'intents:', intents.length, 'lpTokens:', lpTokens.length);
      return { claims, intents, lpTokens };
    } catch (err) {
      console.error('[getUserRecords] Error fetching records:', err);
      return { claims: [], intents: [], lpTokens: [] };
    }
  }, [requestRecordPlaintexts, requestRecords]);

  // Claim test tokens from faucet (calls deposit_public on contract)
  const claimFaucetTokens = useCallback(
    async (tokenId: string, amount: string) => {
      if (!publicKey || !requestTransaction) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        // Convert amount to u128 (with 6 decimals)
        const amountU128 = `${BigInt(Math.floor(parseFloat(amount) * 1_000_000))}u128`;

        console.log(`[claimFaucetTokens] Claiming ${amount} of token ${tokenId}`);
        console.log(`[claimFaucetTokens] Amount as u128: ${amountU128}`);

        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          PROGRAM_ID,
          "deposit_public", // This is the faucet function in the contract
          [
            tokenId,      // Token field ID (e.g., "1field", "2field")
            amountU128,   // Amount to mint
          ],
          100_000,
          false // Use public fee (not private record)
        );

        const txId = await requestTransaction(transaction);
        console.log(`[claimFaucetTokens] Transaction submitted: ${txId}`);
        return txId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to claim faucet tokens";
        console.error('[claimFaucetTokens] Error:', err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [publicKey, requestTransaction]
  );

  return {
    submitSwapIntent,
    swapInstant,
    createPool,
    addLiquidity,
    claimBatchOutput,
    getUserRecords,
    claimFaucetTokens,
    loading,
    error,
    formatAmount,
    parseAleoValue,
  };
}

// Fetch user's public balance for a token
export async function fetchPublicBalance(address: string, tokenId: string): Promise<number> {
  try {
    // Compute the balance key hash matching the Leo contract's BHP256 hash
    const mappingKey = await computeBalanceKey(address, tokenId);
    const url = `${API_URL}/testnet/program/${PROGRAM_ID}/mapping/public_balances/${mappingKey}`;

    console.log(`[fetchPublicBalance] Fetching token ${tokenId} balance from:`, url);
    console.log(`[fetchPublicBalance] Address:`, address);
    console.log(`[fetchPublicBalance] Computed mapping key (BHP256 hash):`, mappingKey);

    const response = await fetch(url);
    console.log(`[fetchPublicBalance] Response status:`, response.status, response.statusText);

    if (!response.ok) {
      console.warn(`[fetchPublicBalance] Failed to fetch token ${tokenId} balance:`, response.status);
      return 0;
    }

    const data = await response.text();
    console.log(`[fetchPublicBalance] Token ${tokenId} raw response:`, data);

    const parsed = parseAleoValue(data);
    console.log(`[fetchPublicBalance] Token ${tokenId} parsed value:`, parsed);

    return parsed;
  } catch (error) {
    console.error(`[fetchPublicBalance] Error fetching token ${tokenId}:`, error);
    return 0;
  }
}

// Fetch user's Aleo credits balance
export async function fetchCreditsBalance(address: string): Promise<number> {
  try {
    const url = `${API_URL}/testnet/program/credits.aleo/mapping/account/${address}`;
    console.log('[fetchCreditsBalance] Fetching from:', url);
    console.log('[fetchCreditsBalance] Address:', address);

    const response = await fetch(url);
    console.log('[fetchCreditsBalance] Response status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('[fetchCreditsBalance] Failed to fetch:', response.status, response.statusText);
      return 0;
    }

    const data = await response.text();
    console.log('[fetchCreditsBalance] Raw response:', data);

    const parsed = parseAleoValue(data);
    console.log('[fetchCreditsBalance] Parsed value:', parsed, 'microcredits');

    return parsed;
  } catch (error) {
    console.error('[fetchCreditsBalance] Error:', error);
    return 0;
  }
}

// Fetch pool info from chain
export async function fetchPoolInfo(tokenA: string, tokenB: string): Promise<PoolInfo | null> {
  try {
    const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];

    const response = await fetch(
      `${API_URL}/testnet/program/${PROGRAM_ID}/mapping/pools/${token0}_${token1}`
    );

    if (!response.ok) return null;

    const data = await response.text();
    if (!data || data === "null") return null;

    // Parse the struct data
    const parsed = JSON.parse(data);
    return {
      reserve_a: parsed.reserve_a || "0",
      reserve_b: parsed.reserve_b || "0",
      total_lp: parsed.total_lp || "0",
    };
  } catch {
    return null;
  }
}

// Fetch current batch info
export async function fetchCurrentBatch(tokenA: string, tokenB: string): Promise<BatchInfo> {
  const defaultBatch: BatchInfo = { id: 0, total_a: "0", total_b: "0", participants: 0, executed: false };

  try {
    const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];

    // Fetch batch ID
    const batchResponse = await fetch(
      `${API_URL}/testnet/program/${PROGRAM_ID}/mapping/current_batch/${token0}_${token1}`
    );

    if (!batchResponse.ok) return defaultBatch;

    const batchId = parseAleoValue(await batchResponse.text());
    if (batchId === 0) return defaultBatch;

    // Fetch batch totals
    const totalsResponse = await fetch(
      `${API_URL}/testnet/program/${PROGRAM_ID}/mapping/batch_totals/${token0}_${token1}_${batchId}`
    );

    if (!totalsResponse.ok) {
      return { ...defaultBatch, id: batchId };
    }

    const totalsData = await totalsResponse.text();
    if (!totalsData || totalsData === "null") {
      return { ...defaultBatch, id: batchId };
    }

    const parsed = JSON.parse(totalsData);
    return {
      id: batchId,
      total_a: parsed.total_a || "0",
      total_b: parsed.total_b || "0",
      participants: parseAleoValue(parsed.participants || "0"),
      executed: parsed.executed === "true",
    };
  } catch {
    return defaultBatch;
  }
}

// Fetch total volume
export async function fetchTotalVolume(): Promise<number> {
  try {
    const response = await fetch(
      `${API_URL}/testnet/program/${PROGRAM_ID}/mapping/total_volume/0field`
    );

    if (!response.ok) return 0;

    const data = await response.text();
    return parseAleoValue(data);
  } catch {
    return 0;
  }
}

// Check if program is deployed
export async function checkProgramDeployed(): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_URL}/testnet/program/${PROGRAM_ID}`
    );
    return response.ok;
  } catch {
    return false;
  }
}
