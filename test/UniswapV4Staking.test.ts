process.env.ENVIO_NETWORK = 'testnet';

import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import { createTestIndexer, type TestIndexer, type TestIndexerProcessConfig } from 'envio';
import { AbiCoder, concat, keccak256, ZeroAddress } from 'ethers';
import { CHAIN_ID, addr } from './fixtures';
import {
  buildMerkleTree,
  compareRewardBuckets,
  getPredictedDailyBlockCount,
  TOTAL_DAILY_REWARDS,
} from '../src/helper/UniswapV4Helpers/utils';
import { getNewUserCumulativeReward } from '../src/helper/UniswapV4Staking';
import { getLoadedConfig } from '../src/config';
import { getAmount0, getAmount1 } from '../src/helper/UniswapV4Helpers/liquidityAmounts';

type ChainSimulate = NonNullable<
  NonNullable<TestIndexerProcessConfig['chains'][typeof CHAIN_ID]>['simulate']
>;

const ZERO = ZeroAddress as `0x${string}`;
// Static testnet addresses from src/config/testnet.ts / config.yaml.
const STAKING_ADDRESS = addr('0xfdf22B183490f005e2e51A6Caf4202E46cc11b97');
const POSITION_MANAGER_ADDRESS = addr('0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4');
const BST_ADDRESS = addr('0x7000Ec7486d8c6f9bd9FfA930f9ACE2D9564d02b');
const ALICE = addr('0x6666666666666666666666666666666666666666');

const STAKING_POOL_ENTITY_ID = `${CHAIN_ID}-${STAKING_ADDRESS}`;

const TOKEN_ID = 7n;
const TOKEN_ENTITY_ID = `${CHAIN_ID}-${TOKEN_ID}`;
const MINT_TX = `0x${'aa'.repeat(32)}`;
const UNI_POSITION_ID = `${CHAIN_ID}-${MINT_TX}`;
const STAKING_POSITION_ID = `${CHAIN_ID}-${ALICE}-${TOKEN_ID}`;

// Simulate delivers the indexed PoolKey tuple as a positional array;
// the handler derives the pool entity id as keccak256(abi.encode(PoolKey)) — the V4 poolId.
const TARGET_POOL_KEY = [ZERO, BST_ADDRESS, 3000n, 60n, ZERO] as const;
const POOL_ID = keccak256(
  AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [...TARGET_POOL_KEY],
  ),
);
const UNI_POOL_ENTITY_ID = `${CHAIN_ID}-${POOL_ID}`;

const lpStakingInitEvent = (
  overrides: { minDays?: bigint; logIndex?: number; blockNumber?: number } = {},
): ChainSimulate[number] =>
  ({
    contract: 'UniswapV4Staking',
    event: 'LPStakingInit',
    logIndex: overrides.logIndex ?? 1,
    block: { number: overrides.blockNumber ?? 100, timestamp: 1_700_000_000 },
    transaction: { hash: `0x${'bb'.repeat(32)}` },
    params: {
      positionManager: POSITION_MANAGER_ADDRESS,
      targetPoolKey: TARGET_POOL_KEY,
      minDays: overrides.minDays ?? 7n,
      maxDays: 365n,
      minBoost: 100n,
      maxBoost: 200n,
      earlyPositionSlash: 10n,
      earlyRewardSlash: 50n,
    },
  }) as unknown as ChainSimulate[number];

const depositEvent = (
  overrides: {
    tokenId?: bigint;
    epoch?: bigint;
    liquidity?: bigint;
    lockedUntil?: bigint;
    timeBoost?: bigint;
    logIndex?: number;
    blockNumber?: number;
  } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4Staking',
  event: 'Deposit',
  logIndex: overrides.logIndex ?? 1,
  block: { number: overrides.blockNumber ?? 100, timestamp: 1_700_000_000 },
  transaction: { hash: `0x${'cc'.repeat(32)}` },
  params: {
    owner: ALICE,
    tokenId: overrides.tokenId ?? TOKEN_ID,
    epoch: overrides.epoch ?? 1n,
    liquidity: overrides.liquidity ?? 10n ** 18n,
    lockedUntil: overrides.lockedUntil ?? 1_710_000_000n,
    timeBoost: overrides.timeBoost ?? 122n,
  },
});

const withdrawEvent = (
  overrides: { logIndex?: number; blockNumber?: number } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4Staking',
  event: 'Withdraw',
  logIndex: overrides.logIndex ?? 2,
  block: { number: overrides.blockNumber ?? 101, timestamp: 1_700_000_100 },
  transaction: { hash: `0x${'dd'.repeat(32)}` },
  params: { owner: ALICE, tokenId: TOKEN_ID, liquidity: 10n ** 18n },
});

const runEvents = (indexer: TestIndexer, ...events: ChainSimulate) =>
  indexer.process({ chains: { [CHAIN_ID]: { simulate: events } } });

const setPositionToken = (indexer: TestIndexer) =>
  indexer.UniswapV4PositionToken.set({
    id: TOKEN_ENTITY_ID,
    tokenId: TOKEN_ID,
    owner: ALICE,
    isBurned: false,
    mintedTransactionHash: MINT_TX,
    wallet_id: `${CHAIN_ID}-${ALICE}`,
    position_id: UNI_POSITION_ID,
  });

describe('UniswapV4Staking', () => {
  let indexer: TestIndexer;

  beforeEach(() => {
    indexer = createTestIndexer();
    setPositionToken(indexer);
  });

  it('LPStakingInit creates the staking pool once when the target Uniswap pool exists', async (t) => {
    indexer.UniswapV4Pool.set({
      id: UNI_POOL_ENTITY_ID,
      chainId: CHAIN_ID,
      poolId: POOL_ID,
      currency0: ZERO,
      currency1: BST_ADDRESS,
      fee: 3000n,
      tickSpacing: 60n,
      hooks: ZERO,
      sqrtPriceX96: 79228162514264337593543950336n,
      tick: 0n,
      createdAtTimestamp: 1_699_999_000,
      creationTransaction: `0x${'ee'.repeat(32)}`,
    });

    await runEvents(
      indexer,
      lpStakingInitEvent({ blockNumber: 100, logIndex: 1 }),
      // Second init must not overwrite the existing staking pool config.
      lpStakingInitEvent({ minDays: 30n, blockNumber: 101, logIndex: 2 }),
    );

    const pools = await indexer.StakingPoolV4.getAll();
    t.expect(pools).toHaveLength(1);

    const pool = await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID);
    t.expect(pool.contractAddress).toBe(STAKING_ADDRESS);
    t.expect(pool.positionManager).toBe(POSITION_MANAGER_ADDRESS);
    t.expect(pool.targetPoolKey).toBe(POOL_ID);
    t.expect(pool.minDays).toBe(7n);
    t.expect(pool.maxDays).toBe(365n);
    t.expect(pool.minBoost).toBe(100n);
    t.expect(pool.maxBoost).toBe(200n);
    t.expect(pool.earlyPositionSlash).toBe(10n);
    t.expect(pool.earlyRewardSlash).toBe(50n);
    t.expect(pool.totalRewardsAdded).toBe(0n);
    t.expect(pool.carryOverReward).toBe(0n);
    // LPStakingInit carries only the maximum slash rates.
    t.expect(pool.earlyMinimumPositionSlash).toBeUndefined();
    t.expect(pool.uniswapV4Pool_id).toBe(UNI_POOL_ENTITY_ID);
  });

  it('LPStakingInit is ignored when the target Uniswap pool is not indexed', async (t) => {
    await runEvents(indexer, lpStakingInitEvent());

    t.expect(await indexer.StakingPoolV4.getAll()).toHaveLength(0);
  });

  it('Deposit creates a staking position linked to the NFT and writes a DEPOSIT record', async (t) => {
    await runEvents(indexer, depositEvent());

    const position = await indexer.StakingPoolV4Position.getOrThrow(STAKING_POSITION_ID);
    t.expect(position.tokenId).toBe(TOKEN_ID);
    t.expect(position.epoch).toBe(1n);
    t.expect(position.liquidity).toBe(10n ** 18n);
    t.expect(position.lockedUntil).toBe(1_710_000_000n);
    t.expect(position.timeBoost).toBe(122n);
    t.expect(position.isPositionClosed).toBe(false);
    t.expect(position.wallet_id).toBe(`${CHAIN_ID}-${ALICE}`);
    t.expect(position.pool_id).toBe(STAKING_POOL_ENTITY_ID);
    t.expect(position.positionToken_id).toBe(TOKEN_ENTITY_ID);
    t.expect(position.uniPosition_id).toBe(UNI_POSITION_ID);

    const records = await indexer.StakingPoolV4PositionRecord.getAll();
    t.expect(records).toHaveLength(1);
    t.expect(records[0]?.transactionType).toBe('DEPOSIT');
    t.expect(records[0]?.tokenId).toBe(TOKEN_ID);
    t.expect(records[0]?.epoch).toBe(1n);
    t.expect(records[0]?.stakingPosition_id).toBe(STAKING_POSITION_ID);
    t.expect(records[0]?.wallet_id).toBe(`${CHAIN_ID}-${ALICE}`);
  });

  it('Deposit is ignored when the NFT position token is unknown', async (t) => {
    await runEvents(indexer, depositEvent({ tokenId: 999n }));

    t.expect(await indexer.StakingPoolV4Position.getAll()).toHaveLength(0);
    t.expect(await indexer.StakingPoolV4PositionRecord.getAll()).toHaveLength(0);
  });

  it('Withdraw closes the staking position and writes a WITHDRAW record', async (t) => {
    await runEvents(
      indexer,
      depositEvent({ blockNumber: 100, logIndex: 1 }),
      withdrawEvent({ blockNumber: 101, logIndex: 2 }),
    );

    const position = await indexer.StakingPoolV4Position.getOrThrow(STAKING_POSITION_ID);
    t.expect(position.isPositionClosed).toBe(true);
    t.expect(position.updatedAtTimestamp).toBe(1_700_000_100);

    const records = await indexer.StakingPoolV4PositionRecord.getAll();
    t.expect(records).toHaveLength(2);
    t.expect(records.map((r) => r.transactionType).sort()).toEqual(['DEPOSIT', 'WITHDRAW']);
    const withdrawRecord = records.find((r) => r.transactionType === 'WITHDRAW');
    t.expect(withdrawRecord?.stakingPosition_id).toBe(STAKING_POSITION_ID);
    t.expect(withdrawRecord?.wallet_id).toBe(`${CHAIN_ID}-${ALICE}`);
    t.expect(withdrawRecord?.pool_id).toBe(STAKING_POOL_ENTITY_ID);
    // Withdraw has no epoch param: the record takes the position's current epoch.
    t.expect(withdrawRecord?.epoch).toBe(1n);
  });

  it('re-depositing the same NFT after withdraw reopens the position with updated terms', async (t) => {
    await runEvents(
      indexer,
      depositEvent({ blockNumber: 100, logIndex: 1 }),
      withdrawEvent({ blockNumber: 101, logIndex: 2 }),
      depositEvent({
        epoch: 2n,
        liquidity: 2n * 10n ** 18n,
        lockedUntil: 1_720_000_000n,
        timeBoost: 150n,
        blockNumber: 102,
        logIndex: 3,
      }),
    );

    const position = await indexer.StakingPoolV4Position.getOrThrow(STAKING_POSITION_ID);
    t.expect(position.isPositionClosed).toBe(false);
    t.expect(position.epoch).toBe(2n);
    t.expect(position.liquidity).toBe(2n * 10n ** 18n);
    t.expect(position.lockedUntil).toBe(1_720_000_000n);
    t.expect(position.timeBoost).toBe(150n);
    t.expect(await indexer.StakingPoolV4Position.getAll()).toHaveLength(1);
    t.expect(await indexer.StakingPoolV4PositionRecord.getAll()).toHaveLength(3);
  });
});


// ---------------------------------------------------------------------------
// Daily reward trees. Every deposit of an NFT starts a new epoch with its own reward
// bucket. The contract only verifies proofs against its single latest root and tracks
// claims per (tokenId, epoch), so every bucket that has ever earned must be in every
// tree, keyed by (tokenId, epoch).
//
// Each test runs one `process()` call: the test indexer can't resume a chain whose
// config has contracts starting before the resumed block (e.g. ZeroEx). Trees are
// read back per block from the returned changes.
// ---------------------------------------------------------------------------

const DEPLOY_BLOCK = getLoadedConfig().uniswapV4StakingStartBlock;
const DAY_BLOCKS = getPredictedDailyBlockCount(CHAIN_ID);
const dayBlock = (day: number) => DEPLOY_BLOCK + (day - 1) * DAY_BLOCKS;

const BOB = addr('0x7777777777777777777777777777777777777777');
const CAROL = addr('0x8888888888888888888888888888888888888888');
const DAVE = addr('0x9999999999999999999999999999999999999999');
// Smart-wallet case: claims arrive through a relayer, not from the NFT holder.
const RELAYER = addr('0x5555555555555555555555555555555555555555');

// #43 has a narrow range and leaves it when the pool tick moves to 120; the others stay in range.
const WIDE_RANGE = { tickLower: -600n, tickUpper: 600n };
const FULL_RANGE = { tickLower: -887220n, tickUpper: 887220n };
const NARROW_RANGE = { tickLower: -60n, tickUpper: 60n };
const OUT_OF_NARROW_RANGE_TICK = 120n;

const THIRD = TOTAL_DAILY_REWARDS / 3n;
const HALF = TOTAL_DAILY_REWARDS / 2n;
const FULL = TOTAL_DAILY_REWARDS;

// 17.5% on the contract's 100000 scale.
const REWARD_SLASH = 17_500n;

const rewardId = (tokenId: bigint, epoch: bigint) => `${STAKING_POOL_ENTITY_ID}-${tokenId}-${epoch}`;
const wallet = (address: string) => `${CHAIN_ID}-${address}`;

// Reward buckets are written as `${tokenId}:${epoch}` in expected totals.
const bucketKey = (r: { tokenId: bigint; epoch: bigint }) => `${r.tokenId}:${r.epoch}`;
const parseBucket = (key: string) => {
  const [tokenId, epoch] = key.split(':');
  return { tokenId: BigInt(tokenId!), epoch: BigInt(epoch!) };
};

// Root the operator would publish for these totals.
const rootOf = (totals: Record<string, bigint>) =>
  buildMerkleTree(
    Object.entries(totals)
      .map(([key, cumulativeReward]) => ({ ...parseBucket(key), cumulativeReward }))
      .sort(compareRewardBuckets),
  ).root;

// Mirrors the contract: leaf = keccak256(abi.encode(tokenId, epoch, cumulative)), solady MerkleProofLib (sorted pairs).
const verifyProof = (
  proof: readonly string[],
  root: string,
  tokenId: bigint,
  epoch: bigint,
  cumulative: bigint,
) => {
  let node = keccak256(
    AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256', 'uint256'], [tokenId, epoch, cumulative]),
  );
  for (const sibling of proof) {
    node = BigInt(node) < BigInt(sibling) ? keccak256(concat([node, sibling])) : keccak256(concat([sibling, node]));
  }
  return node === root;
};

// Block timestamps in these tests: 12 seconds per block, like mainnet, so events and the RPC stub
// agree and locks can last real days.
const SECONDS_PER_BLOCK = 12;
const timestampOf = (blockNumber: number) => 1_700_000_000 + blockNumber * SECONDS_PER_BLOCK;

// The daily run reads its block timestamp over RPC (getBlockTimestamp). Answer it from timestampOf.
const stubBlockTimestampRpc = () => {
  vi.stubEnv('SEPOLIA_RPC_URL', 'http://rpc.test');
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const [blockHex] = JSON.parse(init.body).params as [string];
    const timestamp = `0x${timestampOf(parseInt(blockHex, 16)).toString(16)}`;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { timestamp } }));
  });
};

const txAt = (blockNumber: number, from: `0x${string}`) => ({
  block: { number: blockNumber, timestamp: timestampOf(blockNumber) },
  transaction: { hash: `0x${blockNumber.toString(16).padStart(64, '0')}`, from },
});

const stakingEvent = (
  event:
    | 'Deposit'
    | 'Withdraw'
    | 'EarlyWithdraw'
    | 'EarlyWithdrawSlashRatesUpdated'
    | 'Reward'
    | 'RewardsClaimed'
    | 'RewardsBurned',
  blockNumber: number,
  params: Record<string, unknown>,
  from: `0x${string}` = RELAYER,
  logIndex?: number,
) =>
  ({
    contract: 'UniswapV4Staking',
    event,
    ...txAt(blockNumber, from),
    ...(logIndex === undefined ? {} : { logIndex }),
    params,
  }) as unknown as ChainSimulate[number];

const deposit = (
  blockNumber: number,
  owner: `0x${string}`,
  tokenId: bigint,
  epoch: bigint,
  {
    lockedUntil = 2_000_000_000n,
    timeBoost = 100n,
    logIndex,
  }: { lockedUntil?: bigint; timeBoost?: bigint; logIndex?: number } = {},
) =>
  stakingEvent('Deposit', blockNumber, { owner, tokenId, epoch, liquidity: 10n ** 18n, lockedUntil, timeBoost }, owner, logIndex);
const earlyWithdraw = (blockNumber: number, owner: `0x${string}`, tokenId: bigint, epoch: bigint) =>
  stakingEvent(
    'EarlyWithdraw',
    blockNumber,
    { owner, tokenId, epoch, liquidity: 10n ** 18n, positionSlash: 10n ** 17n, rewardSlash: REWARD_SLASH },
    owner,
  );
const publishRoot = (blockNumber: number, merkleRoot: string) =>
  stakingEvent('Reward', blockNumber, { from: RELAYER, amount: FULL, merkleRoot });
const claim = (blockNumber: number, tokenId: bigint, epoch: bigint, amount: bigint, logIndex?: number) =>
  stakingEvent('RewardsClaimed', blockNumber, { tokenId, epoch, amount }, RELAYER, logIndex);
const burn = (blockNumber: number, tokenId: bigint, epoch: bigint, amount: bigint, logIndex?: number) =>
  stakingEvent('RewardsBurned', blockNumber, { tokenId, epoch, amount }, RELAYER, logIndex);
const swapToTick = (blockNumber: number, tick: bigint) =>
  ({
    contract: 'UniswapV4PoolManager',
    event: 'Swap',
    ...txAt(blockNumber, RELAYER),
    params: { id: POOL_ID, sender: RELAYER, amount0: 1n, amount1: -1n, sqrtPriceX96: 79228162514264337593543950336n, liquidity: 10n ** 18n, tick, fee: 3000n },
  }) as unknown as ChainSimulate[number];
const nftTransfer = (blockNumber: number, from: `0x${string}`, to: `0x${string}`, id: bigint, logIndex?: number) =>
  ({
    contract: 'UniswapV4PositionManager',
    event: 'Transfer',
    ...txAt(blockNumber, from),
    ...(logIndex === undefined ? {} : { logIndex }),
    params: { from, to, id },
  }) as unknown as ChainSimulate[number];
// A PositionManager liquidity change of NFT `tokenId` (salt = bytes32(tokenId)).
const nftLiquidity = (
  blockNumber: number,
  tokenId: bigint,
  liquidityDelta: bigint,
  range: { tickLower: bigint; tickUpper: bigint },
  logIndex: number,
) =>
  ({
    contract: 'UniswapV4PoolManager',
    event: 'ModifyLiquidity',
    ...txAt(blockNumber, RELAYER),
    logIndex,
    params: {
      id: POOL_ID,
      sender: POSITION_MANAGER_ADDRESS,
      ...range,
      liquidityDelta,
      salt: `0x${tokenId.toString(16).padStart(64, '0')}`,
    },
  }) as unknown as ChainSimulate[number];

type Changes = Awaited<ReturnType<TestIndexer['process']>>['changes'];
const rewardSetsAt = (changes: Changes, block: number) =>
  changes.find((c) => c.block === block)?.UserCumulativeReward?.sets ?? [];

describe('UniswapV4Staking daily reward trees', () => {
  let indexer: TestIndexer;

  // Range and liquidity of each NFT, so the expected splits can value the positions.
  let nfts: Record<string, { range: { tickLower: bigint; tickUpper: bigint }; liquidity: bigint }> = {};
  const setNft = (
    tokenId: bigint,
    owner: `0x${string}`,
    range: { tickLower: bigint; tickUpper: bigint },
    liquidity = 10n ** 18n,
  ) => {
    nfts[tokenId.toString()] = { range, liquidity };
    indexer.UniswapV4PositionToken.set({
      id: `${CHAIN_ID}-${tokenId}`,
      tokenId,
      owner,
      isBurned: false,
      mintedTransactionHash: '',
      wallet_id: wallet(owner),
      position_id: `uni-${tokenId}`,
    });
    indexer.UniswapV4PoolPosition.set({
      id: `uni-${tokenId}`,
      uniqueKey: `uni-${tokenId}`,
      sender: POSITION_MANAGER_ADDRESS,
      chainId: CHAIN_ID,
      ...range,
      liquidityDelta: liquidity,
      salt: '',
      amount0: 0n,
      amount1: 0n,
      transactionHash: '',
      pool_id: UNI_POOL_ENTITY_ID,
    });
  };

  const newIndexer = () => {
    indexer = createTestIndexer();
    nfts = {};
    indexer.UniswapV4Pool.set({
      id: UNI_POOL_ENTITY_ID,
      chainId: CHAIN_ID,
      poolId: POOL_ID,
      currency0: ZERO,
      currency1: BST_ADDRESS,
      fee: 3000n,
      tickSpacing: 60n,
      hooks: ZERO,
      sqrtPriceX96: 79228162514264337593543950336n,
      tick: 0n,
      createdAtTimestamp: 1_699_999_000,
      creationTransaction: `0x${'ee'.repeat(32)}`,
    });
    indexer.StakingPoolV4.set({
      id: STAKING_POOL_ENTITY_ID,
      chainId: CHAIN_ID,
      contractAddress: STAKING_ADDRESS,
      positionManager: POSITION_MANAGER_ADDRESS,
      targetPoolKey: POOL_ID,
      minDays: 7n,
      maxDays: 365n,
      minBoost: 100n,
      maxBoost: 200n,
      earlyPositionSlash: 10n,
      earlyRewardSlash: 50n,
      earlyMinimumPositionSlash: undefined,
      earlyMinimumRewardSlash: undefined,
      totalRewardsAdded: 0n,
      totalRewardsClaimed: 0n,
      totalRewardsBurned: 0n,
      lastAccrualTimestamp: 0,
      carryOverReward: 0n,
      createdAtTimestamp: 1_699_999_000,
      creationTransaction: `0x${'bb'.repeat(32)}`,
      uniswapV4Pool_id: UNI_POOL_ENTITY_ID,
    });
    setNft(42n, ALICE, WIDE_RANGE);
    setNft(43n, BOB, NARROW_RANGE);
    setNft(44n, CAROL, WIDE_RANGE);
  };

  const run = async (endBlock: number, ...events: ChainSimulate) =>
    (await indexer.process({ chains: { [CHAIN_ID]: { endBlock, simulate: events } } })).changes;

  // Reward records keyed by `${tokenId}:${epoch}`.
  const rewards = async () =>
    new Map((await indexer.UserCumulativeReward.getAll()).map((r) => [bucketKey(r), r]));

  // A daily run's tree: one leaf per (tokenId, epoch) with a nonzero total, every proof valid against the root.
  const expectTree = (
    t: { expect: typeof import('vitest').expect },
    changes: Changes,
    day: number,
    expected: Record<string, bigint>,
  ) => {
    const root = rootOf(expected);
    const sets = rewardSetsAt(changes, dayBlock(day));
    t.expect(Object.fromEntries(sets.map((r) => [bucketKey(r), r.cumulativeReward]))).toEqual(expected);
    t.expect(new Set(sets.map(bucketKey)).size).toBe(sets.length);
    for (const r of sets) {
      t.expect(r.id).toBe(rewardId(r.tokenId, r.epoch));
      t.expect(r.merkleRoot).toBe(root);
      t.expect(r.updatedAtTimestamp).toBe(0);
      t.expect(verifyProof(r.proof, root, r.tokenId, r.epoch, r.cumulativeReward)).toBe(true);
    }
  };

  beforeEach(() => {
    stubBlockTimestampRpc();
    newIndexer();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // A position's value in ETH while in range at the fixture price (sqrtPriceX96 = 2^96, price 1):
  // both token amounts at that price, added up.
  const valueOf = (tokenId: string) => {
    const { range, liquidity } = nfts[tokenId]!;
    const sqrtPrice = 2n ** 96n;
    return (
      getAmount0(range.tickLower, range.tickUpper, 0n, liquidity, sqrtPrice) +
      getAmount1(range.tickLower, range.tickUpper, 0n, liquidity, sqrtPrice)
    );
  };
  // Expected split of a day's pool, mirroring the daily run: a bucket's weight is its value ×
  // seconds in range, boosted for its seconds before lockedUntil.
  const inRange = (key: string, blocks: number, { lockedBlocks = blocks, boost = 100n } = {}) => {
    const value = valueOf(key.split(':')[0]!);
    return {
      weight:
        (value *
          (BigInt(lockedBlocks * SECONDS_PER_BLOCK) * boost + BigInt((blocks - lockedBlocks) * SECONDS_PER_BLOCK) * 100n)) /
        100n,
      base: value * BigInt(blocks * SECONDS_PER_BLOCK),
    };
  };
  const split = (buckets: Record<string, { weight: bigint; base: bigint }>) => {
    const total = Object.values(buckets).reduce((sum, b) => sum + b.weight, 0n);
    return Object.fromEntries(
      Object.entries(buckets).map(([key, b]) => {
        const share = (FULL * b.weight) / total;
        return [key, { share, base: (share * b.base) / b.weight }];
      }),
    ) as Record<string, { share: bigint; base: bigint }>;
  };
  // Shares at 1x, by blocks in range during the day.
  const shares = (blocksInRange: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(split(Object.fromEntries(Object.entries(blocksInRange).map(([k, b]) => [k, inRange(k, b)])))).map(
        ([k, v]) => [k, v.share],
      ),
    ) as Record<string, bigint>;
  const addDay = (totals: Record<string, bigint>, day: Record<string, bigint>) => {
    const out = { ...totals };
    for (const [key, share] of Object.entries(day)) out[key] = (out[key] ?? 0n) + share;
    return out;
  };
  const sum = (totals: Record<string, bigint>) => Object.values(totals).reduce((a, b) => a + b, 0n);
  const D = DAY_BLOCKS;

  it('keeps every reward bucket claimable across out-of-range days, withdrawals and resales', async (t) => {
    const s1 = shares({ '42:1': 30, '43:1': 30, '44:1': 30 });
    // Day 2: #43 leaves the range 20 blocks in and earns only for those 20 blocks.
    const s2 = shares({ '42:1': D, '43:1': 20, '44:1': D });
    // Day 3: #42 exits 20 blocks in, #44 21 blocks in; #43 is back in range from block 23.
    const s3 = shares({ '42:1': 20, '43:1': D - 23, '44:1': 21 });
    // Day 4: Dave's re-stake of #44 (epoch 2) earns from block 20; Carol's epoch 1 is carried.
    const s4 = shares({ '43:1': D, '44:2': D - 20 });
    const day1 = s1;
    const day2 = addDay(day1, s2);
    const day3 = addDay(day2, s3);
    const day4 = addDay(day3, s4);
    const [r1, r2, r3, r4] = [day1, day2, day3, day4].map(rootOf);

    const changes = await run(
      dayBlock(4) + 20,
      // Step 1: all three staked (epoch 1) together and in range for day 1.
      deposit(dayBlock(1) - 30, ALICE, 42n, 1n, { logIndex: 1 }),
      deposit(dayBlock(1) - 30, BOB, 43n, 1n, { logIndex: 2 }),
      deposit(dayBlock(1) - 30, CAROL, 44n, 1n, { logIndex: 3 }),
      // Step 2: publish R1; Carol claims #44 through a relayer.
      publishRoot(dayBlock(1) + 10, r1!),
      claim(dayBlock(1) + 11, 44n, 1n, s1['44:1']!),
      // Step 3: #43 goes out of range.
      swapToTick(dayBlock(1) + 20, OUT_OF_NARROW_RANGE_TICK),
      // Step 4: publish R2; Bob claims his day 1 rewards.
      publishRoot(dayBlock(2) + 10, r2!),
      claim(dayBlock(2) + 11, 43n, 1n, s1['43:1']!),
      // Step 5: Alice early-withdraws #42 unclaimed; Carol withdraws #44 and sells it to Dave; #43 back in range.
      earlyWithdraw(dayBlock(2) + 20, ALICE, 42n, 1n),
      stakingEvent('Withdraw', dayBlock(2) + 21, { owner: CAROL, tokenId: 44n, liquidity: 10n ** 18n }, CAROL),
      nftTransfer(dayBlock(2) + 22, CAROL, DAVE, 44n),
      swapToTick(dayBlock(2) + 23, 0n),
      // Step 6: publish R3; Alice claims #42 after withdrawing.
      publishRoot(dayBlock(3) + 10, r3!),
      claim(dayBlock(3) + 11, 42n, 1n, day3['42:1']!),
      // Step 7: Dave stakes #44, starting epoch 2.
      deposit(dayBlock(3) + 20, DAVE, 44n, 2n),
      // Step 8: publish R4.
      publishRoot(dayBlock(4) + 10, r4!),
      // Step 9: Dave claims both #44 buckets in one claimRewardsBatch tx.
      claim(dayBlock(4) + 20, 44n, 1n, day4['44:1']! - s1['44:1']!, 1),
      claim(dayBlock(4) + 20, 44n, 2n, day4['44:2']!, 2),
    );

    expectTree(t, changes, 1, day1);
    expectTree(t, changes, 2, day2); // #43 earned only while in range
    expectTree(t, changes, 3, day3); // withdrawn #42 and resold #44 earned until they left
    expectTree(t, changes, 4, day4); // Dave's epoch 2 earns; Carol's epoch 1 carried

    // Step 4: Bob's leaf was distributed under R2 with a valid proof.
    const bobAtR2 = rewardSetsAt(changes, dayBlock(2) + 10).find((r) => bucketKey(r) === '43:1')!;
    t.expect(bobAtR2.isRewardsDistributed).toBe(true);
    t.expect(bobAtR2.lastDistributedMerkleRoot).toBe(r2);
    t.expect(verifyProof(bobAtR2.lastDistributedProof, r2!, 43n, 1n, day2['43:1']!)).toBe(true);

    // Step 6: Alice's withdrawn #42 was distributed under R3 with its full total.
    const aliceAtR3 = rewardSetsAt(changes, dayBlock(3) + 10).find((r) => bucketKey(r) === '42:1')!;
    t.expect(aliceAtR3.lastDistributedCumulativeReward).toBe(day3['42:1']);
    t.expect(verifyProof(aliceAtR3.lastDistributedProof, r3!, 42n, 1n, day3['42:1']!)).toBe(true);

    // Claims land on the (tokenId, epoch) record and name the staker or holder, not the relayer.
    const claims = (await indexer.StakingPoolV4PositionRecord.getAll())
      .filter((r) => r.transactionType === 'REWARDS_CLAIMED')
      .map((r) => [bucketKey(r), r.wallet_id, r.stakingPosition_id])
      .sort();
    t.expect(claims).toEqual([
      ['42:1', wallet(ALICE), `${CHAIN_ID}-${ALICE}-42`],
      ['43:1', wallet(BOB), `${CHAIN_ID}-${BOB}-43`],
      ['44:1', wallet(CAROL), `${CHAIN_ID}-${CAROL}-44`],
      ['44:1', wallet(DAVE), `${CHAIN_ID}-${DAVE}-44`],
      ['44:2', wallet(DAVE), `${CHAIN_ID}-${DAVE}-44`],
    ]);

    // Everything is distributed under R4; pending = cumulative − claimed per bucket.
    const final = await rewards();
    t.expect([...final.keys()].sort()).toEqual(['42:1', '43:1', '44:1', '44:2']);
    t.expect([...final.values()].every((r) => r.isRewardsDistributed && r.lastDistributedMerkleRoot === r4)).toBe(true);
    const pending = (key: string) => final.get(key)!.lastDistributedCumulativeReward - final.get(key)!.claimed;
    t.expect(final.get('44:1')!.wallet_id).toBe(wallet(DAVE));
    t.expect(final.get('44:2')!.wallet_id).toBe(wallet(DAVE));
    t.expect(final.get('44:1')!.claimed).toBe(day4['44:1']); // Carol's claim + Dave's batch claim
    t.expect(pending('44:1')).toBe(0n);
    t.expect(pending('44:2')).toBe(0n);
    t.expect(pending('43:1')).toBe(day4['43:1']! - s1['43:1']!);
    t.expect(pending('42:1')).toBe(0n);
    // Only the early-exited epoch stores a reward slash.
    t.expect(Object.fromEntries([...final].map(([key, r]) => [key, r.rewardSlash]))).toEqual({
      '42:1': REWARD_SLASH,
      '43:1': 0n,
      '44:1': 0n,
      '44:2': 0n,
    });

    // Conservation: four daily pools, minus at most one wei of dust per earner per run.
    const total = [...final.values()].reduce((acc, r) => acc + r.cumulativeReward, 0n);
    t.expect(total <= 4n * FULL).toBe(true);
    t.expect(4n * FULL - total <= 3n + 3n + 3n + 2n).toBe(true);

    // One reward tree per daily run, each marked published by its Reward event.
    const trees = (await indexer.StakingPoolV4RewardTree.getAll()).sort((a, b) => a.blockNumber - b.blockNumber);
    t.expect(trees.map((tree) => tree.merkleRoot)).toEqual([r1, r2, r3, r4]);
    t.expect(trees.map((tree) => tree.blockNumber)).toEqual([1, 2, 3, 4].map(dayBlock));
    // leafCount counts buckets, not NFTs: #44 has two on day 4.
    t.expect(trees.map((tree) => tree.leafCount)).toEqual([3, 3, 3, 4]);
    t.expect(trees.map((tree) => tree.totalCumulativeReward)).toEqual([day1, day2, day3, day4].map(sum));
    t.expect(trees.map((tree) => tree.dailyReward)).toEqual([s1, s2, s3, s4].map(sum));
    t.expect(trees.every((tree) => tree.isPublished && tree.publishedAmount === FULL)).toBe(true);
    t.expect(trees.map((tree) => tree.publishedTransactionHash)).toEqual(
      [1, 2, 3, 4].map((day) => `0x${(dayBlock(day) + 10).toString(16).padStart(64, '0')}`),
    );
  });

  it('a swap into range around the daily run earns almost nothing', async (t) => {
    // Bob's narrow range is out of range all of day 2 except one block on each side of the run's
    // previous and current block: the price is moved into his range right before the run.
    const s1 = shares({ '42:1': 10, '43:1': 10 });
    const s2 = shares({ '42:1': D, '43:1': 2 });
    const changes = await run(
      dayBlock(2),
      deposit(dayBlock(1) - 10, ALICE, 42n, 1n, { logIndex: 1 }),
      deposit(dayBlock(1) - 10, BOB, 43n, 1n, { logIndex: 2 }),
      swapToTick(dayBlock(1) + 1, OUT_OF_NARROW_RANGE_TICK),
      swapToTick(dayBlock(2) - 1, 0n),
    );

    expectTree(t, changes, 2, { '42:1': s1['42:1']! + s2['42:1']!, '43:1': s1['43:1']! + s2['43:1']! });
    // A one-block snapshot would have given Bob half of the day. Two blocks in range earn him
    // two blocks' worth.
    t.expect(s2['43:1']! < FULL / 1000n).toBe(true);
  });

  it('equal capital earns equally whatever the range width, and only while in range', async (t) => {
    // #43 spans one tick spacing each side of the price; #45 is full range. Give #45 the
    // liquidity that makes it worth the same as #43. By raw liquidity #45 has under 1% of #43's,
    // so #43 would take almost the whole pool.
    const valueOfL = (range: typeof FULL_RANGE, liquidity: bigint) =>
      getAmount0(range.tickLower, range.tickUpper, 0n, liquidity, 2n ** 96n) +
      getAmount1(range.tickLower, range.tickUpper, 0n, liquidity, 2n ** 96n);
    const L45 = (10n ** 18n * valueOfL(NARROW_RANGE, 10n ** 18n)) / valueOfL(FULL_RANGE, 10n ** 18n);
    setNft(45n, DAVE, FULL_RANGE, L45);
    t.expect(L45 * 100n < 10n ** 18n).toBe(true);

    const changes = await run(
      dayBlock(3),
      deposit(dayBlock(1) - 10, BOB, 43n, 1n, { logIndex: 1 }),
      deposit(dayBlock(1) - 10, DAVE, 45n, 1n, { logIndex: 2 }),
      // Halfway through day 3 the price leaves #43's range; full range #45 stays in.
      swapToTick(dayBlock(2) + D / 2, OUT_OF_NARROW_RANGE_TICK),
    );

    const s1 = shares({ '43:1': 10, '45:1': 10 });
    const s2 = shares({ '43:1': D, '45:1': D });
    const s3 = shares({ '43:1': D / 2, '45:1': D });
    const day2 = addDay(s1, s2);
    expectTree(t, changes, 2, day2);
    expectTree(t, changes, 3, addDay(day2, s3));

    // Equal capital in range all day: equal shares, up to rounding of the two values.
    const close = (a: bigint, b: bigint) => (a > b ? a - b : b - a) < FULL / 1_000_000_000n;
    t.expect(close(s2['43:1']!, s2['45:1']!)).toBe(true);
    // Half the day in range earns half as much.
    t.expect(close(2n * s3['43:1']!, s3['45:1']!)).toBe(true);
  });

  // Early exit, then re-stake: the old penalty must not touch the new deposit.
  const earlyExitAndRestake = () => [
    deposit(dayBlock(1) - 10, ALICE, 42n, 1n),
    earlyWithdraw(dayBlock(1) + 10, ALICE, 42n, 1n),
    deposit(dayBlock(1) + 20, ALICE, 42n, 2n),
  ];
  // Epoch 1 earns alone on day 1 and for 10 more blocks on day 2; epoch 2 from block 20.
  const restakeDay2 = () => {
    const s2 = shares({ '42:1': 10, '42:2': D - 20 });
    return { '42:1': FULL + s2['42:1']!, '42:2': s2['42:2']! };
  };

  it('an early exit and re-stake keeps the old epoch as its own leaf next to the new one', async (t) => {
    const changes = await run(dayBlock(2), ...earlyExitAndRestake());

    expectTree(t, changes, 1, { '42:1': FULL });
    expectTree(t, changes, 2, restakeDay2());

    const final = await rewards();
    t.expect(final.get('42:1')!.rewardSlash).toBe(REWARD_SLASH);
    t.expect(final.get('42:2')!.rewardSlash).toBe(0n);
    t.expect(final.get('42:2')!.wallet_id).toBe(wallet(ALICE));

    const position = await indexer.StakingPoolV4Position.getOrThrow(`${CHAIN_ID}-${ALICE}-42`);
    t.expect(position.epoch).toBe(2n);
    t.expect(position.isPositionClosed).toBe(false);

    const history = (await indexer.StakingPoolV4PositionRecord.getAll())
      .map((r) => [r.transactionType, r.epoch])
      .sort();
    t.expect(history).toEqual([
      ['DEPOSIT', 1n],
      ['DEPOSIT', 2n],
      ['EARLY_WITHDRAW', 1n],
    ]);
  });

  it('a deposit that exits before the daily run still earns for its time in range', async (t) => {
    const changes = await run(
      dayBlock(1),
      deposit(dayBlock(1) - 30, ALICE, 42n, 1n),
      earlyWithdraw(dayBlock(1) - 20, ALICE, 42n, 1n),
      deposit(dayBlock(1) - 10, ALICE, 42n, 2n),
    );

    // Epoch 1 was in range 10 blocks before it left, epoch 2 the last 10 blocks.
    expectTree(t, changes, 1, shares({ '42:1': 10, '42:2': 10 }));
  });

  it('claims and burns update only the epoch they name', async (t) => {
    await run(
      dayBlock(2) + 11,
      ...earlyExitAndRestake(),
      publishRoot(dayBlock(2) + 10, rootOf(restakeDay2())),
      // claimRewards(42, 1): the stored 17.5% slash burns part of the epoch-1 bucket.
      claim(dayBlock(2) + 11, 42n, 1n, 80n, 1),
      burn(dayBlock(2) + 11, 42n, 1n, 20n, 2),
    );

    const final = await rewards();
    t.expect([final.get('42:1')!.claimed, final.get('42:1')!.burned]).toEqual([80n, 20n]);
    t.expect([final.get('42:2')!.claimed, final.get('42:2')!.burned]).toEqual([0n, 0n]);

    const pool = await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID);
    t.expect([pool.totalRewardsClaimed, pool.totalRewardsBurned]).toEqual([80n, 20n]);
  });

  it('a batch claim updates every epoch it names', async (t) => {
    await run(
      dayBlock(2) + 11,
      ...earlyExitAndRestake(),
      publishRoot(dayBlock(2) + 10, rootOf(restakeDay2())),
      // claimRewardsBatch(42, [1, 2], ...): one tx, one event per bucket.
      claim(dayBlock(2) + 11, 42n, 1n, 70n, 1),
      burn(dayBlock(2) + 11, 42n, 1n, 15n, 2),
      claim(dayBlock(2) + 11, 42n, 2n, 90n, 3),
    );

    const final = await rewards();
    t.expect([final.get('42:1')!.claimed, final.get('42:1')!.burned]).toEqual([70n, 15n]);
    t.expect([final.get('42:2')!.claimed, final.get('42:2')!.burned]).toEqual([90n, 0n]);
    const history = (await indexer.StakingPoolV4PositionRecord.getAll()).filter((r) =>
      ['REWARDS_CLAIMED', 'REWARDS_BURNED'].includes(r.transactionType),
    );
    t.expect(history).toHaveLength(3);
  });

  it('applies the time boost only while locked, holding the bonus back until the lock ends', async (t) => {
    // Both lock at 2x. Alice stays locked; Carol's lock ends halfway through day 2, after which
    // the contract lets her leave without a slash, so she earns 1x for the rest of the day.
    const BOOST = 200n;
    const s1 = split({ '42:1': inRange('42:1', 20, { boost: BOOST }), '44:1': inRange('44:1', 20, { boost: BOOST }) });
    const s2 = split({
      '42:1': inRange('42:1', D, { boost: BOOST }),
      '44:1': inRange('44:1', D, { lockedBlocks: D / 2, boost: BOOST }),
    });
    const bonus = (s: { share: bigint; base: bigint }) => s.share - s.base;
    const changes = await run(
      dayBlock(2),
      deposit(dayBlock(1) - 20, ALICE, 42n, 1n, { timeBoost: BOOST, lockedUntil: 1_900_000_000n, logIndex: 1 }),
      deposit(dayBlock(1) - 20, CAROL, 44n, 1n, {
        timeBoost: BOOST,
        lockedUntil: BigInt(timestampOf(dayBlock(1) + D / 2)),
        logIndex: 2,
      }),
    );

    // Day 1: both locked at 2x and split the pool, but only the 1x base goes into the leaves.
    t.expect(s1['42:1']!.share).toBe(HALF);
    expectTree(t, changes, 1, { '42:1': s1['42:1']!.base, '44:1': s1['44:1']!.base });
    const day1 = new Map(rewardSetsAt(changes, dayBlock(1)).map((r) => [bucketKey(r), r]));
    t.expect(day1.get('42:1')!.pendingBoostReward).toBe(bonus(s1['42:1']!));
    t.expect(day1.get('44:1')!.pendingBoostReward).toBe(bonus(s1['44:1']!));

    // Day 2: Alice is still locked and keeps holding bonus. Carol earned 2x until her lock ended,
    // then 1x; her lock is over at the run, so all her held bonus is released into her leaf.
    t.expect(s2['44:1']!.share < s2['42:1']!.share).toBe(true);
    expectTree(t, changes, 2, {
      '42:1': s1['42:1']!.base + s2['42:1']!.base,
      '44:1': s1['44:1']!.share + s2['44:1']!.share,
    });
    const final = await rewards();
    t.expect(final.get('42:1')!.pendingBoostReward).toBe(bonus(s1['42:1']!) + bonus(s2['42:1']!));
    t.expect(final.get('44:1')!.pendingBoostReward).toBe(0n);

    const [day1Tree, day2Tree] = (await indexer.StakingPoolV4RewardTree.getAll()).sort((a, b) => a.blockNumber - b.blockNumber);
    t.expect(day1Tree?.dailyReward).toBe(s1['42:1']!.share + s1['44:1']!.share);
    t.expect(day1Tree?.totalPendingBoostReward).toBe(bonus(s1['42:1']!) + bonus(s1['44:1']!));
    t.expect(day2Tree?.dailyReward).toBe(s2['42:1']!.share + s2['44:1']!.share);
    t.expect(day2Tree?.totalPendingBoostReward).toBe(final.get('42:1')!.pendingBoostReward);
    // The operator funds only what is in the leaves.
    t.expect(day2Tree?.totalCumulativeReward).toBe(
      final.get('42:1')!.cumulativeReward + final.get('44:1')!.cumulativeReward,
    );
  });

  it('an early exit keeps only the boost bonus the days served earned', async (t) => {
    // A short-lock pool so the test can serve real days: lock 1–3 days, boost 1x–3x.
    const pool = await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID);
    indexer.StakingPoolV4.set({ ...pool, minDays: 1n, maxDays: 3n, minBoost: 100n, maxBoost: 300n });
    const DAY = 86_400 / SECONDS_PER_BLOCK;
    const depositBlock = dayBlock(1) - 10;
    // Alice declares 3 days (3x) and leaves after 2. An honest 2-day lock earns getBoost(2) = 2x,
    // so she keeps half of her bonus: (200 − 100) / (300 − 100).
    const exitBlock = depositBlock + 2 * DAY;
    const changes = await run(
      dayBlock(4),
      deposit(depositBlock, ALICE, 42n, 1n, { timeBoost: 300n, lockedUntil: BigInt(timestampOf(depositBlock + 3 * DAY)) }),
      earlyWithdraw(exitBlock, ALICE, 42n, 1n),
    );

    // Days 1–3: Alice earns the whole pool at 3x; a third goes into the leaf, the rest is held.
    expectTree(t, changes, 1, { '42:1': THIRD });
    expectTree(t, changes, 3, { '42:1': 3n * THIRD });
    const held = 3n * (FULL - THIRD);
    const kept = held / 2n;

    const atExit = rewardSetsAt(changes, exitBlock).find((r) => bucketKey(r) === '42:1')!;
    t.expect(atExit.cumulativeReward).toBe(3n * THIRD); // unchanged until the next tree
    t.expect(atExit.pendingBoostReward).toBe(kept);
    t.expect(atExit.forfeitedBoostReward).toBe(held - kept);
    t.expect(atExit.rewardSlash).toBe(REWARD_SLASH);
    // The part of day 4 before the exit is prorated too: 3x cut to 2x.
    t.expect(atExit.accruedWeight).toBe(2n * atExit.accruedBaseWeight);
    // The forfeited bonus goes back into the next daily pool.
    const forfeited = held - kept;
    const poolAtExit = changes.find((c) => c.block === exitBlock)?.StakingPoolV4?.sets?.at(-1);
    t.expect(poolAtExit?.carryOverReward).toBe(forfeited);

    // Day 4: the pool is the day's emission plus the forfeited bonus. Alice is its only earner (her
    // last blocks, at 2x), so it comes back to her; everything she kept is released because she is
    // no longer staked.
    expectTree(t, changes, 4, { '42:1': 3n * THIRD + FULL + forfeited + kept });
    const alice = (await rewards()).get('42:1')!;
    t.expect(alice.pendingBoostReward).toBe(0n);
    t.expect(alice.forfeitedBoostReward).toBe(forfeited);
    const day4Tree = (await indexer.StakingPoolV4RewardTree.getAll()).find((tree) => tree.blockNumber === dayBlock(4));
    t.expect(day4Tree?.dailyReward).toBe(FULL + forfeited);
    t.expect(day4Tree?.totalCumulativeReward).toBe(3n * THIRD + FULL + forfeited + kept);
    t.expect(day4Tree?.totalPendingBoostReward).toBe(0n);
    t.expect((await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID)).carryOverReward).toBe(0n);
  });

  it('pays the bonus forfeited by an early exit to the other stakers, so the whole emission is paid', async (t) => {
    // Short-lock pool: lock 1–3 days, boost 1x–3x. Alice locks 3 days at 3x and leaves after 2;
    // Carol stakes the same capital at 1x and stays.
    const pool = await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID);
    indexer.StakingPoolV4.set({ ...pool, minDays: 1n, maxDays: 3n, minBoost: 100n, maxBoost: 300n });
    const DAY = 86_400 / SECONDS_PER_BLOCK;
    const depositBlock = dayBlock(1) - 10;
    const exitBlock = depositBlock + 2 * DAY; // during day 4
    const changes = await run(
      dayBlock(5),
      deposit(depositBlock, ALICE, 42n, 1n, {
        timeBoost: 300n,
        lockedUntil: BigInt(timestampOf(depositBlock + 3 * DAY)),
        logIndex: 1,
      }),
      deposit(depositBlock, CAROL, 44n, 1n, { logIndex: 2 }),
      earlyWithdraw(exitBlock, ALICE, 42n, 1n),
    );

    const forfeited = (await rewards()).get('42:1')!.forfeitedBoostReward;
    t.expect(forfeited > 0n).toBe(true);
    const trees = (await indexer.StakingPoolV4RewardTree.getAll()).sort((a, b) => a.blockNumber - b.blockNumber);
    t.expect(trees).toHaveLength(5);
    // Day 4's pool is the emission plus what Alice forfeited (minus rounding dust), split by weight.
    const day4Pool = FULL + forfeited;
    t.expect(day4Pool - trees[3]!.dailyReward <= 2n).toBe(true);
    // Day 5 is back to the plain emission: the carry-over was used once.
    t.expect(FULL - trees[4]!.dailyReward <= 2n).toBe(true);
    t.expect((await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID)).carryOverReward).toBe(0n);
    // Everything emitted over the five days is in a leaf or still held for a locked deposit.
    const last = trees[4]!;
    const paid = last.totalCumulativeReward + last.totalPendingBoostReward;
    t.expect(5n * FULL - paid >= 0n && 5n * FULL - paid <= 10n).toBe(true);
    t.expect(rewardSetsAt(changes, dayBlock(5)).length).toBe(2);
  });

  it('a dust NFT minted in the same transaction as a large one earns only for its own liquidity', async (t) => {
    // One multicall mints #50 with dust liquidity and #51 with a lot, both wide range. Alice stakes
    // #50 next to Carol's #44 (1e18). #51 is never staked.
    const DUST = 1_000n;
    nfts['50'] = { range: WIDE_RANGE, liquidity: DUST };
    const mintBlock = dayBlock(1) - 30;
    const expected = shares({ '50:1': 20, '44:1': 20 });
    const changes = await run(
      dayBlock(1),
      nftTransfer(mintBlock, ZERO, ALICE, 50n, 1),
      nftLiquidity(mintBlock, 50n, DUST, WIDE_RANGE, 2),
      nftTransfer(mintBlock, ZERO, ALICE, 51n, 3),
      nftLiquidity(mintBlock, 51n, 10n ** 21n, WIDE_RANGE, 4),
      deposit(dayBlock(1) - 20, ALICE, 50n, 1n, { logIndex: 1 }),
      deposit(dayBlock(1) - 20, CAROL, 44n, 1n, { logIndex: 2 }),
    );

    expectTree(t, changes, 1, expected);
    t.expect(expected['50:1']! < FULL / 10n ** 12n).toBe(true);
  });

  it('releases a held bonus on a day nobody is in range', async (t) => {
    // Bob locks at 2x, earns on day 1, then sits out of range. His lock ends during day 2, when
    // nobody earns. The day 2 run must still build a tree, or his bonus waits for another earner.
    const BOOST = 200n;
    const s1 = split({ '43:1': inRange('43:1', 10, { boost: BOOST }) });
    const changes = await run(
      dayBlock(3),
      deposit(dayBlock(1) - 20, BOB, 43n, 1n, {
        timeBoost: BOOST,
        lockedUntil: BigInt(timestampOf(dayBlock(1) + D / 2)),
      }),
      swapToTick(dayBlock(1) - 10, OUT_OF_NARROW_RANGE_TICK),
    );

    // Day 1: Bob earned the whole pool at 2x; only the 1x base is in his leaf.
    expectTree(t, changes, 1, { '43:1': s1['43:1']!.base });
    // Day 2: no earner, but the lock is over, so the held bonus moves into the leaf.
    expectTree(t, changes, 2, { '43:1': FULL });
    const day2Tree = (await indexer.StakingPoolV4RewardTree.getAll()).find((tree) => tree.blockNumber === dayBlock(2));
    t.expect(day2Tree?.dailyReward).toBe(0n);
    t.expect(day2Tree?.totalPendingBoostReward).toBe(0n);
    // Day 3: nothing earned and nothing left to release, so no new tree.
    t.expect(rewardSetsAt(changes, dayBlock(3))).toHaveLength(0);
    t.expect(await indexer.StakingPoolV4RewardTree.getAll()).toHaveLength(2);
  });

  it('fails the daily run instead of guessing when the block timestamp cannot be read', async (t) => {
    vi.unstubAllEnvs();
    vi.stubEnv('SEPOLIA_RPC_URL', '');
    await t.expect(run(dayBlock(1), deposit(dayBlock(1) - 10, ALICE, 42n, 1n))).rejects.toThrow();
    t.expect(await indexer.StakingPoolV4RewardTree.getAll()).toHaveLength(0);
  });

  it('retries the block timestamp read after a transient RPC error', async (t) => {
    const answer = globalThis.fetch;
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) =>
      ++calls === 1 ? new Response('busy', { status: 503 }) : answer(url, init as RequestInit),
    );
    await run(dayBlock(1), deposit(dayBlock(1) - 10, ALICE, 42n, 1n));
    t.expect(calls).toBeGreaterThan(1);
    t.expect(await indexer.StakingPoolV4RewardTree.getAll()).toHaveLength(1);
  });

  it('does not produce a new root when no staked position was in range since the last run', async (t) => {
    // Bob is alone and leaves the range 20 blocks into day 2, so day 3 has no earner.
    const r1 = rootOf({ '43:1': FULL });
    const r2 = rootOf({ '43:1': 2n * FULL });
    const changes = await run(
      dayBlock(3),
      deposit(dayBlock(1) - 10, BOB, 43n, 1n),
      publishRoot(dayBlock(1) + 10, r1),
      swapToTick(dayBlock(1) + 20, OUT_OF_NARROW_RANGE_TICK),
      publishRoot(dayBlock(2) + 10, r2),
    );

    t.expect(rewardSetsAt(changes, dayBlock(3))).toHaveLength(0);
    t.expect((await indexer.StakingPoolV4RewardTree.getAll()).map((tree) => tree.merkleRoot).sort()).toEqual([r1, r2].sort());
    const record = (await rewards()).get('43:1')!;
    t.expect(record.cumulativeReward).toBe(2n * FULL);
    t.expect(record.merkleRoot).toBe(r2);
    t.expect(record.isRewardsDistributed).toBe(true);
  });

  it('burns update the (tokenId, epoch) record even when sent by an unrelated address', async (t) => {
    await run(
      dayBlock(1) + 1,
      deposit(dayBlock(1) - 10, ALICE, 42n, 1n),
      burn(dayBlock(1) + 1, 42n, 1n, 5n),
    );

    const records = await indexer.UserCumulativeReward.getAll();
    t.expect(records.map((r) => [r.id, r.burned])).toEqual([[rewardId(42n, 1n), 5n]]);
    const history = (await indexer.StakingPoolV4PositionRecord.getAll()).find((r) => r.transactionType === 'REWARDS_BURNED');
    t.expect(history?.wallet_id).toBe(wallet(ALICE));
    t.expect(history?.stakingPosition_id).toBe(`${CHAIN_ID}-${ALICE}-42`);
    t.expect(history?.epoch).toBe(1n);

    // The day 1 tree was never published.
    const [tree] = await indexer.StakingPoolV4RewardTree.getAll();
    t.expect(tree?.isPublished).toBe(false);
    t.expect(tree?.publishedAmount).toBeUndefined();
  });

  it('a resold, unstaked NFT is claimed by its new holder', async (t) => {
    await run(
      dayBlock(1) + 13,
      deposit(dayBlock(1) - 10, CAROL, 44n, 1n),
      publishRoot(dayBlock(1) + 10, rootOf({ '44:1': FULL })),
      stakingEvent('Withdraw', dayBlock(1) + 11, { owner: CAROL, tokenId: 44n, liquidity: 10n ** 18n }, CAROL),
      nftTransfer(dayBlock(1) + 12, CAROL, DAVE, 44n),
      claim(dayBlock(1) + 13, 44n, 1n, FULL),
    );

    const record = (await rewards()).get('44:1')!;
    t.expect(record.wallet_id).toBe(wallet(DAVE));
    t.expect(record.claimed).toBe(FULL);
    const history = (await indexer.StakingPoolV4PositionRecord.getAll()).find((r) => r.transactionType === 'REWARDS_CLAIMED');
    t.expect(history?.wallet_id).toBe(wallet(DAVE));
    // Dave never staked #44: the claim links to Carol's position, which earned the rewards.
    t.expect(history?.stakingPosition_id).toBe(`${CHAIN_ID}-${CAROL}-44`);
  });

  it('a claim inside withdraw stays with the staker, not the staking contract holding the NFT', async (t) => {
    const exit = dayBlock(1) + 11;
    await run(
      dayBlock(2),
      // The contract holds the NFT while it is staked.
      nftTransfer(dayBlock(1) - 11, CAROL, STAKING_ADDRESS, 44n),
      deposit(dayBlock(1) - 10, CAROL, 44n, 1n),
      publishRoot(dayBlock(1) + 10, rootOf({ '44:1': FULL })),
      // withdraw(tokenId, cumulative, proof): Withdraw, then the claim, then the NFT goes back.
      stakingEvent('Withdraw', exit, { owner: CAROL, tokenId: 44n, liquidity: 10n ** 18n }, CAROL, 1),
      claim(exit, 44n, 1n, FULL, 2),
      nftTransfer(exit, STAKING_ADDRESS, CAROL, 44n, 3),
    );

    const record = (await rewards()).get('44:1')!;
    t.expect(record.claimed).toBe(FULL);
    t.expect(record.wallet_id).toBe(wallet(CAROL));
    const history = (await indexer.StakingPoolV4PositionRecord.getAll()).find((r) => r.transactionType === 'REWARDS_CLAIMED');
    t.expect(history?.wallet_id).toBe(wallet(CAROL));
  });

  it('publishing a backlog of roots in order marks every record distributed', async (t) => {
    const r1 = rootOf({ '42:1': FULL });
    const r2 = rootOf({ '42:1': 2n * FULL });
    const changes = await run(
      dayBlock(2) + 11,
      deposit(dayBlock(1) - 10, ALICE, 42n, 1n),
      // Both trees are built before the operator publishes either.
      publishRoot(dayBlock(2) + 10, r1),
      publishRoot(dayBlock(2) + 11, r2),
    );

    // Publishing R1 leaves the record, already on R2, pending for R2.
    const afterR1 = rewardSetsAt(changes, dayBlock(2) + 10);
    t.expect(afterR1).toHaveLength(0);
    const record = (await rewards()).get('42:1')!;
    t.expect(record.merkleRoot).toBe(r2);
    t.expect(record.isRewardsDistributed).toBe(true);
    t.expect(record.distributionSkipped).toBe(false);
    t.expect(record.lastDistributedMerkleRoot).toBe(r2);
    t.expect(record.lastDistributedCumulativeReward).toBe(2n * FULL);
  });

  it('EarlyWithdrawSlashRatesUpdated stores the new minimum and maximum slash rates', async (t) => {
    await run(
      dayBlock(1) - 1,
      stakingEvent('EarlyWithdrawSlashRatesUpdated', dayBlock(1) - 1, {
        minimumPositionSlash: 1_000n,
        maximumPositionSlash: 20_000n,
        minimumRewardSlash: 2_000n,
        maximumRewardSlash: 30_000n,
      }),
    );

    const pool = await indexer.StakingPoolV4.getOrThrow(STAKING_POOL_ENTITY_ID);
    t.expect([pool.earlyMinimumPositionSlash, pool.earlyPositionSlash]).toEqual([1_000n, 20_000n]);
    t.expect([pool.earlyMinimumRewardSlash, pool.earlyRewardSlash]).toEqual([2_000n, 30_000n]);
  });

  // History records used to be keyed by (hour, logIndex), and logIndex only counts within one block,
  // so two events of one token in the same hour at the same log index overwrote each other.
  // These blocks all fall in one hour and before the first daily run.
  const HOUR_START = 1_700_002_800; // a UTC hour boundary
  const BASE_BLOCK = dayBlock(1) - 1_000;
  const inSameHour = (event: ChainSimulate[number], blockOffset: number, logIndex: number) =>
    ({
      ...event,
      logIndex,
      block: { number: BASE_BLOCK + blockOffset, timestamp: HOUR_START + blockOffset },
    }) as ChainSimulate[number];
  // History ids end in `-${blockNumber}-${logIndex}`.
  const logIndexOf = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));
  const historyOf = async (tokenId: bigint) =>
    (await indexer.StakingPoolV4PositionRecord.getAll())
      .filter((r) => r.tokenId === tokenId)
      .sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));

  it('keeps two history records for events in the same hour at the same log index', async (t) => {
    await run(
      BASE_BLOCK + 10,
      inSameHour(deposit(0, ALICE, 42n, 1n), 0, 1),
      inSameHour(deposit(0, ALICE, 42n, 2n), 10, 1),
    );

    const history = await historyOf(42n);
    t.expect(history.map((r) => [r.transactionType, r.epoch, r.blockNumber])).toEqual([
      ['DEPOSIT', 1n, BASE_BLOCK],
      ['DEPOSIT', 2n, BASE_BLOCK + 10],
    ]);
    t.expect(history.map((r) => r.id)).toEqual([
      `${STAKING_POOL_ENTITY_ID}-42-${BASE_BLOCK}-1`,
      `${STAKING_POOL_ENTITY_ID}-42-${BASE_BLOCK + 10}-1`,
    ]);
  });

  it('keeps the full history of a deposit, early withdraw, re-deposit and batch claim within one hour', async (t) => {
    // The sequence from the Sepolia-fork run that lost two of seven records.
    await run(
      BASE_BLOCK + 542,
      inSameHour(deposit(0, ALICE, 42n, 1n), 0, 1),
      inSameHour(earlyWithdraw(0, ALICE, 42n, 1n), 311, 2),
      inSameHour(deposit(0, ALICE, 42n, 2n), 313, 1),
      // claimRewardsBatch over epochs 1 and 2: four events in one transaction.
      inSameHour(burn(0, 42n, 1n, 1n), 542, 2),
      inSameHour(claim(0, 42n, 1n, 2n), 542, 3),
      inSameHour(burn(0, 42n, 2n, 3n), 542, 6),
      inSameHour(claim(0, 42n, 2n, 4n), 542, 7),
    );

    const history = await historyOf(42n);
    t.expect(history.map((r) => [r.transactionType, r.epoch, r.blockNumber - BASE_BLOCK])).toEqual([
      ['DEPOSIT', 1n, 0],
      ['EARLY_WITHDRAW', 1n, 311],
      ['DEPOSIT', 2n, 313],
      ['REWARDS_BURNED', 1n, 542],
      ['REWARDS_CLAIMED', 1n, 542],
      ['REWARDS_BURNED', 2n, 542],
      ['REWARDS_CLAIMED', 2n, 542],
    ]);
    t.expect(history.map((r) => [r.rewardsBurned, r.rewardsClaimed])).toEqual([
      [0n, 0n],
      [0n, 0n],
      [0n, 0n],
      [1n, 0n],
      [0n, 2n],
      [3n, 0n],
      [0n, 4n],
    ]);
  });

  it('builds the same root from the same buckets in any insertion order', async (t) => {
    const seeded = { '42:1': THIRD, '43:1': HALF, '44:1': FULL };
    const expected = rootOf({ ...seeded, '42:2': FULL });

    const roots: string[] = [];
    for (const order of [['42:1', '43:1', '44:1'], ['44:1', '42:1', '43:1'], ['43:1', '44:1', '42:1']]) {
      newIndexer();
      for (const key of order) {
        const { tokenId, epoch } = parseBucket(key);
        indexer.UserCumulativeReward.set({
          ...getNewUserCumulativeReward({
            tokenId,
            epoch,
            walletId: wallet(ALICE),
            stakingPoolId: STAKING_POOL_ENTITY_ID,
            uniPositionId: `uni-${tokenId}`,
            blockNumber: 0,
          }),
          cumulativeReward: seeded[key as keyof typeof seeded],
        });
      }
      await run(dayBlock(1), deposit(dayBlock(1) - 10, ALICE, 42n, 2n));
      const [tree] = await indexer.StakingPoolV4RewardTree.getAll();
      roots.push(tree!.merkleRoot);
    }

    t.expect(roots).toEqual([expected, expected, expected]);
  });
});

describe('UniswapV4Staking merkle leaves', () => {
  // Vectors from the contract handoff, generated with `cast`.
  it('matches the contract leaf keccak256(abi.encode(tokenId, epoch, cumulativeRewards))', (t) => {
    const { tree } = buildMerkleTree([
      { tokenId: 7n, epoch: 1n, cumulativeReward: 40n * 10n ** 18n },
      { tokenId: 7n, epoch: 2n, cumulativeReward: 100n * 10n ** 18n },
    ]);
    t.expect(tree.getHexLeaves()).toEqual([
      '0x61d1d84d184b04c60d8d68f0fec7a453a29e7840d0cb29c048e61b7ab48689fd',
      '0xa88ac56f430dd951b4b03e180c84dc6447937423a6d6dbab55279bac1d37a082',
    ]);
  });

  it('a single-leaf tree has the leaf as its root and an empty proof', (t) => {
    const { root, proofs } = buildMerkleTree([{ tokenId: 7n, epoch: 1n, cumulativeReward: 40n * 10n ** 18n }]);
    t.expect(root).toBe('0x61d1d84d184b04c60d8d68f0fec7a453a29e7840d0cb29c048e61b7ab48689fd');
    t.expect(proofs).toEqual([[]]);
  });
});
