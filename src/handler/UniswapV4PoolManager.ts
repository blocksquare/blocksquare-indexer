import { ZeroAddress } from "ethers";
import { indexer } from "envio";
import { getLoadedConfig } from "../config";
import { getAmount0, getAmount1 } from "../helper/UniswapV4Helpers/liquidityAmounts";
import { getDay } from "../helper/date";
import { accrueStakingWeights, getUniswapV4PoolPositionId } from "../helper/UniswapV4Staking";

const { blockSquareTokenAddress: bstTokenAddress, uniswapV4PositionManagerAddress } = getLoadedConfig();
const positionManagerAddress = uniswapV4PositionManagerAddress.toLowerCase();

// The PoolManager is a chain-wide singleton, so every V4 pool emits through it.
// Like envio's reference uniswap-v4-indexer, all pool events are processed and
// non-ETH/BST pools are dropped by the handler guards below.
indexer.onEvent({ contract: "UniswapV4PoolManager", event: "Initialize" }, async ({ event, context }) => {
  /**
   * We only want to index the ETH : BST pool.
   *
   * In Uniswap V4:
   * - Native ETH is represented by ZeroAddress
   * - BST is our target ERC20 token
   *
   * If the pool currencies do not match (ETH as currency0 and BST as currency1),
   * we skip indexing this pool.
   */

  const { chainId } = event;
  const {
    currency0,
    currency1,
    id: poolId,
    fee,
    tickSpacing,
    hooks,
    sqrtPriceX96,
    tick,
  } = event.params;

  const isEth = currency0 === ZeroAddress;
  const isBst = currency1.toLowerCase() === bstTokenAddress.toLowerCase();

  if (!isEth || !isBst) return; // Ignore all other pools

  context.UniswapV4Pool.set({
    id: `${chainId}-${poolId}`,
    chainId,
    poolId,
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    sqrtPriceX96,
    tick,
    createdAtTimestamp: event.block.timestamp,
    creationTransaction: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "UniswapV4PoolManager", event: "Swap" }, async ({ event, context }) => {
  const {
    chainId,
    block: { timestamp, number: blockNumber },
  } = event;
  const { id: poolId, tick, sqrtPriceX96 } = event.params;

  const existingPool = await context.UniswapV4Pool.get(`${chainId}-${poolId}`);

  if (existingPool) {
    // Staking rewards accrue per second in range: credit the time at the old tick before it moves.
    await accrueStakingWeights(context, { chainId, now: timestamp, blockNumber, uniswapV4PoolId: existingPool.id });

    context.UniswapV4Pool.set({
      ...existingPool,
      tick,
      sqrtPriceX96,
    });


    const allPoolPositions = await context.UniswapV4PoolPosition.getWhere({
      pool_id: { _eq: existingPool.id },
    });

    if(allPoolPositions.length){
      for (const position of allPoolPositions) {
        const updatedAmount0 = getAmount0(position.tickLower, position.tickUpper, tick, position.liquidityDelta, sqrtPriceX96);
        const updatedAmount1 = getAmount1(position.tickLower, position.tickUpper, tick, position.liquidityDelta, sqrtPriceX96);

        context.UniswapV4PoolPosition.set({
          ...position,
          amount0: updatedAmount0,
          amount1: updatedAmount1,
        })
      }
    }
  }

});

indexer.onEvent({ contract: "UniswapV4PoolManager", event: "ModifyLiquidity" }, async ({ event, context }) => {
  /**
   * ModifyLiquidity event updates position liquidity.
   *
   * In Uniswap V4:
   * Each position is uniquely identified by:
   * - poolId
   * - owner (the `sender` that called modifyLiquidity)
   * - tickLower
   * - tickUpper
   * - salt
   */

  const {
    chainId,
    logIndex,
    transaction: { hash: transactionHash },
    block: { number: blockNumber, timestamp },
  } = event;
  const {
    id: poolId,
    sender,
    tickLower,
    tickUpper,
    liquidityDelta,
    salt,
  } = event.params;

  // A zero delta only collects fees (e.g. the first of the two decreases in a staking early
  // withdraw). It changes no liquidity, so it gets no record.
  if (liquidityDelta === 0n) return;

  // We only process liquidity changes for pools that are already indexed.
  const poolEntityId = `${chainId}-${poolId}`;
  let pool = await context.UniswapV4Pool.get(poolEntityId);
  if (!pool) return;

  // Staking rewards accrue per second in range: credit the time at the old liquidity before it
  // changes (an early withdraw removes part of a staked position).
  await accrueStakingWeights(context, { chainId, now: timestamp, blockNumber, uniswapV4PoolId: poolEntityId });

  /**
   * One record per v4 position, never per transaction: several NFTs minted in one multicall must
   * not share a record, and nobody else may write into a staked NFT's record.
   * - PositionManager positions: one record per NFT. The PositionManager uses salt = bytes32(tokenId),
   *   so the record is keyed by token id, which the Transfer handler links the NFT to.
   * - Any other caller owns its own v4 position (owner, ticks, salt), so its key includes `sender`.
   *   Liquidity a third party adds with a staked NFT's ticks and salt never reaches that NFT's record.
   */
  const isPositionManager = sender.toLowerCase() === positionManagerAddress;
  const positionId = isPositionManager
    ? getUniswapV4PoolPositionId(chainId, BigInt(salt))
    : `${chainId}-${poolId}-${sender.toLowerCase()}-${tickLower}-${tickUpper}-${salt}`;
  const position = await context.UniswapV4PoolPosition.get(positionId);

  const amount0 = getAmount0(tickLower, tickUpper, pool.tick, liquidityDelta, pool.sqrtPriceX96);
  const amount1 = getAmount1(tickLower, tickUpper, pool.tick, liquidityDelta, pool.sqrtPriceX96);

  if (position) {
    const updatedLiquidityDelta = position.liquidityDelta + liquidityDelta;
    const updatedAmount0 = getAmount0(position.tickLower, position.tickUpper, pool.tick, updatedLiquidityDelta, pool.sqrtPriceX96);
    const updatedAmount1 = getAmount1(position.tickLower, position.tickUpper, pool.tick, updatedLiquidityDelta, pool.sqrtPriceX96);

    context.UniswapV4PoolPosition.set({
      ...position,
      liquidityDelta: updatedLiquidityDelta,
      amount0: updatedAmount0,
      amount1: updatedAmount1
    });
  } else {
    context.UniswapV4PoolPosition.set({
      id: positionId,
      transactionHash,
      sender,
      liquidityDelta,
      tickLower,
      tickUpper,
      salt,
      chainId,
      pool_id: poolEntityId,
      uniqueKey: positionId,
      amount0,
      amount1
    });
  }

  const { start: dayStart } = getDay(timestamp);

  context.UniswapV4PoolPositionRecord.set({
    // Two changes of one position in one block (e.g. a mint and a decrease in one multicall) each keep a record.
    id: `${positionId}-${blockNumber}-${logIndex}`,
    blockNumber,
    transactionHash,
    liquidityDelta,
    tickLower,
    tickUpper,
    salt,
    chainId,
    pool_id: poolEntityId,
    uniqueKey: positionId,
    amount0,
    amount1,
    blockTimestamp: timestamp,
    dayStartTimestamp: dayStart,
    uniPosition_id: positionId,
  });
});
