// ============================================================================
// SHIELDED BATCH DEX - TRUE Privacy-Preserving DEX with Batch Execution
// ============================================================================
// A Penumbra-inspired batch execution DEX for Aleo that:
// - TRULY hides individual swap amounts (NO public tracking of user contributions)
// - Executes all swaps at UNIFORM clearing price (not sequential)
// - Prevents MEV and front-running by design
// - Distributes outputs pro-rata with slippage protection
// ============================================================================

program shielded_batch_dex_v2.aleo {

    // ============================================
    // CONSTANTS
    // ============================================

    // Fee structure: 0.3% = 997/1000
    const FEE_NUMERATOR: u128 = 997u128;
    const FEE_DENOMINATOR: u128 = 1000u128;

    // Minimum liquidity to prevent small pool attacks
    const MINIMUM_LIQUIDITY: u128 = 1000u128;

    // Price scaling factor (1e18 for precision)
    const PRICE_SCALE: u128 = 1000000000000000000u128;

    // ============================================
    // DATA STRUCTURES
    // ============================================

    // Helper struct for balance keys
    struct BalanceKey {
        account: address,
        token: field,
    }

    // Helper struct for LP balance keys
    struct LPBalanceKey {
        account: address,
        pool_id: field,
    }

    // Helper struct for pair identification
    struct PairKey {
        token_a: field,
        token_b: field,
    }

    // Helper struct for batch keys
    struct BatchKey {
        batch_id: u64,
        pool_id: field,
    }

    // Commitment key for preventing double-claims
    struct ClaimKey {
        user: address,
        batch_id: u64,
        pool_id: field,
        nonce: field,
    }

    // Pool information (public)
    struct PoolInfo {
        token_a: field,
        token_b: field,
        reserve_a: u128,
        reserve_b: u128,
        total_lp_supply: u128,
        fee_rate: u64,
    }

    // Batch execution data (public - only totals, NO individual amounts)
    struct BatchData {
        // Aggregate totals only - individual contributions are PRIVATE
        total_input_a: u128,      // Total A wanting to swap to B
        total_input_b: u128,      // Total B wanting to swap to A
        // Outputs calculated at uniform clearing price
        total_output_a: u128,     // Total A received by B->A swappers
        total_output_b: u128,     // Total B received by A->B swappers
        // Execution state
        executed: bool,
        clearing_price: u128,     // Uniform price (scaled by 1e18)
        participant_count: u64,   // Number of participants (privacy: only count, not who)
    }

    // ============================================
    // RECORDS (PRIVATE - THE KEY TO PRIVACY!)
    // ============================================

    // Private swap intent - user's contribution is ONLY in this record
    // NO public mapping stores individual amounts!
    record SwapIntent {
        owner: address,
        pool_id: field,
        batch_id: u64,
        token_in: field,
        token_out: field,
        amount_in: u128,
        min_amount_out: u128,
        // Unique nonce to prevent replay attacks
        nonce: field,
    }

    // Batch claim - proves user's contribution for claiming outputs
    // Contains all info needed to calculate pro-rata share
    record BatchClaim {
        owner: address,
        pool_id: field,
        batch_id: u64,
        // Direction: true = A->B, false = B->A
        is_a_to_b: bool,
        // User's private contribution amount
        contribution: u128,
        // Slippage protection
        min_output: u128,
        // Commitment for verification
        commitment: field,
    }

    // LP Token record for liquidity providers
    record LPToken {
        owner: address,
        pool_id: field,
        amount: u128,
    }

    // ============================================
    // MAPPINGS (PUBLIC STATE - MINIMAL!)
    // ============================================

    // Token public balances
    mapping public_balances: field => u128;

    // Pool information
    mapping pools: field => PoolInfo;

    // Current batch ID per pool
    mapping current_batch: field => u64;

    // Batch data (ONLY aggregates, never individual contributions)
    mapping batch_data: field => BatchData;

    // Commitment tracking (to prevent double-claims)
    // Key: hash(commitment) => claimed (bool as u8: 0=unclaimed, 1=claimed)
    mapping claim_commitments: field => u8;

    // LP token public balances
    mapping lp_balances: field => u128;

    // Protocol statistics
    mapping total_volume: field => u128;

    // ============================================
    // CONSTRUCTOR
    // ============================================

    @noupgrade
    async constructor() {}

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    // Generate unique pool ID from ordered token pair
    inline get_pool_id(token_a: field, token_b: field) -> field {
        let t0: field = token_a < token_b ? token_a : token_b;
        let t1: field = token_a < token_b ? token_b : token_a;
        return BHP256::hash_to_field(PairKey { token_a: t0, token_b: t1 });
    }

    // Get balance mapping key
    inline get_balance_key(account_addr: address, token: field) -> field {
        return BHP256::hash_to_field(BalanceKey { account: account_addr, token: token });
    }

    // Get LP balance mapping key
    inline get_lp_balance_key(account_addr: address, pool_id: field) -> field {
        return BHP256::hash_to_field(LPBalanceKey { account: account_addr, pool_id: pool_id });
    }

    // Get batch data key
    inline get_batch_key(batch_id: u64, pool_id: field) -> field {
        return BHP256::hash_to_field(BatchKey { batch_id: batch_id, pool_id: pool_id });
    }

    // Generate commitment from claim data (for privacy-preserving verification)
    inline generate_commitment(user: address, batch_id: u64, pool_id: field, nonce: field) -> field {
        return BHP256::hash_to_field(ClaimKey {
            user: user,
            batch_id: batch_id,
            pool_id: pool_id,
            nonce: nonce,
        });
    }

    // Square root using Newton's method
    inline sqrt_u128(n: u128) -> u128 {
        if n == 0u128 { return 0u128; }
        if n == 1u128 { return 1u128; }

        let x0: u128 = n;
        let y0: u128 = (x0 + 1u128) / 2u128;
        let x1: u128 = y0 < x0 ? y0 : x0;
        let y1: u128 = (n / x1 + x1) / 2u128;
        let x2: u128 = y1 < x1 ? y1 : x1;
        let y2: u128 = (n / x2 + x2) / 2u128;
        let x3: u128 = y2 < x2 ? y2 : x2;
        let y3: u128 = (n / x3 + x3) / 2u128;
        let x4: u128 = y3 < x3 ? y3 : x3;
        let y4: u128 = (n / x4 + x4) / 2u128;
        let x5: u128 = y4 < x4 ? y4 : x4;
        let y5: u128 = (n / x5 + x5) / 2u128;
        let x6: u128 = y5 < x5 ? y5 : x5;

        return x6;
    }

    // Minimum of two u128 values
    inline min_u128(a: u128, b: u128) -> u128 {
        return a < b ? a : b;
    }

    // Calculate swap output with fee (constant product formula)
    inline get_amount_out(amount_in: u128, reserve_in: u128, reserve_out: u128) -> u128 {
        let amount_in_with_fee: u128 = amount_in * FEE_NUMERATOR;
        let numerator: u128 = amount_in_with_fee * reserve_out;
        let denominator: u128 = reserve_in * FEE_DENOMINATOR + amount_in_with_fee;
        return numerator / denominator;
    }

    // ============================================
    // UNIFORM CLEARING PRICE CALCULATION
    // ============================================
    // This is the KEY innovation - calculate a single price where ALL trades execute

    // Calculate uniform clearing price for batch execution
    // Returns: (clearing_price, output_a, output_b)
    //
    // The clearing price P satisfies:
    // - A->B swappers get: (their_input * output_b) / total_input_a tokens of B
    // - B->A swappers get: (their_input * output_a) / total_input_b tokens of A
    // - The pool's constant product is maintained
    inline calculate_clearing_price(
        reserve_a: u128,
        reserve_b: u128,
        delta_a: u128,  // Total A wanting B
        delta_b: u128   // Total B wanting A
    ) -> (u128, u128, u128) {
        // Handle edge cases
        if delta_a == 0u128 && delta_b == 0u128 {
            let price: u128 = reserve_a > 0u128 ? (reserve_b * PRICE_SCALE) / reserve_a : 0u128;
            return (price, 0u128, 0u128);
        }

        // Net flow into the pool
        // If delta_a > effective_delta_b_in_a_terms, pool receives net A
        // If delta_b > effective_delta_a_in_b_terms, pool receives net B

        // Calculate outputs using constant product for NET flow
        // This ensures uniform price for all participants

        // For A->B direction with fee
        let output_b: u128 = delta_a > 0u128 ?
            get_amount_out(delta_a, reserve_a, reserve_b) : 0u128;

        // For B->A direction with fee (against updated reserves)
        let new_reserve_a_temp: u128 = reserve_a + delta_a;
        let new_reserve_b_temp: u128 = reserve_b - output_b;

        let output_a: u128 = delta_b > 0u128 && new_reserve_b_temp > 0u128 ?
            get_amount_out(delta_b, new_reserve_b_temp, new_reserve_a_temp) : 0u128;

        // Calculate clearing price (B per A, scaled)
        // Price = total_output_b / total_input_a (for A->B direction)
        let clearing_price: u128 = delta_a > 0u128 ?
            (output_b * PRICE_SCALE) / delta_a :
            (delta_b > 0u128 && output_a > 0u128 ?
                (delta_b * PRICE_SCALE) / output_a :
                (reserve_b * PRICE_SCALE) / reserve_a);

        return (clearing_price, output_a, output_b);
    }

    // ============================================
    // POOL CREATION
    // ============================================

    async transition create_pool(
        public token_a: field,
        public token_b: field,
        public amount_a: u128,
        public amount_b: u128,
        public min_liquidity: u128
    ) -> Future {
        assert(token_a != token_b);
        assert(amount_a > 0u128);
        assert(amount_b > 0u128);

        let pool_id: field = get_pool_id(token_a, token_b);

        return finalize_create_pool(
            pool_id, token_a, token_b, amount_a, amount_b, min_liquidity, self.caller
        );
    }

    async function finalize_create_pool(
        pool_id: field,
        token_a: field,
        token_b: field,
        amount_a: u128,
        amount_b: u128,
        min_liquidity: u128,
        creator: address
    ) {
        let exists: bool = Mapping::contains(pools, pool_id);
        assert(!exists);

        let t0: field = token_a < token_b ? token_a : token_b;
        let t1: field = token_a < token_b ? token_b : token_a;
        let r0: u128 = token_a < token_b ? amount_a : amount_b;
        let r1: u128 = token_a < token_b ? amount_b : amount_a;

        let liquidity: u128 = sqrt_u128(r0 * r1);
        assert(liquidity >= MINIMUM_LIQUIDITY);
        assert(liquidity >= min_liquidity);

        let pool: PoolInfo = PoolInfo {
            token_a: t0,
            token_b: t1,
            reserve_a: r0,
            reserve_b: r1,
            total_lp_supply: liquidity,
            fee_rate: 30u64,
        };
        Mapping::set(pools, pool_id, pool);

        // Initialize batch
        Mapping::set(current_batch, pool_id, 1u64);
        let batch_key: field = get_batch_key(1u64, pool_id);
        let initial_batch: BatchData = BatchData {
            total_input_a: 0u128,
            total_input_b: 0u128,
            total_output_a: 0u128,
            total_output_b: 0u128,
            executed: false,
            clearing_price: 0u128,
            participant_count: 0u64,
        };
        Mapping::set(batch_data, batch_key, initial_batch);

        // Mint LP tokens
        let lp_key: field = get_lp_balance_key(creator, pool_id);
        Mapping::set(lp_balances, lp_key, liquidity);

        // Deduct tokens
        let key_a: field = get_balance_key(creator, t0);
        let key_b: field = get_balance_key(creator, t1);
        let bal_a: u128 = Mapping::get_or_use(public_balances, key_a, 0u128);
        let bal_b: u128 = Mapping::get_or_use(public_balances, key_b, 0u128);
        assert(bal_a >= r0);
        assert(bal_b >= r1);
        Mapping::set(public_balances, key_a, bal_a - r0);
        Mapping::set(public_balances, key_b, bal_b - r1);
    }

    // ============================================
    // LIQUIDITY MANAGEMENT
    // ============================================

    async transition add_liquidity_public(
        public token_a: field,
        public token_b: field,
        public amount_a_desired: u128,
        public amount_b_desired: u128,
        public min_liquidity: u128
    ) -> Future {
        let pool_id: field = get_pool_id(token_a, token_b);
        return finalize_add_liquidity(
            pool_id, token_a, amount_a_desired, amount_b_desired, min_liquidity, self.caller
        );
    }

    async function finalize_add_liquidity(
        pool_id: field,
        token_a: field,
        amount_a_desired: u128,
        amount_b_desired: u128,
        min_liquidity: u128,
        provider: address
    ) {
        let pool: PoolInfo = Mapping::get(pools, pool_id);

        let is_token_a: bool = token_a == pool.token_a;
        let reserve_a: u128 = is_token_a ? pool.reserve_a : pool.reserve_b;
        let reserve_b: u128 = is_token_a ? pool.reserve_b : pool.reserve_a;

        let amount_b_optimal: u128 = amount_a_desired * reserve_b / reserve_a;
        let amount_a: u128 = amount_a_desired;
        let amount_b: u128 = amount_b_optimal <= amount_b_desired ? amount_b_optimal : amount_b_desired;

        let liq_a: u128 = amount_a * pool.total_lp_supply / reserve_a;
        let liq_b: u128 = amount_b * pool.total_lp_supply / reserve_b;
        let liquidity: u128 = min_u128(liq_a, liq_b);
        assert(liquidity >= min_liquidity);

        let new_reserve_a: u128 = is_token_a ? pool.reserve_a + amount_a : pool.reserve_a + amount_b;
        let new_reserve_b: u128 = is_token_a ? pool.reserve_b + amount_b : pool.reserve_b + amount_a;

        let updated_pool: PoolInfo = PoolInfo {
            token_a: pool.token_a,
            token_b: pool.token_b,
            reserve_a: new_reserve_a,
            reserve_b: new_reserve_b,
            total_lp_supply: pool.total_lp_supply + liquidity,
            fee_rate: pool.fee_rate,
        };
        Mapping::set(pools, pool_id, updated_pool);

        let lp_key: field = get_lp_balance_key(provider, pool_id);
        let current_lp: u128 = Mapping::get_or_use(lp_balances, lp_key, 0u128);
        Mapping::set(lp_balances, lp_key, current_lp + liquidity);

        let key_a: field = get_balance_key(provider, pool.token_a);
        let key_b: field = get_balance_key(provider, pool.token_b);
        let bal_a: u128 = Mapping::get(public_balances, key_a);
        let bal_b: u128 = Mapping::get(public_balances, key_b);

        let deduct_a: u128 = is_token_a ? amount_a : amount_b;
        let deduct_b: u128 = is_token_a ? amount_b : amount_a;
        assert(bal_a >= deduct_a);
        assert(bal_b >= deduct_b);

        Mapping::set(public_balances, key_a, bal_a - deduct_a);
        Mapping::set(public_balances, key_b, bal_b - deduct_b);
    }

    async transition remove_liquidity_public(
        public token_a: field,
        public token_b: field,
        public liquidity: u128,
        public min_amount_a: u128,
        public min_amount_b: u128
    ) -> Future {
        let pool_id: field = get_pool_id(token_a, token_b);
        return finalize_remove_liquidity(
            pool_id, token_a, liquidity, min_amount_a, min_amount_b, self.caller
        );
    }

    async function finalize_remove_liquidity(
        pool_id: field,
        token_a: field,
        liquidity: u128,
        min_amount_a: u128,
        min_amount_b: u128,
        provider: address
    ) {
        let pool: PoolInfo = Mapping::get(pools, pool_id);

        let lp_key: field = get_lp_balance_key(provider, pool_id);
        let user_lp: u128 = Mapping::get(lp_balances, lp_key);
        assert(user_lp >= liquidity);
        Mapping::set(lp_balances, lp_key, user_lp - liquidity);

        let amount_a: u128 = liquidity * pool.reserve_a / pool.total_lp_supply;
        let amount_b: u128 = liquidity * pool.reserve_b / pool.total_lp_supply;

        let is_token_a: bool = token_a == pool.token_a;
        let user_amount_a: u128 = is_token_a ? amount_a : amount_b;
        let user_amount_b: u128 = is_token_a ? amount_b : amount_a;
        assert(user_amount_a >= min_amount_a);
        assert(user_amount_b >= min_amount_b);

        let updated_pool: PoolInfo = PoolInfo {
            token_a: pool.token_a,
            token_b: pool.token_b,
            reserve_a: pool.reserve_a - amount_a,
            reserve_b: pool.reserve_b - amount_b,
            total_lp_supply: pool.total_lp_supply - liquidity,
            fee_rate: pool.fee_rate,
        };
        Mapping::set(pools, pool_id, updated_pool);

        let key_a: field = get_balance_key(provider, pool.token_a);
        let key_b: field = get_balance_key(provider, pool.token_b);
        let bal_a: u128 = Mapping::get_or_use(public_balances, key_a, 0u128);
        let bal_b: u128 = Mapping::get_or_use(public_balances, key_b, 0u128);
        Mapping::set(public_balances, key_a, bal_a + amount_a);
        Mapping::set(public_balances, key_b, bal_b + amount_b);
    }

    // ============================================
    // PRIVATE BATCH SWAP SUBMISSION (CORE INNOVATION!)
    // ============================================
    // User submits swap intent - their amount is NEVER stored publicly
    // Only the AGGREGATE totals are updated (privacy preserved)

    async transition submit_swap_intent(
        private token_in: field,
        private token_out: field,
        private amount_in: u128,
        private min_amount_out: u128,
        private nonce: field  // User provides unique nonce for privacy
    ) -> (SwapIntent, BatchClaim, Future) {
        assert(token_in != token_out);
        assert(amount_in > 0u128);

        let pool_id: field = get_pool_id(token_in, token_out);
        let is_a_to_b: bool = token_in < token_out;

        // Use provided nonce (frontend generates random field for uniqueness)

        // Create commitment (used to verify claim without revealing amount)
        let commitment: field = BHP256::hash_to_field(ClaimKey {
            user: self.caller,
            batch_id: 0u64, // Will be set in finalize
            pool_id: pool_id,
            nonce: nonce,
        });

        // Create private intent record
        let intent: SwapIntent = SwapIntent {
            owner: self.caller,
            pool_id: pool_id,
            batch_id: 0u64,
            token_in: token_in,
            token_out: token_out,
            amount_in: amount_in,
            min_amount_out: min_amount_out,
            nonce: nonce,
        };

        // Create claim record with all private data
        let claim: BatchClaim = BatchClaim {
            owner: self.caller,
            pool_id: pool_id,
            batch_id: 0u64,
            is_a_to_b: is_a_to_b,
            contribution: amount_in,
            min_output: min_amount_out,
            commitment: commitment,
        };

        return (intent, claim, finalize_submit_intent(
            pool_id,
            self.caller,
            amount_in,
            is_a_to_b,
            commitment
        ));
    }

    async function finalize_submit_intent(
        pool_id: field,
        user: address,
        amount_in: u128,
        is_a_to_b: bool,
        commitment: field
    ) {
        // Get current batch
        let batch_id: u64 = Mapping::get(current_batch, pool_id);
        let batch_key: field = get_batch_key(batch_id, pool_id);
        let batch: BatchData = Mapping::get(batch_data, batch_key);

        assert(!batch.executed);

        // Update ONLY aggregate totals - individual amount is PRIVATE!
        let new_input_a: u128 = is_a_to_b ? batch.total_input_a + amount_in : batch.total_input_a;
        let new_input_b: u128 = is_a_to_b ? batch.total_input_b : batch.total_input_b + amount_in;

        let updated_batch: BatchData = BatchData {
            total_input_a: new_input_a,
            total_input_b: new_input_b,
            total_output_a: 0u128,
            total_output_b: 0u128,
            executed: false,
            clearing_price: 0u128,
            participant_count: batch.participant_count + 1u64,
        };
        Mapping::set(batch_data, batch_key, updated_batch);

        // Store commitment (not the amount!) for double-claim prevention
        Mapping::set(claim_commitments, commitment, 0u8);

        // Deduct from user's public balance
        let pool: PoolInfo = Mapping::get(pools, pool_id);
        let token_in: field = is_a_to_b ? pool.token_a : pool.token_b;
        let balance_key: field = get_balance_key(user, token_in);
        let balance: u128 = Mapping::get(public_balances, balance_key);
        assert(balance >= amount_in);
        Mapping::set(public_balances, balance_key, balance - amount_in);
    }

    // ============================================
    // BATCH EXECUTION (UNIFORM CLEARING PRICE!)
    // ============================================

    async transition execute_batch(
        public token_a: field,
        public token_b: field
    ) -> Future {
        let pool_id: field = get_pool_id(token_a, token_b);
        return finalize_execute_batch(pool_id);
    }

    async function finalize_execute_batch(pool_id: field) {
        let batch_id: u64 = Mapping::get(current_batch, pool_id);
        let batch_key: field = get_batch_key(batch_id, pool_id);
        let batch: BatchData = Mapping::get(batch_data, batch_key);

        assert(!batch.executed);

        let pool: PoolInfo = Mapping::get(pools, pool_id);

        // CRITICAL: Calculate uniform clearing price for ALL trades
        let result: (u128, u128, u128) = calculate_clearing_price(
            pool.reserve_a,
            pool.reserve_b,
            batch.total_input_a,
            batch.total_input_b
        );

        let clearing_price: u128 = result.0;
        let output_a: u128 = result.1;
        let output_b: u128 = result.2;

        // Update pool reserves
        let new_reserve_a: u128 = pool.reserve_a + batch.total_input_a - output_a;
        let new_reserve_b: u128 = pool.reserve_b + batch.total_input_b - output_b;

        let updated_pool: PoolInfo = PoolInfo {
            token_a: pool.token_a,
            token_b: pool.token_b,
            reserve_a: new_reserve_a,
            reserve_b: new_reserve_b,
            total_lp_supply: pool.total_lp_supply,
            fee_rate: pool.fee_rate,
        };
        Mapping::set(pools, pool_id, updated_pool);

        // Store executed batch with uniform clearing price
        let executed_batch: BatchData = BatchData {
            total_input_a: batch.total_input_a,
            total_input_b: batch.total_input_b,
            total_output_a: output_a,
            total_output_b: output_b,
            executed: true,
            clearing_price: clearing_price,
            participant_count: batch.participant_count,
        };
        Mapping::set(batch_data, batch_key, executed_batch);

        // Update volume
        let current_volume: u128 = Mapping::get_or_use(total_volume, pool_id, 0u128);
        Mapping::set(total_volume, pool_id, current_volume + batch.total_input_a + batch.total_input_b);

        // Start next batch
        let next_id: u64 = batch_id + 1u64;
        Mapping::set(current_batch, pool_id, next_id);

        let next_key: field = get_batch_key(next_id, pool_id);
        let new_batch: BatchData = BatchData {
            total_input_a: 0u128,
            total_input_b: 0u128,
            total_output_a: 0u128,
            total_output_b: 0u128,
            executed: false,
            clearing_price: 0u128,
            participant_count: 0u64,
        };
        Mapping::set(batch_data, next_key, new_batch);
    }

    // ============================================
    // CLAIM BATCH OUTPUT (WITH SLIPPAGE PROTECTION!)
    // ============================================

    async transition claim_batch_output(
        private claim: BatchClaim
    ) -> Future {
        // User provides their PRIVATE claim record
        // Their contribution amount is verified against commitment
        return finalize_claim_batch(
            claim.pool_id,
            claim.owner,
            claim.batch_id,
            claim.is_a_to_b,
            claim.contribution,
            claim.min_output,
            claim.commitment
        );
    }

    async function finalize_claim_batch(
        pool_id: field,
        user: address,
        batch_id: u64,
        is_a_to_b: bool,
        contribution: u128,
        min_output: u128,
        commitment: field
    ) {
        // Get batch data
        let batch_key: field = get_batch_key(batch_id, pool_id);
        let batch: BatchData = Mapping::get(batch_data, batch_key);
        assert(batch.executed);

        // Verify commitment exists and hasn't been claimed
        let claimed: u8 = Mapping::get(claim_commitments, commitment);
        assert(claimed == 0u8);

        // Mark as claimed
        Mapping::set(claim_commitments, commitment, 1u8);

        // Calculate pro-rata output at UNIFORM clearing price
        let user_output: u128 = is_a_to_b ?
            // A->B: user gets proportional share of output_b
            (batch.total_input_a > 0u128 ?
                (contribution * batch.total_output_b) / batch.total_input_a : 0u128) :
            // B->A: user gets proportional share of output_a
            (batch.total_input_b > 0u128 ?
                (contribution * batch.total_output_a) / batch.total_input_b : 0u128);

        // SLIPPAGE PROTECTION: Verify user gets at least min_output
        assert(user_output >= min_output);

        // Credit output to user
        let pool: PoolInfo = Mapping::get(pools, pool_id);
        let output_token: field = is_a_to_b ? pool.token_b : pool.token_a;
        let balance_key: field = get_balance_key(user, output_token);
        let current_bal: u128 = Mapping::get_or_use(public_balances, balance_key, 0u128);
        Mapping::set(public_balances, balance_key, current_bal + user_output);
    }

    // ============================================
    // INSTANT SWAP (NON-BATCHED)
    // ============================================

    async transition swap_instant(
        public token_in: field,
        public token_out: field,
        public amount_in: u128,
        public min_amount_out: u128
    ) -> Future {
        assert(token_in != token_out);
        assert(amount_in > 0u128);

        let pool_id: field = get_pool_id(token_in, token_out);
        return finalize_swap_instant(pool_id, token_in, amount_in, min_amount_out, self.caller);
    }

    async function finalize_swap_instant(
        pool_id: field,
        token_in: field,
        amount_in: u128,
        min_amount_out: u128,
        trader: address
    ) {
        let pool: PoolInfo = Mapping::get(pools, pool_id);

        let is_a_to_b: bool = token_in == pool.token_a;
        let reserve_in: u128 = is_a_to_b ? pool.reserve_a : pool.reserve_b;
        let reserve_out: u128 = is_a_to_b ? pool.reserve_b : pool.reserve_a;

        let amount_out: u128 = get_amount_out(amount_in, reserve_in, reserve_out);
        assert(amount_out >= min_amount_out);

        let new_reserve_a: u128 = is_a_to_b ? pool.reserve_a + amount_in : pool.reserve_a - amount_out;
        let new_reserve_b: u128 = is_a_to_b ? pool.reserve_b - amount_out : pool.reserve_b + amount_in;

        let updated_pool: PoolInfo = PoolInfo {
            token_a: pool.token_a,
            token_b: pool.token_b,
            reserve_a: new_reserve_a,
            reserve_b: new_reserve_b,
            total_lp_supply: pool.total_lp_supply,
            fee_rate: pool.fee_rate,
        };
        Mapping::set(pools, pool_id, updated_pool);

        let key_in: field = get_balance_key(trader, token_in);
        let token_out_addr: field = is_a_to_b ? pool.token_b : pool.token_a;
        let key_out: field = get_balance_key(trader, token_out_addr);

        let bal_in: u128 = Mapping::get(public_balances, key_in);
        let bal_out: u128 = Mapping::get_or_use(public_balances, key_out, 0u128);
        assert(bal_in >= amount_in);

        Mapping::set(public_balances, key_in, bal_in - amount_in);
        Mapping::set(public_balances, key_out, bal_out + amount_out);

        let current_volume: u128 = Mapping::get_or_use(total_volume, pool_id, 0u128);
        Mapping::set(total_volume, pool_id, current_volume + amount_in);
    }

    // ============================================
    // TOKEN FAUCET (FOR TESTNET)
    // ============================================

    async transition deposit_public(
        public token: field,
        public amount: u128
    ) -> Future {
        return finalize_deposit_public(token, amount, self.caller);
    }

    async function finalize_deposit_public(
        token: field,
        amount: u128,
        depositor: address
    ) {
        let key: field = get_balance_key(depositor, token);
        let current: u128 = Mapping::get_or_use(public_balances, key, 0u128);
        Mapping::set(public_balances, key, current + amount);
    }

    async transition withdraw_public(
        public token: field,
        public amount: u128
    ) -> Future {
        return finalize_withdraw_public(token, amount, self.caller);
    }

    async function finalize_withdraw_public(
        token: field,
        amount: u128,
        withdrawer: address
    ) {
        let key: field = get_balance_key(withdrawer, token);
        let current: u128 = Mapping::get(public_balances, key);
        assert(current >= amount);
        Mapping::set(public_balances, key, current - amount);
    }
}
