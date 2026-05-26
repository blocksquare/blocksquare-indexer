import { ZeroAddress } from "ethers";
import { UniswapV4PoolManager } from "generated";
import { getLoadedConfig } from "../config";
import { getAmount0, getAmount1 } from "../helper/UniswapV4Helpers/liquidityAmounts";
import { getDay } from "../helper/date";

const bstTokenAddress = getLoadedConfig().blockSquareTokenAddress;

UniswapV4PoolManager.Initialize.handler(async ({ event, context }) => {
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

UniswapV4PoolManager.Swap.handler(async ({ event, context }) => {
  const { chainId } = event;
  const { id: poolId, tick, sqrtPriceX96 } = event.params;

  const existingPool = await context.UniswapV4Pool.get(`${chainId}-${poolId}`);

  if (existingPool) {
    context.UniswapV4Pool.set({
      ...existingPool,
      tick,
      sqrtPriceX96,
    });


    const allPoolPositions = await context.UniswapV4PoolPosition.getWhere.pool_id.eq(existingPool.id);

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

UniswapV4PoolManager.ModifyLiquidity.handler(async ({ event, context }) => {
  /**
   * ModifyLiquidity event updates position liquidity.
   *
   * In Uniswap V4:
   * Each position is uniquely identified by:
   * - poolId
   * - tickLower
   * - tickUpper
   * - salt
   */

  const {
    chainId,
    transaction: { hash: transactionHash },
    block: { number: blockNumber, timestamp },
  } = event;
  const {
    id: poolId,
    tickLower,
    tickUpper,
    liquidityDelta,
    salt,
  } = event.params;

  // We only process liquidity changes for pools that are already indexed.
  const poolEntityId = `${chainId}-${poolId}`;
  let pool = await context.UniswapV4Pool.get(poolEntityId);
  if (!pool) return;

  // Check if position already exists with the same transaction hash
  const positionId = `${chainId}-${transactionHash}`;
  let position = await context.UniswapV4PoolPosition.get(positionId);

  /**
   * Secondary lookup using business unique key.
   * This ensures we correctly match existing positions even if the
   * position was created or updated in a different transaction.
   */
  const positionUniqueKey = `${chainId}-${poolId}-${tickLower}-${tickUpper}-${salt}`;

  // Verify if the position exists using unique business identity
  if (!position) {
    const positionByUniqueKey =
      await context.UniswapV4PoolPosition.getWhere.uniqueKey.eq(
        positionUniqueKey,
      );
    position = positionByUniqueKey[0];
  }

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
      liquidityDelta,
      tickLower,
      tickUpper,
      salt,
      chainId,
      pool_id: poolEntityId,
      uniqueKey: positionUniqueKey,
      amount0,
      amount1
    });
  }

  const { start: dayStart } = getDay(timestamp);

  context.UniswapV4PoolPositionRecord.set({
    id: `${positionUniqueKey}-${blockNumber}`,
    blockNumber,
    transactionHash,
    liquidityDelta,
    tickLower,
    tickUpper,
    salt,
    chainId,
    pool_id: poolEntityId,
    uniqueKey: positionUniqueKey,
    amount0,
    amount1,
    blockTimestamp: timestamp,
    dayStartTimestamp: dayStart,
    uniPosition_id: positionId,
  });
});
