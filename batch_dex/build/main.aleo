program shielded_batch_dex_v2.aleo;

record SwapIntent:
    owner as address.private;
    pool_id as field.private;
    batch_id as u64.private;
    token_in as field.private;
    token_out as field.private;
    amount_in as u128.private;
    min_amount_out as u128.private;
    nonce as field.private;

record BatchClaim:
    owner as address.private;
    pool_id as field.private;
    batch_id as u64.private;
    is_a_to_b as boolean.private;
    contribution as u128.private;
    min_output as u128.private;
    commitment as field.private;

struct BalanceKey:
    account as address;
    token as field;

struct LPBalanceKey:
    account as address;
    pool_id as field;

struct PairKey:
    token_a as field;
    token_b as field;

struct BatchKey:
    batch_id as u64;
    pool_id as field;

struct ClaimKey:
    user as address;
    batch_id as u64;
    pool_id as field;
    nonce as field;

struct PoolInfo:
    token_a as field;
    token_b as field;
    reserve_a as u128;
    reserve_b as u128;
    total_lp_supply as u128;
    fee_rate as u64;

struct BatchData:
    total_input_a as u128;
    total_input_b as u128;
    total_output_a as u128;
    total_output_b as u128;
    executed as boolean;
    clearing_price as u128;
    participant_count as u64;

mapping public_balances:
    key as field.public;
    value as u128.public;

mapping pools:
    key as field.public;
    value as PoolInfo.public;

mapping current_batch:
    key as field.public;
    value as u64.public;

mapping batch_data:
    key as field.public;
    value as BatchData.public;

mapping claim_commitments:
    key as field.public;
    value as u8.public;

mapping lp_balances:
    key as field.public;
    value as u128.public;

mapping total_volume:
    key as field.public;
    value as u128.public;

function create_pool:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    is.neq r0 r1 into r5;
    assert.eq r5 true;
    gt r2 0u128 into r6;
    assert.eq r6 true;
    gt r3 0u128 into r7;
    assert.eq r7 true;
    lt r0 r1 into r8;
    ternary r8 r0 r1 into r9;
    ternary r8 r1 r0 into r10;
    cast r9 r10 into r11 as PairKey;
    hash.bhp256 r11 into r12 as field;
    async create_pool r12 r0 r1 r2 r3 r4 self.caller into r13;
    output r13 as shielded_batch_dex_v2.aleo/create_pool.future;

finalize create_pool:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as address.public;
    contains pools[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    lt r1 r2 into r9;
    ternary r9 r1 r2 into r10;
    ternary r9 r2 r1 into r11;
    ternary r9 r3 r4 into r12;
    ternary r9 r4 r3 into r13;
    mul r12 r13 into r14;
    is.eq r14 0u128 into r15;
    is.eq r14 1u128 into r16;
    add r14 1u128 into r17;
    div r17 2u128 into r18;
    lt r18 r14 into r19;
    ternary r19 r18 r14 into r20;
    div r14 r20 into r21;
    add r21 r20 into r22;
    div r22 2u128 into r23;
    lt r23 r20 into r24;
    ternary r24 r23 r20 into r25;
    div r14 r25 into r26;
    add r26 r25 into r27;
    div r27 2u128 into r28;
    lt r28 r25 into r29;
    ternary r29 r28 r25 into r30;
    div r14 r30 into r31;
    add r31 r30 into r32;
    div r32 2u128 into r33;
    lt r33 r30 into r34;
    ternary r34 r33 r30 into r35;
    div r14 r35 into r36;
    add r36 r35 into r37;
    div r37 2u128 into r38;
    lt r38 r35 into r39;
    ternary r39 r38 r35 into r40;
    div r14 r40 into r41;
    add r41 r40 into r42;
    div r42 2u128 into r43;
    lt r43 r40 into r44;
    ternary r44 r43 r40 into r45;
    ternary r16 1u128 r45 into r46;
    ternary r15 0u128 r46 into r47;
    gte r47 1000u128 into r48;
    assert.eq r48 true;
    gte r47 r5 into r49;
    assert.eq r49 true;
    cast r10 r11 r12 r13 r47 30u64 into r50 as PoolInfo;
    set r50 into pools[r0];
    set 1u64 into current_batch[r0];
    cast 1u64 r0 into r51 as BatchKey;
    hash.bhp256 r51 into r52 as field;
    cast 0u128 0u128 0u128 0u128 false 0u128 0u64 into r53 as BatchData;
    set r53 into batch_data[r52];
    cast r6 r0 into r54 as LPBalanceKey;
    hash.bhp256 r54 into r55 as field;
    set r47 into lp_balances[r55];
    cast r6 r10 into r56 as BalanceKey;
    hash.bhp256 r56 into r57 as field;
    cast r6 r11 into r58 as BalanceKey;
    hash.bhp256 r58 into r59 as field;
    get.or_use public_balances[r57] 0u128 into r60;
    get.or_use public_balances[r59] 0u128 into r61;
    gte r60 r12 into r62;
    assert.eq r62 true;
    gte r61 r13 into r63;
    assert.eq r63 true;
    sub r60 r12 into r64;
    set r64 into public_balances[r57];
    sub r61 r13 into r65;
    set r65 into public_balances[r59];

function add_liquidity_public:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    lt r0 r1 into r5;
    ternary r5 r0 r1 into r6;
    ternary r5 r1 r0 into r7;
    cast r6 r7 into r8 as PairKey;
    hash.bhp256 r8 into r9 as field;
    async add_liquidity_public r9 r0 r2 r3 r4 self.caller into r10;
    output r10 as shielded_batch_dex_v2.aleo/add_liquidity_public.future;

finalize add_liquidity_public:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    get pools[r0] into r6;
    is.eq r1 r6.token_a into r7;
    ternary r7 r6.reserve_a r6.reserve_b into r8;
    ternary r7 r6.reserve_b r6.reserve_a into r9;
    mul r2 r9 into r10;
    div r10 r8 into r11;
    lte r11 r3 into r12;
    ternary r12 r11 r3 into r13;
    mul r2 r6.total_lp_supply into r14;
    div r14 r8 into r15;
    mul r13 r6.total_lp_supply into r16;
    div r16 r9 into r17;
    lt r15 r17 into r18;
    ternary r18 r15 r17 into r19;
    gte r19 r4 into r20;
    assert.eq r20 true;
    add r6.reserve_a r2 into r21;
    add r6.reserve_a r13 into r22;
    ternary r7 r21 r22 into r23;
    add r6.reserve_b r13 into r24;
    add r6.reserve_b r2 into r25;
    ternary r7 r24 r25 into r26;
    add r6.total_lp_supply r19 into r27;
    cast r6.token_a r6.token_b r23 r26 r27 r6.fee_rate into r28 as PoolInfo;
    set r28 into pools[r0];
    cast r5 r0 into r29 as LPBalanceKey;
    hash.bhp256 r29 into r30 as field;
    get.or_use lp_balances[r30] 0u128 into r31;
    add r31 r19 into r32;
    set r32 into lp_balances[r30];
    cast r5 r6.token_a into r33 as BalanceKey;
    hash.bhp256 r33 into r34 as field;
    cast r5 r6.token_b into r35 as BalanceKey;
    hash.bhp256 r35 into r36 as field;
    get public_balances[r34] into r37;
    get public_balances[r36] into r38;
    ternary r7 r2 r13 into r39;
    ternary r7 r13 r2 into r40;
    gte r37 r39 into r41;
    assert.eq r41 true;
    gte r38 r40 into r42;
    assert.eq r42 true;
    sub r37 r39 into r43;
    set r43 into public_balances[r34];
    sub r38 r40 into r44;
    set r44 into public_balances[r36];

function remove_liquidity_public:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    lt r0 r1 into r5;
    ternary r5 r0 r1 into r6;
    ternary r5 r1 r0 into r7;
    cast r6 r7 into r8 as PairKey;
    hash.bhp256 r8 into r9 as field;
    async remove_liquidity_public r9 r0 r2 r3 r4 self.caller into r10;
    output r10 as shielded_batch_dex_v2.aleo/remove_liquidity_public.future;

finalize remove_liquidity_public:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as address.public;
    get pools[r0] into r6;
    cast r5 r0 into r7 as LPBalanceKey;
    hash.bhp256 r7 into r8 as field;
    get lp_balances[r8] into r9;
    gte r9 r2 into r10;
    assert.eq r10 true;
    sub r9 r2 into r11;
    set r11 into lp_balances[r8];
    mul r2 r6.reserve_a into r12;
    div r12 r6.total_lp_supply into r13;
    mul r2 r6.reserve_b into r14;
    div r14 r6.total_lp_supply into r15;
    is.eq r1 r6.token_a into r16;
    ternary r16 r13 r15 into r17;
    ternary r16 r15 r13 into r18;
    gte r17 r3 into r19;
    assert.eq r19 true;
    gte r18 r4 into r20;
    assert.eq r20 true;
    sub r6.reserve_a r13 into r21;
    sub r6.reserve_b r15 into r22;
    sub r6.total_lp_supply r2 into r23;
    cast r6.token_a r6.token_b r21 r22 r23 r6.fee_rate into r24 as PoolInfo;
    set r24 into pools[r0];
    cast r5 r6.token_a into r25 as BalanceKey;
    hash.bhp256 r25 into r26 as field;
    cast r5 r6.token_b into r27 as BalanceKey;
    hash.bhp256 r27 into r28 as field;
    get.or_use public_balances[r26] 0u128 into r29;
    get.or_use public_balances[r28] 0u128 into r30;
    add r29 r13 into r31;
    set r31 into public_balances[r26];
    add r30 r15 into r32;
    set r32 into public_balances[r28];

function submit_swap_intent:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as field.private;
    is.neq r0 r1 into r5;
    assert.eq r5 true;
    gt r2 0u128 into r6;
    assert.eq r6 true;
    lt r0 r1 into r7;
    ternary r7 r0 r1 into r8;
    ternary r7 r1 r0 into r9;
    cast r8 r9 into r10 as PairKey;
    hash.bhp256 r10 into r11 as field;
    cast self.caller 0u64 r11 r4 into r12 as ClaimKey;
    hash.bhp256 r12 into r13 as field;
    cast self.caller r11 0u64 r0 r1 r2 r3 r4 into r14 as SwapIntent.record;
    cast self.caller r11 0u64 r7 r2 r3 r13 into r15 as BatchClaim.record;
    async submit_swap_intent r11 self.caller r2 r7 r13 into r16;
    output r14 as SwapIntent.record;
    output r15 as BatchClaim.record;
    output r16 as shielded_batch_dex_v2.aleo/submit_swap_intent.future;

finalize submit_swap_intent:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as u128.public;
    input r3 as boolean.public;
    input r4 as field.public;
    get current_batch[r0] into r5;
    cast r5 r0 into r6 as BatchKey;
    hash.bhp256 r6 into r7 as field;
    get batch_data[r7] into r8;
    not r8.executed into r9;
    assert.eq r9 true;
    add r8.total_input_a r2 into r10;
    ternary r3 r10 r8.total_input_a into r11;
    add r8.total_input_b r2 into r12;
    ternary r3 r8.total_input_b r12 into r13;
    add r8.participant_count 1u64 into r14;
    cast r11 r13 0u128 0u128 false 0u128 r14 into r15 as BatchData;
    set r15 into batch_data[r7];
    set 0u8 into claim_commitments[r4];
    get pools[r0] into r16;
    ternary r3 r16.token_a r16.token_b into r17;
    cast r1 r17 into r18 as BalanceKey;
    hash.bhp256 r18 into r19 as field;
    get public_balances[r19] into r20;
    gte r20 r2 into r21;
    assert.eq r21 true;
    sub r20 r2 into r22;
    set r22 into public_balances[r19];

function execute_batch:
    input r0 as field.public;
    input r1 as field.public;
    lt r0 r1 into r2;
    ternary r2 r0 r1 into r3;
    ternary r2 r1 r0 into r4;
    cast r3 r4 into r5 as PairKey;
    hash.bhp256 r5 into r6 as field;
    async execute_batch r6 into r7;
    output r7 as shielded_batch_dex_v2.aleo/execute_batch.future;

finalize execute_batch:
    input r0 as field.public;
    get current_batch[r0] into r1;
    cast r1 r0 into r2 as BatchKey;
    hash.bhp256 r2 into r3 as field;
    get batch_data[r3] into r4;
    not r4.executed into r5;
    assert.eq r5 true;
    get pools[r0] into r6;
    is.eq r4.total_input_a 0u128 into r7;
    is.eq r4.total_input_b 0u128 into r8;
    and r7 r8 into r9;
    gt r6.reserve_a 0u128 into r10;
    mul r6.reserve_b 1000000000000000000u128 into r11;
    div r11 r6.reserve_a into r12;
    ternary r10 r12 0u128 into r13;
    gt r4.total_input_a 0u128 into r14;
    mul r4.total_input_a 997u128 into r15;
    mul r15 r6.reserve_b into r16;
    mul r6.reserve_a 1000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    ternary r14 r19 0u128 into r20;
    add r6.reserve_a r4.total_input_a into r21;
    sub r6.reserve_b r20 into r22;
    gt r4.total_input_b 0u128 into r23;
    gt r22 0u128 into r24;
    and r23 r24 into r25;
    mul r4.total_input_b 997u128 into r26;
    mul r26 r21 into r27;
    mul r22 1000u128 into r28;
    add r28 r26 into r29;
    div r27 r29 into r30;
    ternary r25 r30 0u128 into r31;
    mul r20 1000000000000000000u128 into r32;
    div r32 r4.total_input_a into r33;
    gt r31 0u128 into r34;
    and r23 r34 into r35;
    mul r4.total_input_b 1000000000000000000u128 into r36;
    div r36 r31 into r37;
    ternary r35 r37 r12 into r38;
    ternary r14 r33 r38 into r39;
    ternary r9 r13 r39 into r40;
    ternary r9 0u128 r31 into r41;
    ternary r9 0u128 r20 into r42;
    add r6.reserve_a r4.total_input_a into r43;
    sub r43 r41 into r44;
    add r6.reserve_b r4.total_input_b into r45;
    sub r45 r42 into r46;
    cast r6.token_a r6.token_b r44 r46 r6.total_lp_supply r6.fee_rate into r47 as PoolInfo;
    set r47 into pools[r0];
    cast r4.total_input_a r4.total_input_b r41 r42 true r40 r4.participant_count into r48 as BatchData;
    set r48 into batch_data[r3];
    get.or_use total_volume[r0] 0u128 into r49;
    add r49 r4.total_input_a into r50;
    add r50 r4.total_input_b into r51;
    set r51 into total_volume[r0];
    add r1 1u64 into r52;
    set r52 into current_batch[r0];
    cast r52 r0 into r53 as BatchKey;
    hash.bhp256 r53 into r54 as field;
    cast 0u128 0u128 0u128 0u128 false 0u128 0u64 into r55 as BatchData;
    set r55 into batch_data[r54];

function claim_batch_output:
    input r0 as BatchClaim.record;
    async claim_batch_output r0.pool_id r0.owner r0.batch_id r0.is_a_to_b r0.contribution r0.min_output r0.commitment into r1;
    output r1 as shielded_batch_dex_v2.aleo/claim_batch_output.future;

finalize claim_batch_output:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as u64.public;
    input r3 as boolean.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as field.public;
    cast r2 r0 into r7 as BatchKey;
    hash.bhp256 r7 into r8 as field;
    get batch_data[r8] into r9;
    assert.eq r9.executed true;
    get claim_commitments[r6] into r10;
    is.eq r10 0u8 into r11;
    assert.eq r11 true;
    set 1u8 into claim_commitments[r6];
    gt r9.total_input_a 0u128 into r12;
    mul r4 r9.total_output_b into r13;
    div r13 r9.total_input_a into r14;
    ternary r12 r14 0u128 into r15;
    gt r9.total_input_b 0u128 into r16;
    mul r4 r9.total_output_a into r17;
    div r17 r9.total_input_b into r18;
    ternary r16 r18 0u128 into r19;
    ternary r3 r15 r19 into r20;
    gte r20 r5 into r21;
    assert.eq r21 true;
    get pools[r0] into r22;
    ternary r3 r22.token_b r22.token_a into r23;
    cast r1 r23 into r24 as BalanceKey;
    hash.bhp256 r24 into r25 as field;
    get.or_use public_balances[r25] 0u128 into r26;
    add r26 r20 into r27;
    set r27 into public_balances[r25];

function swap_instant:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    is.neq r0 r1 into r4;
    assert.eq r4 true;
    gt r2 0u128 into r5;
    assert.eq r5 true;
    lt r0 r1 into r6;
    ternary r6 r0 r1 into r7;
    ternary r6 r1 r0 into r8;
    cast r7 r8 into r9 as PairKey;
    hash.bhp256 r9 into r10 as field;
    async swap_instant r10 r0 r2 r3 self.caller into r11;
    output r11 as shielded_batch_dex_v2.aleo/swap_instant.future;

finalize swap_instant:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as address.public;
    get pools[r0] into r5;
    is.eq r1 r5.token_a into r6;
    ternary r6 r5.reserve_a r5.reserve_b into r7;
    ternary r6 r5.reserve_b r5.reserve_a into r8;
    mul r2 997u128 into r9;
    mul r9 r8 into r10;
    mul r7 1000u128 into r11;
    add r11 r9 into r12;
    div r10 r12 into r13;
    gte r13 r3 into r14;
    assert.eq r14 true;
    add r5.reserve_a r2 into r15;
    sub r5.reserve_a r13 into r16;
    ternary r6 r15 r16 into r17;
    sub r5.reserve_b r13 into r18;
    add r5.reserve_b r2 into r19;
    ternary r6 r18 r19 into r20;
    cast r5.token_a r5.token_b r17 r20 r5.total_lp_supply r5.fee_rate into r21 as PoolInfo;
    set r21 into pools[r0];
    cast r4 r1 into r22 as BalanceKey;
    hash.bhp256 r22 into r23 as field;
    ternary r6 r5.token_b r5.token_a into r24;
    cast r4 r24 into r25 as BalanceKey;
    hash.bhp256 r25 into r26 as field;
    get public_balances[r23] into r27;
    get.or_use public_balances[r26] 0u128 into r28;
    gte r27 r2 into r29;
    assert.eq r29 true;
    sub r27 r2 into r30;
    set r30 into public_balances[r23];
    add r28 r13 into r31;
    set r31 into public_balances[r26];
    get.or_use total_volume[r0] 0u128 into r32;
    add r32 r2 into r33;
    set r33 into total_volume[r0];

function deposit_public:
    input r0 as field.public;
    input r1 as u128.public;
    async deposit_public r0 r1 self.caller into r2;
    output r2 as shielded_batch_dex_v2.aleo/deposit_public.future;

finalize deposit_public:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    cast r2 r0 into r3 as BalanceKey;
    hash.bhp256 r3 into r4 as field;
    get.or_use public_balances[r4] 0u128 into r5;
    add r5 r1 into r6;
    set r6 into public_balances[r4];

function withdraw_public:
    input r0 as field.public;
    input r1 as u128.public;
    async withdraw_public r0 r1 self.caller into r2;
    output r2 as shielded_batch_dex_v2.aleo/withdraw_public.future;

finalize withdraw_public:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    cast r2 r0 into r3 as BalanceKey;
    hash.bhp256 r3 into r4 as field;
    get public_balances[r4] into r5;
    gte r5 r1 into r6;
    assert.eq r6 true;
    sub r5 r1 into r7;
    set r7 into public_balances[r4];

constructor:
    assert.eq edition 0u16;
