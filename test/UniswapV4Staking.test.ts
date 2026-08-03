process.env.ENVIO_NETWORK = 'testnet';

import { describe, it, beforeEach } from 'vitest';
import { createTestIndexer, type TestIndexer, type TestIndexerProcessConfig } from 'envio';
import { AbiCoder, keccak256, ZeroAddress } from 'ethers';
import { CHAIN_ID, addr } from './fixtures';

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
  });

  it('re-depositing the same NFT after withdraw reopens the position with updated terms', async (t) => {
    await runEvents(
      indexer,
      depositEvent({ blockNumber: 100, logIndex: 1 }),
      withdrawEvent({ blockNumber: 101, logIndex: 2 }),
      depositEvent({
        liquidity: 2n * 10n ** 18n,
        lockedUntil: 1_720_000_000n,
        timeBoost: 150n,
        blockNumber: 102,
        logIndex: 3,
      }),
    );

    const position = await indexer.StakingPoolV4Position.getOrThrow(STAKING_POSITION_ID);
    t.expect(position.isPositionClosed).toBe(false);
    t.expect(position.liquidity).toBe(2n * 10n ** 18n);
    t.expect(position.lockedUntil).toBe(1_720_000_000n);
    t.expect(position.timeBoost).toBe(150n);
    t.expect(await indexer.StakingPoolV4Position.getAll()).toHaveLength(1);
    t.expect(await indexer.StakingPoolV4PositionRecord.getAll()).toHaveLength(3);
  });
});
