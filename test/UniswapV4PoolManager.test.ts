process.env.ENVIO_NETWORK = 'testnet';

import { describe, it, beforeEach } from 'vitest';
import { createTestIndexer, type TestIndexer, type TestIndexerProcessConfig } from 'envio';
import { ZeroAddress } from 'ethers';
import { CHAIN_ID, addr } from './fixtures';
import { getAmount0, getAmount1 } from '../src/helper/UniswapV4Helpers/liquidityAmounts';
import { computeV4PoolId } from '../src/helper/UniswapV4Helpers/utils';

type ChainSimulate = NonNullable<
  NonNullable<TestIndexerProcessConfig['chains'][typeof CHAIN_ID]>['simulate']
>;

const ZERO = ZeroAddress as `0x${string}`;
// Testnet BST token from src/config/testnet.ts
const BST_ADDRESS = addr('0x7000Ec7486d8c6f9bd9FfA930f9ACE2D9564d02b');
const OTHER_TOKEN = addr('0x9999999999999999999999999999999999999999');
// A contract calling the PoolManager directly (not the PositionManager).
const SENDER = addr('0x6666666666666666666666666666666666666666');
// Testnet PositionManager from src/config/testnet.ts: its positions are keyed by NFT.
const POSITION_MANAGER = addr('0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4');

// The real ETH/BST 0.3% poolId, derived the same way the chain does.
const POOL_ID = computeV4PoolId(ZeroAddress, BST_ADDRESS, 3000n, 60n, ZeroAddress);
const OTHER_POOL_ID = `0x${'cd'.repeat(32)}`;
const POOL_ENTITY_ID = `${CHAIN_ID}-${POOL_ID}`;

const SQRT_PRICE_1_1 = 79228162514264337593543950336n; // 2^96, price 1:1 at tick 0
const TICK_LOWER = -60n;
const TICK_UPPER = 60n;
const SALT = `0x${'00'.repeat(32)}`;
const LIQUIDITY = 10n ** 18n;
// A direct caller's position: keyed by owner, ticks and salt, like v4 itself.
const POSITION_ID = `${CHAIN_ID}-${POOL_ID}-${SENDER.toLowerCase()}-${TICK_LOWER}-${TICK_UPPER}-${SALT}`;
const saltOf = (tokenId: bigint) => `0x${tokenId.toString(16).padStart(64, '0')}`;

const TX_INIT = `0x${'11'.repeat(32)}`;
const TX_A = `0x${'22'.repeat(32)}`;
const TX_B = `0x${'33'.repeat(32)}`;

const initializeEvent = (
  overrides: {
    poolId?: string;
    currency0?: `0x${string}`;
    currency1?: `0x${string}`;
    logIndex?: number;
    blockNumber?: number;
  } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4PoolManager',
  event: 'Initialize',
  logIndex: overrides.logIndex ?? 1,
  block: { number: overrides.blockNumber ?? 100, timestamp: 1_700_000_000 },
  transaction: { hash: TX_INIT },
  params: {
    id: overrides.poolId ?? POOL_ID,
    currency0: overrides.currency0 ?? ZERO,
    currency1: overrides.currency1 ?? BST_ADDRESS,
    fee: 3000n,
    tickSpacing: 60n,
    hooks: ZERO,
    sqrtPriceX96: SQRT_PRICE_1_1,
    tick: 0n,
  },
});

const modifyLiquidityEvent = (
  txHash: string,
  overrides: {
    poolId?: string;
    liquidityDelta?: bigint;
    logIndex?: number;
    blockNumber?: number;
    sender?: `0x${string}`;
    salt?: string;
    tickLower?: bigint;
    tickUpper?: bigint;
  } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4PoolManager',
  event: 'ModifyLiquidity',
  logIndex: overrides.logIndex ?? 1,
  block: { number: overrides.blockNumber ?? 101, timestamp: 1_700_000_000 },
  transaction: { hash: txHash },
  params: {
    id: overrides.poolId ?? POOL_ID,
    sender: overrides.sender ?? SENDER,
    tickLower: overrides.tickLower ?? TICK_LOWER,
    tickUpper: overrides.tickUpper ?? TICK_UPPER,
    liquidityDelta: overrides.liquidityDelta ?? LIQUIDITY,
    salt: overrides.salt ?? SALT,
  },
});

const swapEvent = (
  tick: bigint,
  sqrtPriceX96: bigint,
  overrides: { logIndex?: number; blockNumber?: number } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4PoolManager',
  event: 'Swap',
  logIndex: overrides.logIndex ?? 1,
  block: { number: overrides.blockNumber ?? 102, timestamp: 1_700_000_100 },
  transaction: { hash: `0x${'44'.repeat(32)}` },
  params: {
    id: POOL_ID,
    sender: SENDER,
    amount0: 100n,
    amount1: -100n,
    sqrtPriceX96,
    liquidity: LIQUIDITY,
    tick,
    fee: 3000n,
  },
});

const runEvents = (indexer: TestIndexer, ...events: ChainSimulate) =>
  indexer.process({ chains: { [CHAIN_ID]: { simulate: events } } });

describe('UniswapV4PoolManager', () => {
  let indexer: TestIndexer;

  beforeEach(() => {
    indexer = createTestIndexer();
  });

  it('indexes only the ETH/BST pool', async (t) => {
    await runEvents(
      indexer,
      // ETH/BST -> indexed
      initializeEvent({ logIndex: 1 }),
      // BST as currency1 but currency0 is not native ETH -> rejected by the handler guard
      initializeEvent({ poolId: `0x${'ee'.repeat(32)}`, currency0: OTHER_TOKEN, logIndex: 3 }),
    );

    const pools = await indexer.UniswapV4Pool.getAll();
    t.expect(pools).toHaveLength(1);

    const pool = await indexer.UniswapV4Pool.getOrThrow(POOL_ENTITY_ID);
    t.expect(pool.poolId).toBe(POOL_ID);
    t.expect(pool.currency0).toBe(ZERO);
    t.expect(pool.currency1).toBe(BST_ADDRESS);
    t.expect(pool.fee).toBe(3000n);
    t.expect(pool.tickSpacing).toBe(60n);
    t.expect(pool.sqrtPriceX96).toBe(SQRT_PRICE_1_1);
    t.expect(pool.tick).toBe(0n);
    t.expect(pool.creationTransaction).toBe(TX_INIT);

    t.expect(await indexer.UniswapV4PoolPosition.getAll()).toHaveLength(0);
    t.expect(await indexer.UniswapV4PoolPositionRecord.getAll()).toHaveLength(0);
  });

  it('non-BST Initialize creates no pool', async (t) => {
    await runEvents(indexer, initializeEvent({ poolId: OTHER_POOL_ID, currency1: OTHER_TOKEN }));
    t.expect(await indexer.UniswapV4Pool.getAll()).toHaveLength(0);
  });

  it('ModifyLiquidity on an unindexed pool creates no position', async (t) => {
    await runEvents(indexer, modifyLiquidityEvent(TX_A, { poolId: OTHER_POOL_ID }));
    t.expect(await indexer.UniswapV4PoolPosition.getAll()).toHaveLength(0);
  });

  it('ModifyLiquidity creates a position with computed amounts and a daily record', async (t) => {
    await runEvents(indexer, initializeEvent(), modifyLiquidityEvent(TX_A, { blockNumber: 101 }));

    const expectedAmount0 = getAmount0(TICK_LOWER, TICK_UPPER, 0n, LIQUIDITY, SQRT_PRICE_1_1);
    const expectedAmount1 = getAmount1(TICK_LOWER, TICK_UPPER, 0n, LIQUIDITY, SQRT_PRICE_1_1);

    const position = await indexer.UniswapV4PoolPosition.getOrThrow(POSITION_ID);
    t.expect(position.pool_id).toBe(POOL_ENTITY_ID);
    t.expect(position.uniqueKey).toBe(POSITION_ID);
    t.expect(position.sender).toBe(SENDER);
    t.expect(position.transactionHash).toBe(TX_A);
    t.expect(position.liquidityDelta).toBe(LIQUIDITY);
    t.expect(position.amount0).toBe(expectedAmount0);
    t.expect(position.amount1).toBe(expectedAmount1);
    // In-range position (tick 0 inside [-60, 60]) holds both currencies.
    t.expect(position.amount0 > 0n).toBe(true);
    t.expect(position.amount1 > 0n).toBe(true);

    const records = await indexer.UniswapV4PoolPositionRecord.getAll();
    t.expect(records).toHaveLength(1);
    t.expect(records[0]?.id).toBe(`${POSITION_ID}-101-1`);
    t.expect(records[0]?.uniPosition_id).toBe(position.id);
    t.expect(records[0]?.liquidityDelta).toBe(LIQUIDITY);
    t.expect(records[0]?.dayStartTimestamp).toBe(1_699_920_000);
  });

  it('accumulates liquidity into the same position across transactions', async (t) => {
    const secondDelta = 5n * 10n ** 17n;
    await runEvents(
      indexer,
      initializeEvent(),
      modifyLiquidityEvent(TX_A, { blockNumber: 101 }),
      modifyLiquidityEvent(TX_B, { liquidityDelta: secondDelta, blockNumber: 102 }),
    );

    const positions = await indexer.UniswapV4PoolPosition.getAll();
    t.expect(positions).toHaveLength(1);

    const total = LIQUIDITY + secondDelta;
    const position = positions[0]!;
    t.expect(position.id).toBe(POSITION_ID);
    t.expect(position.liquidityDelta).toBe(total);
    t.expect(position.amount0).toBe(getAmount0(TICK_LOWER, TICK_UPPER, 0n, total, SQRT_PRICE_1_1));
    t.expect(position.amount1).toBe(getAmount1(TICK_LOWER, TICK_UPPER, 0n, total, SQRT_PRICE_1_1));

    t.expect(await indexer.UniswapV4PoolPositionRecord.getAll()).toHaveLength(2);
  });

  it('ignores a zero-delta ModifyLiquidity (fee collection), e.g. the first step of a staking early withdraw', async (t) => {
    const slashed = -(4n * 10n ** 17n);
    await runEvents(
      indexer,
      initializeEvent(),
      modifyLiquidityEvent(TX_A, { blockNumber: 101 }),
      // Early withdraw: a 0-liquidity decrease (fees to the staker), then the slashed liquidity.
      modifyLiquidityEvent(TX_B, { liquidityDelta: 0n, blockNumber: 102, logIndex: 1 }),
      modifyLiquidityEvent(TX_B, { liquidityDelta: slashed, blockNumber: 102, logIndex: 2 }),
      // A plain fee collection on its own.
      modifyLiquidityEvent(TX_B, { liquidityDelta: 0n, blockNumber: 103 }),
    );

    const [position, ...others] = await indexer.UniswapV4PoolPosition.getAll();
    t.expect(others).toHaveLength(0);
    t.expect(position?.liquidityDelta).toBe(LIQUIDITY + slashed);

    const records = await indexer.UniswapV4PoolPositionRecord.getAll();
    t.expect(records.map((r) => [r.id, r.liquidityDelta]).sort()).toEqual([
      [`${POSITION_ID}-101-1`, LIQUIDITY],
      [`${POSITION_ID}-102-2`, slashed],
    ]);
  });

  it('Swap updates pool price state and recomputes position amounts', async (t) => {
    const newTick = 100n; // above the position range -> position is all currency1
    const newSqrtPrice = SQRT_PRICE_1_1 * 2n;

    await runEvents(
      indexer,
      initializeEvent(),
      modifyLiquidityEvent(TX_A, { blockNumber: 101 }),
      swapEvent(newTick, newSqrtPrice, { blockNumber: 102 }),
    );

    const pool = await indexer.UniswapV4Pool.getOrThrow(POOL_ENTITY_ID);
    t.expect(pool.tick).toBe(newTick);
    t.expect(pool.sqrtPriceX96).toBe(newSqrtPrice);

    const position = await indexer.UniswapV4PoolPosition.getOrThrow(POSITION_ID);
    t.expect(position.amount0).toBe(0n);
    t.expect(position.amount1).toBe(
      getAmount1(TICK_LOWER, TICK_UPPER, newTick, LIQUIDITY, newSqrtPrice),
    );
    t.expect(position.amount1 > 0n).toBe(true);
  });

  // PositionManager mints: Transfer (mint) and ModifyLiquidity for one NFT, as in one multicall.
  const mint = (tokenId: bigint, liquidityDelta: bigint, txHash: string, blockNumber: number, logIndex: number) =>
    [
      {
        contract: 'UniswapV4PositionManager',
        event: 'Transfer',
        logIndex,
        block: { number: blockNumber, timestamp: 1_700_000_000 },
        transaction: { hash: txHash },
        params: { from: ZERO, to: SENDER, id: tokenId },
      },
      modifyLiquidityEvent(txHash, {
        sender: POSITION_MANAGER,
        salt: saltOf(tokenId),
        liquidityDelta,
        blockNumber,
        logIndex: logIndex + 1,
      }),
    ] as ChainSimulate;
  const pmChange = (tokenId: bigint, liquidityDelta: bigint, txHash: string, blockNumber: number, logIndex: number) =>
    modifyLiquidityEvent(txHash, { sender: POSITION_MANAGER, salt: saltOf(tokenId), liquidityDelta, blockNumber, logIndex });
  const liquidityOf = async (id: string) => (await indexer.UniswapV4PoolPosition.getOrThrow(id)).liquidityDelta;

  it('keeps NFTs minted in one transaction in their own position records', async (t) => {
    const [A, B, C] = [1n, 2n, 3n];
    const DUST = 1_000n;
    const LARGE = 10n ** 21n;
    await runEvents(
      indexer,
      initializeEvent(),
      // One multicall mints a dust NFT and a large one.
      ...mint(A, DUST, TX_A, 101, 1),
      ...mint(B, LARGE, TX_A, 101, 3),
      // A later transaction burns B.
      pmChange(B, -LARGE, TX_B, 102, 1),
      // Another mints C and decreases A in one transaction.
      ...mint(C, LIQUIDITY, `0x${'55'.repeat(32)}`, 103, 1),
      pmChange(A, -DUST / 2n, `0x${'55'.repeat(32)}`, 103, 3),
    );

    t.expect(await liquidityOf(`${CHAIN_ID}-${A}`)).toBe(DUST / 2n);
    t.expect(await liquidityOf(`${CHAIN_ID}-${B}`)).toBe(0n);
    t.expect(await liquidityOf(`${CHAIN_ID}-${C}`)).toBe(LIQUIDITY);
    t.expect(await indexer.UniswapV4PoolPosition.getAll()).toHaveLength(3);
    // Each NFT links to its own record, whatever else its minting transaction did.
    for (const tokenId of [A, B, C]) {
      const token = await indexer.UniswapV4PositionToken.getOrThrow(`${CHAIN_ID}-${tokenId}`);
      t.expect(token.position_id).toBe(`${CHAIN_ID}-${tokenId}`);
    }
    // Two changes in one block keep a record each.
    t.expect(await indexer.UniswapV4PoolPositionRecord.getAll()).toHaveLength(5);
  });

  it("keeps liquidity another contract adds with an NFT's ticks and salt out of that NFT's record", async (t) => {
    const A = 1n;
    const attackerPosition = `${CHAIN_ID}-${POOL_ID}-${SENDER.toLowerCase()}-${TICK_LOWER}-${TICK_UPPER}-${saltOf(A)}`;
    await runEvents(
      indexer,
      initializeEvent(),
      ...mint(A, LIQUIDITY, TX_A, 101, 1),
      // A contract calls the PoolManager directly with A's ticks and salt: a position of its own.
      modifyLiquidityEvent(TX_B, { salt: saltOf(A), liquidityDelta: 10n ** 21n, blockNumber: 102 }),
      modifyLiquidityEvent(TX_B, { salt: saltOf(A), liquidityDelta: -(10n ** 21n), blockNumber: 103 }),
      modifyLiquidityEvent(TX_B, { salt: saltOf(A), liquidityDelta: 5n, blockNumber: 104 }),
    );

    t.expect(await liquidityOf(`${CHAIN_ID}-${A}`)).toBe(LIQUIDITY);
    t.expect(await liquidityOf(attackerPosition)).toBe(5n);
    t.expect((await indexer.UniswapV4PoolPosition.getOrThrow(attackerPosition)).sender).toBe(SENDER);
  });
});
