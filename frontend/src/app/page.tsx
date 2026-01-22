"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletMultiButton } from "@demox-labs/aleo-wallet-adapter-reactui";
import {
  Shield, Zap, Lock, ArrowDownUp, Clock, Users, TrendingUp, ChevronDown,
  Loader2, CheckCircle, AlertCircle, Settings, ExternalLink, Droplets,
  BarChart3, Eye, EyeOff, Copy, X, Search, Wallet, Activity, Gift, RefreshCw,
  Coins, Sparkles
} from "lucide-react";
import {
  useContract,
  fetchCurrentBatch,
  fetchCreditsBalance,
  fetchPoolInfo,
  fetchTotalVolume,
  checkProgramDeployed,
  fetchPublicBalance,
  BatchInfo,
  PoolInfo
} from "@/hooks/useContract";
import { TOKENS, BATCH_INTERVAL, PROGRAM_ID } from "@/config/constants";

type TransactionStatus = "idle" | "pending" | "success" | "error";
type TabType = "swap" | "liquidity" | "claims" | "faucet";

interface ClaimRecord {
  id: string;
  plaintext?: string;  // Full plaintext with _nonce for transaction input
  ciphertext?: string;
  data: {
    batch_id: string;
    token_in: string;
    token_out: string;
    amount: string;
  };
}

export default function Home() {
  const { publicKey, connected } = useWallet();
  const {
    submitSwapIntent,
    swapInstant,
    createPool,
    addLiquidity,
    claimBatchOutput,
    getUserRecords,
    claimFaucetTokens,
    loading,
    error
  } = useContract();

  const [activeTab, setActiveTab] = useState<TabType>("swap");
  const [swapMode, setSwapMode] = useState<"batch" | "instant">("batch");
  const [tokenIn, setTokenIn] = useState(TOKENS[0]);
  const [tokenOut, setTokenOut] = useState(TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSlippage, setShowSlippage] = useState(false);
  const [showTokenSelect, setShowTokenSelect] = useState<"in" | "out" | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");
  const [txStatus, setTxStatus] = useState<TransactionStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(BATCH_INTERVAL);
  const [copied, setCopied] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  // Liquidity state
  const [liquidityAmount0, setLiquidityAmount0] = useState("");
  const [liquidityAmount1, setLiquidityAmount1] = useState("");

  // Real data from chain
  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<Record<string, number>>({});
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [currentBatch, setCurrentBatch] = useState<BatchInfo>({
    id: 0,
    total_a: "0",
    total_b: "0",
    participants: 0,
    executed: false
  });
  const [pendingClaims, setPendingClaims] = useState<ClaimRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);

  // Format balance for display
  const formatBalance = (microcredits: number): string => {
    return (microcredits / 1_000_000).toFixed(2);
  };

  // Check if program is deployed
  useEffect(() => {
    checkProgramDeployed().then(setIsDeployed);
  }, []);

  // Fetch user's credits balance and token balances when connected
  useEffect(() => {
    const fetchAllBalances = async () => {
      if (connected && publicKey) {
        console.log('[fetchAllBalances] Wallet connected, publicKey:', publicKey);
        setBalancesLoading(true);
        try {
          // Fetch Aleo credits
          console.log('[fetchAllBalances] Fetching Aleo credits balance...');
          const credits = await fetchCreditsBalance(publicKey);
          console.log('[fetchAllBalances] Credits balance received:', credits, 'microcredits');
          setCreditsBalance(credits);

          // Fetch balance for each token from the DEX contract
          console.log('[fetchAllBalances] Fetching token balances for', TOKENS.length, 'tokens...');
          const balances: Record<string, number> = {};
          await Promise.all(
            TOKENS.map(async (token) => {
              console.log(`[fetchAllBalances] Fetching balance for ${token.symbol} (${token.id})...`);
              const balance = await fetchPublicBalance(publicKey, token.id);
              console.log(`[fetchAllBalances] ${token.symbol} balance:`, balance);
              balances[token.id] = balance;
            })
          );
          console.log('[fetchAllBalances] All token balances:', balances);
          setTokenBalances(balances);
        } finally {
          setBalancesLoading(false);
        }
      } else {
        console.log('[fetchAllBalances] Wallet not connected');
        setCreditsBalance(0);
        setTokenBalances({});
      }
    };

    fetchAllBalances();
  }, [connected, publicKey]);

  // Fetch pool info and batch data
  useEffect(() => {
    const fetchData = async () => {
      const [batch, pool, volume] = await Promise.all([
        fetchCurrentBatch(tokenIn.id, tokenOut.id),
        fetchPoolInfo(tokenIn.id, tokenOut.id),
        fetchTotalVolume()
      ]);
      setCurrentBatch(batch);
      setPoolInfo(pool);
      setTotalVolume(volume);
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [tokenIn.id, tokenOut.id]);

  // Fetch user's records (claims) - gracefully handle permission errors
  useEffect(() => {
    if (connected && publicKey) {
      getUserRecords()
        .then(({ claims }) => {
          setPendingClaims(claims as ClaimRecord[]);
        })
        .catch((err) => {
          console.warn('[useEffect] Could not fetch records on connect:', err);
          // Continue without records - faucet and swaps still work
        });
    } else {
      setPendingClaims([]);
    }
  }, [connected, publicKey, getUserRecords]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : BATCH_INTERVAL));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getProgressPercent = () => ((BATCH_INTERVAL - timeLeft) / BATCH_INTERVAL) * 100;

  // Calculate estimated output based on pool reserves
  const calculateOutput = useCallback(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) return "0";

    if (poolInfo) {
      const reserveIn = parseInt(poolInfo.reserve_a.replace(/u\d+$/, "")) || 0;
      const reserveOut = parseInt(poolInfo.reserve_b.replace(/u\d+$/, "")) || 0;

      if (reserveIn > 0 && reserveOut > 0) {
        const amountInWithFee = parseFloat(amountIn) * 997;
        const numerator = amountInWithFee * reserveOut;
        const denominator = reserveIn * 1000 + amountInWithFee;
        return (numerator / denominator).toFixed(6);
      }
    }

    // No pool exists yet - show placeholder
    return "~";
  }, [amountIn, poolInfo]);

  const estimatedOutput = calculateOutput();
  const priceImpact = amountIn && parseFloat(amountIn) > 100 ? "0.12" : "< 0.01";

  // Get token balance from DEX contract
  const getTokenBalance = useCallback((tokenId: string): number => {
    // All tokens (including ALEO/1field) use balances from the DEX contract
    // Note: This is DIFFERENT from Aleo credits (for tx fees) - these are DEX token balances
    return tokenBalances[tokenId] || 0;
  }, [tokenBalances]);

  // Handle MAX button click
  const handleMaxClick = (type: "swap" | "liquidity0" | "liquidity1") => {
    if (type === "swap") {
      const balance = getTokenBalance(tokenIn.id);
      // Leave some for fees (0.1 ALEO if using credits)
      const maxAmount = tokenIn.id === "1field" ? Math.max(0, balance - 100_000) : balance;
      setAmountIn(formatBalance(maxAmount));
    } else if (type === "liquidity0") {
      const balance = getTokenBalance(tokenIn.id);
      const maxAmount = tokenIn.id === "1field" ? Math.max(0, balance - 100_000) : balance;
      setLiquidityAmount0(formatBalance(maxAmount));
    } else {
      const balance = getTokenBalance(tokenOut.id);
      const maxAmount = tokenOut.id === "1field" ? Math.max(0, balance - 100_000) : balance;
      setLiquidityAmount1(formatBalance(maxAmount));
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [batch, pool, volume] = await Promise.all([
        fetchCurrentBatch(tokenIn.id, tokenOut.id),
        fetchPoolInfo(tokenIn.id, tokenOut.id),
        fetchTotalVolume()
      ]);
      setCurrentBatch(batch);
      setPoolInfo(pool);
      setTotalVolume(volume);

      if (connected && publicKey) {
        // Refresh credits balance
        const credits = await fetchCreditsBalance(publicKey);
        setCreditsBalance(credits);

        // Refresh all token balances
        const balances: Record<string, number> = {};
        await Promise.all(
          TOKENS.map(async (token) => {
            const balance = await fetchPublicBalance(publicKey, token.id);
            balances[token.id] = balance;
          })
        );
        setTokenBalances(balances);

        // Refresh claims (don't break if records permission denied)
        try {
          const { claims } = await getUserRecords();
          setPendingClaims(claims as ClaimRecord[]);
        } catch (recordsErr) {
          console.warn('[refreshData] Could not fetch records:', recordsErr);
          // Continue without records - faucet and balances still work
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSwap = useCallback(async () => {
    if (!connected) return;
    if (!amountIn || parseFloat(amountIn) <= 0) return;

    setTxStatus("pending");
    setTxHash(null);

    try {
      const minOutput = estimatedOutput !== "~"
        ? parseFloat(estimatedOutput) * (1 - parseFloat(slippage) / 100)
        : 0;

      const params = {
        tokenInId: tokenIn.id,
        tokenOutId: tokenOut.id,
        amountIn: amountIn,
        minAmountOut: minOutput.toString(),
      };

      const hash = swapMode === "batch"
        ? await submitSwapIntent(params)
        : await swapInstant(params);

      setTxHash(hash);
      setTxStatus("success");
      setAmountIn("");
      refreshData();
    } catch (err) {
      console.error("Swap failed:", err);
      setTxStatus("error");
    }
  }, [connected, amountIn, tokenIn, tokenOut, swapMode, slippage, estimatedOutput, submitSwapIntent, swapInstant]);

  const handleAddLiquidity = useCallback(async () => {
    if (!connected) return;
    if (!liquidityAmount0 || !liquidityAmount1) return;

    setTxStatus("pending");
    setTxHash(null);

    try {
      let hash: string;

      // Check if pool exists - if not, use createPool instead of addLiquidity
      if (!poolInfo) {
        console.log('[handleAddLiquidity] No pool exists, calling createPool');
        hash = await createPool(
          tokenIn.id,
          tokenOut.id,
          liquidityAmount0,
          liquidityAmount1,
          "0" // min LP tokens
        );
      } else {
        console.log('[handleAddLiquidity] Pool exists, calling addLiquidity');
        hash = await addLiquidity(
          tokenIn.id,
          tokenOut.id,
          liquidityAmount0,
          liquidityAmount1,
          "0" // min LP tokens
        );
      }

      setTxHash(hash);
      setTxStatus("success");
      setLiquidityAmount0("");
      setLiquidityAmount1("");
      refreshData();
    } catch (err) {
      console.error("Add liquidity failed:", err);
      setTxStatus("error");
    }
  }, [connected, liquidityAmount0, liquidityAmount1, tokenIn, tokenOut, poolInfo, createPool, addLiquidity]);

  const handleClaim = useCallback(async (claimRecord: ClaimRecord) => {
    if (!connected) return;

    setTxStatus("pending");
    setTxHash(null);

    try {
      const hash = await claimBatchOutput(claimRecord);
      setTxHash(hash);
      setTxStatus("success");
      refreshData();
    } catch (err) {
      console.error("Claim failed:", err);
      setTxStatus("error");
    }
  }, [connected, claimBatchOutput]);

  const switchTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredTokens = TOKENS.filter(t =>
    t.name.toLowerCase().includes(tokenSearch.toLowerCase()) ||
    t.symbol.toLowerCase().includes(tokenSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-purple-900/30 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Shielded Batch DEX
              </h1>
              <p className="text-xs text-gray-500">Privacy-First Trading on Aleo</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Deployment Status */}
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full ${
              isDeployed === null ? "bg-yellow-500/10 border border-yellow-500/20" :
              isDeployed ? "bg-green-500/10 border border-green-500/20" :
              "bg-red-500/10 border border-red-500/20"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isDeployed === null ? "bg-yellow-500" :
                isDeployed ? "bg-green-500 animate-pulse" :
                "bg-red-500"
              }`} />
              <span className={`text-xs font-medium ${
                isDeployed === null ? "text-yellow-400" :
                isDeployed ? "text-green-400" :
                "text-red-400"
              }`}>
                {isDeployed === null ? "Checking..." : isDeployed ? "Testnet Live" : "Not Deployed"}
              </span>
            </div>

            {/* Credits Balance */}
            {connected && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <Wallet className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs text-gray-300 font-mono">
                  {formatBalance(creditsBalance)} credits
                </span>
              </div>
            )}

            {/* Address */}
            {connected && publicKey && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border border-gray-700 rounded-lg">
                <button onClick={() => setShowAddress(!showAddress)} className="text-gray-400 hover:text-white">
                  {showAddress ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <span className="text-xs text-gray-300 font-mono">
                  {showAddress ? publicKey : `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`}
                </span>
                <button onClick={copyAddress} className="text-gray-400 hover:text-white">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Stats Bar - Real Data */}
      <div className="border-b border-purple-900/20 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-sm">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              <span className="text-gray-500">Pool:</span>
              <span className="font-semibold text-white">
                {poolInfo ? `${formatBalance(parseInt(poolInfo.reserve_a.replace(/u\d+$/, "")))} ${tokenIn.symbol}` : "On-chain"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-pink-400" />
              <span className="text-gray-500">Volume:</span>
              <span className="font-semibold text-white">{formatBalance(totalVolume)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-gray-500">Batch #{currentBatch.id || "N/A"}</span>
            </div>
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-purple-400 hover:text-purple-300"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="text-xs">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              Private Swaps.
            </span>{" "}
            <span className="text-white">Fair Execution.</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Real trades on Aleo Testnet. Your amounts stay private.
            <span className="text-purple-400 font-medium"> No front-running. No MEV.</span>
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Contract: <a href={`https://testnet.explorer.provable.com/program/${PROGRAM_ID}`} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">{PROGRAM_ID}</a>
          </p>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full">
            <Lock className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Hidden Amounts</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 border border-pink-500/20 rounded-full">
            <Shield className="w-4 h-4 text-pink-400" />
            <span className="text-sm text-pink-300">MEV Protected</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-300">Fair Pricing</span>
          </div>
        </div>

        {/* Main Interface */}
        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Main Card */}
          <div className="w-full max-w-md">
            {/* Tab Navigation */}
            <div className="flex gap-1 mb-4 p-1 bg-gray-900/50 rounded-xl border border-gray-800">
              {[
                { id: "swap", icon: ArrowDownUp, label: "Swap" },
                { id: "liquidity", icon: Droplets, label: "Pool" },
                { id: "faucet", icon: Coins, label: "Faucet" },
                { id: "claims", icon: Gift, label: "Claims" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === "claims" && pendingClaims.length > 0 && (
                    <span className="w-5 h-5 flex items-center justify-center bg-pink-500 text-white text-xs rounded-full">
                      {pendingClaims.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Card Content */}
            <div className="bg-gradient-to-br from-gray-900/90 to-gray-900/50 border border-purple-500/20 rounded-3xl p-6 backdrop-blur-xl shadow-2xl">
              {activeTab === "swap" && (
                <>
                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-5 p-1 bg-gray-800/50 rounded-xl">
                    <button
                      onClick={() => setSwapMode("batch")}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        swapMode === "batch"
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      Batch (Private)
                    </button>
                    <button
                      onClick={() => setSwapMode("instant")}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        swapMode === "instant"
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      Instant
                    </button>
                  </div>

                  {/* From Token */}
                  <div className="bg-gray-800/40 rounded-2xl p-4 mb-2 border border-gray-700/50 hover:border-purple-500/30 transition-colors">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>You Pay</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          {balancesLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : connected ? (
                            formatBalance(getTokenBalance(tokenIn.id))
                          ) : (
                            "0.00"
                          )}
                        </span>
                        {connected && getTokenBalance(tokenIn.id) > 0 && (
                          <button
                            onClick={() => handleMaxClick("swap")}
                            className="px-2 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                          >
                            MAX
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={amountIn}
                        onChange={(e) => setAmountIn(e.target.value)}
                        className="flex-1 bg-transparent text-2xl font-semibold outline-none placeholder-gray-600 min-w-0"
                      />
                      <button
                        onClick={() => setShowTokenSelect("in")}
                        className="flex items-center gap-2 bg-gray-700/70 hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-all hover:scale-105"
                      >
                        <span className="text-xl">{tokenIn.icon}</span>
                        <span className="font-semibold">{tokenIn.symbol}</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {/* Switch Button */}
                  <div className="flex justify-center -my-3 relative z-10">
                    <button
                      onClick={switchTokens}
                      className="w-10 h-10 bg-gray-800 border-4 border-gray-900 rounded-xl flex items-center justify-center hover:bg-purple-600 hover:border-purple-500 transition-all hover:rotate-180 duration-300"
                    >
                      <ArrowDownUp className="w-4 h-4 text-purple-400" />
                    </button>
                  </div>

                  {/* To Token */}
                  <div className="bg-gray-800/40 rounded-2xl p-4 mt-2 border border-gray-700/50 hover:border-purple-500/30 transition-colors">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>You Receive</span>
                      <span className="text-xs">{poolInfo ? "From pool" : "No pool yet"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="0.0"
                        readOnly
                        value={estimatedOutput !== "0" && estimatedOutput !== "~" ? estimatedOutput : ""}
                        className="flex-1 bg-transparent text-2xl font-semibold outline-none placeholder-gray-600 min-w-0"
                      />
                      <button
                        onClick={() => setShowTokenSelect("out")}
                        className="flex items-center gap-2 bg-gray-700/70 hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-all hover:scale-105"
                      >
                        <span className="text-xl">{tokenOut.icon}</span>
                        <span className="font-semibold">{tokenOut.symbol}</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {/* Swap Details */}
                  {amountIn && poolInfo && (
                    <div className="mt-4 p-3 bg-gray-800/30 rounded-xl space-y-2 text-sm">
                      <div className="flex justify-between text-gray-400">
                        <span>Price Impact</span>
                        <span className="text-green-400">{priceImpact}%</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Slippage</span>
                        <button
                          onClick={() => setShowSlippage(!showSlippage)}
                          className="flex items-center gap-1 text-purple-400 hover:text-purple-300"
                        >
                          {slippage}% <Settings className="w-3 h-3" />
                        </button>
                      </div>
                      {showSlippage && (
                        <div className="flex gap-2 pt-2">
                          {["0.1", "0.5", "1.0"].map((s) => (
                            <button
                              key={s}
                              onClick={() => { setSlippage(s); setShowSlippage(false); }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                slippage === s ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                              }`}
                            >
                              {s}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pool Status Info */}
                  {!poolInfo && amountIn && (
                    <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-blue-400 text-sm">
                        <Shield className="w-4 h-4" />
                        <span>Pool status uses BHP256 keys (private). Swap will work if pool exists on-chain.</span>
                      </div>
                    </div>
                  )}

                  {/* Batch Mode Info */}
                  {swapMode === "batch" && (
                    <div className="mt-4 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-purple-400 mb-1">
                        <Shield className="w-4 h-4" />
                        <span className="font-medium text-sm">Privacy Mode Active</span>
                      </div>
                      <p className="text-gray-400 text-xs">
                        Your amount stays hidden. Claim output after batch executes.
                      </p>
                    </div>
                  )}

                  {/* Swap Button */}
                  <button
                    onClick={handleSwap}
                    disabled={!connected || !amountIn || loading}
                    className={`w-full mt-5 py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2 ${
                      connected && amountIn && !loading
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:scale-[1.02]"
                        : "bg-gray-800 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                    ) : !connected ? (
                      <><Wallet className="w-5 h-5" /> Connect Wallet</>
                    ) : !amountIn ? (
                      "Enter Amount"
                    ) : swapMode === "batch" ? (
                      <><Shield className="w-5 h-5" /> Submit to Batch</>
                    ) : (
                      <><Zap className="w-5 h-5" /> Swap Now</>
                    )}
                  </button>

                  {/* Transaction Status */}
                  {txStatus !== "idle" && (
                    <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                      txStatus === "pending" ? "bg-yellow-900/30 border border-yellow-500/30 text-yellow-400" :
                      txStatus === "success" ? "bg-green-900/30 border border-green-500/30 text-green-400" :
                      "bg-red-900/30 border border-red-500/30 text-red-400"
                    }`}>
                      {txStatus === "pending" && <Loader2 className="w-4 h-4 animate-spin" />}
                      {txStatus === "success" && <CheckCircle className="w-4 h-4" />}
                      {txStatus === "error" && <AlertCircle className="w-4 h-4" />}
                      <span className="flex-1">
                        {txStatus === "pending" && "Confirm in wallet..."}
                        {txStatus === "success" && "Transaction submitted!"}
                        {txStatus === "error" && (error || "Transaction failed")}
                      </span>
                      {txStatus === "success" && txHash && (
                        <a href={`https://testnet.explorer.provable.com/transaction/${txHash}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button onClick={() => setTxStatus("idle")} className="hover:opacity-70">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeTab === "liquidity" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-blue-400" />
                    Add Liquidity
                  </h3>
                  <p className="text-sm text-gray-400">
                    {poolInfo
                      ? `Pool exists: ${formatBalance(parseInt(poolInfo.reserve_a.replace(/u\d+$/, "")))} ${tokenIn.symbol} / ${formatBalance(parseInt(poolInfo.reserve_b.replace(/u\d+$/, "")))} ${tokenOut.symbol}`
                      : "Create a new pool by adding liquidity"
                    }
                  </p>

                  <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>{tokenIn.symbol}</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          {balancesLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            formatBalance(getTokenBalance(tokenIn.id))
                          )}
                        </span>
                        {connected && getTokenBalance(tokenIn.id) > 0 && (
                          <button
                            onClick={() => handleMaxClick("liquidity0")}
                            className="px-2 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                          >
                            MAX
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={liquidityAmount0}
                        onChange={(e) => setLiquidityAmount0(e.target.value)}
                        className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder-gray-600"
                      />
                      <div className="flex items-center gap-2 bg-gray-700/70 rounded-xl px-3 py-2">
                        <span className="text-lg">{tokenIn.icon}</span>
                        <span className="font-medium">{tokenIn.symbol}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400">+</span>
                    </div>
                  </div>

                  <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                      <span>{tokenOut.symbol}</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          {balancesLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            formatBalance(getTokenBalance(tokenOut.id))
                          )}
                        </span>
                        {connected && getTokenBalance(tokenOut.id) > 0 && (
                          <button
                            onClick={() => handleMaxClick("liquidity1")}
                            className="px-2 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                          >
                            MAX
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={liquidityAmount1}
                        onChange={(e) => setLiquidityAmount1(e.target.value)}
                        className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder-gray-600"
                      />
                      <div className="flex items-center gap-2 bg-gray-700/70 rounded-xl px-3 py-2">
                        <span className="text-lg">{tokenOut.icon}</span>
                        <span className="font-medium">{tokenOut.symbol}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleAddLiquidity}
                    disabled={!connected || !liquidityAmount0 || !liquidityAmount1 || loading}
                    className={`w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      connected && liquidityAmount0 && liquidityAmount1 && !loading
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg"
                        : "bg-gray-800 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                    ) : !connected ? (
                      "Connect Wallet"
                    ) : (
                      <><Droplets className="w-5 h-5" /> {poolInfo ? "Add Liquidity" : "Create Pool"}</>
                    )}
                  </button>
                </div>
              )}

              {activeTab === "claims" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Gift className="w-5 h-5 text-pink-400" />
                    Pending Claims
                  </h3>

                  {!connected ? (
                    <div className="text-center py-8 text-gray-500">
                      <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Connect wallet to see claims</p>
                    </div>
                  ) : pendingClaims.length > 0 ? (
                    <div className="space-y-3">
                      {pendingClaims.map((claim, idx) => (
                        <div key={idx} className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-400">Batch #{claim.data?.batch_id?.replace(/u\d+$/, "") || "?"}</span>
                            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">Ready</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-lg font-semibold">Batch Output</div>
                            </div>
                            <button
                              onClick={() => handleClaim(claim)}
                              disabled={loading}
                              className="px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            >
                              {loading ? "..." : "Claim"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No pending claims</p>
                      <p className="text-sm">Submit a batch swap to get started</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "faucet" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Coins className="w-5 h-5 text-yellow-400" />
                    Test Token Faucet
                  </h3>
                  <p className="text-sm text-gray-400">
                    Claim free test tokens to try out the DEX on Aleo Testnet.
                  </p>

                  {!connected ? (
                    <div className="text-center py-8 text-gray-500">
                      <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Connect wallet to claim tokens</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {TOKENS.map((token) => (
                        <div key={token.id} className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50 hover:border-yellow-500/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{token.icon}</span>
                              <div>
                                <div className="font-semibold">{token.symbol}</div>
                                <div className="text-sm text-gray-400">{token.name}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-400 mb-1">
                                Balance: {formatBalance(getTokenBalance(token.id))}
                              </div>
                              <button
                                onClick={async () => {
                                  setTxStatus("pending");
                                  setTxHash(null);
                                  try {
                                    // Claim 1000 tokens from faucet
                                    const hash = await claimFaucetTokens(token.id, "1000");
                                    setTxHash(hash);
                                    setTxStatus("success");
                                    // Refresh balances after claiming
                                    setTimeout(() => refreshData(), 5000);
                                  } catch (err) {
                                    console.error("Faucet claim failed:", err);
                                    setTxStatus("error");
                                  }
                                }}
                                disabled={loading}
                                className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
                              >
                                {loading ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</>
                                ) : (
                                  <><Sparkles className="w-4 h-4" /> Claim 1000</>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="mt-4 bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-500/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-yellow-400 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-yellow-400 mb-1">Testnet Tokens</h4>
                            <p className="text-sm text-gray-400">
                              These are test tokens for Aleo Testnet only. They have no real value.
                              Use them to test swaps and liquidity features.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <ArrowDownUp className="w-5 h-5 text-blue-400 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-blue-400 mb-1">DEX Balances</h4>
                            <p className="text-sm text-gray-400">
                              Tokens are deposited directly to the DEX contract for trading.
                              Balances may take 1-2 minutes to appear after claiming (Aleo block time).
                              You can proceed to Pool or Swap after claiming - the contract verifies balances.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Transaction Status */}
                  {txStatus !== "idle" && (
                    <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
                      txStatus === "pending" ? "bg-yellow-900/30 border border-yellow-500/30 text-yellow-400" :
                      txStatus === "success" ? "bg-green-900/30 border border-green-500/30 text-green-400" :
                      "bg-red-900/30 border border-red-500/30 text-red-400"
                    }`}>
                      {txStatus === "pending" && <Loader2 className="w-4 h-4 animate-spin" />}
                      {txStatus === "success" && <CheckCircle className="w-4 h-4" />}
                      {txStatus === "error" && <AlertCircle className="w-4 h-4" />}
                      <span className="flex-1">
                        {txStatus === "pending" && "Confirm in wallet..."}
                        {txStatus === "success" && "Tokens claimed! Balance will update shortly."}
                        {txStatus === "error" && (error || "Failed to claim tokens")}
                      </span>
                      {txStatus === "success" && txHash && (
                        <a href={`https://testnet.explorer.provable.com/transaction/${txHash}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button onClick={() => setTxStatus("idle")} className="hover:opacity-70">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Batch Info Panel */}
          {swapMode === "batch" && activeTab === "swap" && (
            <div className="w-full max-w-sm space-y-4">
              <div className="bg-gradient-to-br from-gray-900/90 to-gray-900/50 border border-purple-500/20 rounded-3xl p-6 backdrop-blur-xl">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-400" />
                  Batch #{currentBatch.id || "N/A"}
                </h3>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Time Remaining</span>
                    <span className="text-2xl font-mono font-bold text-purple-400">
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                      style={{ width: `${getProgressPercent()}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-800">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total {tokenIn.symbol}</span>
                    <span className="font-medium">{formatBalance(parseInt(currentBatch.total_a.replace(/u\d+$/, "") || "0"))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total {tokenOut.symbol}</span>
                    <span className="font-medium">{formatBalance(parseInt(currentBatch.total_b.replace(/u\d+$/, "") || "0"))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1">
                      <Users className="w-4 h-4" /> Participants
                    </span>
                    <span className="font-medium">{currentBatch.participants}</span>
                  </div>
                </div>

                <div className="mt-4 bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/20 rounded-xl p-3 text-xs text-gray-400">
                  <TrendingUp className="w-4 h-4 inline mr-2 text-green-400" />
                  Your amount stays hidden. Uniform price for all.
                </div>
              </div>

              {/* How It Works */}
              <div className="bg-gradient-to-br from-gray-900/60 to-gray-900/30 border border-gray-800 rounded-2xl p-5">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  How It Works
                </h4>
                <ol className="space-y-3">
                  {[
                    { step: 1, text: "Submit swap intent (amount hidden)" },
                    { step: 2, text: "Wait for batch execution (~2 min)" },
                    { step: 3, text: "All swaps at uniform price" },
                    { step: 4, text: "Claim your pro-rata share" },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 flex items-center justify-center bg-purple-500/20 text-purple-400 rounded-full text-xs font-bold flex-shrink-0">
                        {item.step}
                      </span>
                      <span className="text-gray-400">{item.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Token Select Modal */}
        {showTokenSelect && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowTokenSelect(null)}>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Select Token</h3>
                <button onClick={() => setShowTokenSelect(null)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredTokens.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => {
                      if (showTokenSelect === "in") setTokenIn(token);
                      else setTokenOut(token);
                      setShowTokenSelect(null);
                      setTokenSearch("");
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      (showTokenSelect === "in" && token.id === tokenIn.id) ||
                      (showTokenSelect === "out" && token.id === tokenOut.id)
                        ? "bg-purple-500/20 border border-purple-500/30"
                        : "hover:bg-gray-800"
                    }`}
                  >
                    <span className="text-2xl">{token.icon}</span>
                    <div className="text-left flex-1">
                      <div className="font-semibold">{token.symbol}</div>
                      <div className="text-sm text-gray-400">{token.name}</div>
                    </div>
                    {connected && (
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatBalance(getTokenBalance(token.id))}
                        </div>
                        <div className="text-xs text-gray-500">Balance</div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-900 mt-20 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Shielded Batch DEX
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href={`https://testnet.explorer.provable.com/program/${PROGRAM_ID}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-400 flex items-center gap-1">
                Contract <ExternalLink className="w-3 h-3" />
              </a>
              <a href="https://penumbra.zone" target="_blank" rel="noopener noreferrer" className="hover:text-purple-400">
                Inspired by Penumbra
              </a>
            </div>

            <p className="text-sm text-gray-500">
              Built for <span className="text-purple-400 font-medium">Aleo Privacy Buildathon</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
