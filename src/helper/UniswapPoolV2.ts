import { getDay, getHour } from './date';
import { formatTo8Decimals } from './format';
import { AssetPair, AssetPairPrice, BigDecimal, UniswapV2Pool } from "envio";

/**
 * Generic function to calculate and store USD price for any BST/TOKEN pair
 */
export const getAssetPairData = (bstUSDAssetPair: AssetPair, tokenSymbol: string, event: any) => {
  const amount0In = BigDecimal(event.params.amount0In.toString()); // Base Token (BST)
  const amount1In = BigDecimal(event.params.amount1In.toString()); // Token
  const amount0Out = BigDecimal(event.params.amount0Out.toString()); // Base Token (BST)
  const amount1Out = BigDecimal(event.params.amount1Out.toString()); // Token

  // Determine token price in BST
  const pricePerTokenInBST = amount0In.gt(0)
    ? amount1Out.div(amount0In) // TOKEN/BST
    : amount1In.div(amount0Out); // TOKEN/BST

  // Convert 1 TOKEN in BST to USD price
  const tokenToUsdPrecise = pricePerTokenInBST.multipliedBy(bstUSDAssetPair.latestPrice);

  // Format price to 8 decimals
  const { formatted: tokenToUsd, formattedBI: tokenToUsdBI } = formatTo8Decimals(tokenToUsdPrecise);

  const assetPairId = `${tokenSymbol}/USD`;
  const { start: hourStart } = getHour(event.block.timestamp);
  const { start: dayStart } = getDay(event.block.timestamp);

  const assetPairPrice = getNewAssetPairPrice(
    event.srcAddress,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
    assetPairId,
    tokenToUsdBI,
    tokenToUsd,
    dayStart,
    hourStart,
  );

  return {
    assetPairPrice,
    assetPairId,
  };
};

export const getNewUniswapV2Pool = (address: string, assetPairId: string): UniswapV2Pool => ({
  id: address,
  assetPairId,
  totalSupply: 0n,
  reserve0: 0n,
  reserve1: 0n,
});

export const computeLPPriceUSD = (
  pool: UniswapV2Pool,
  price0USD: number,
  price1USD: number,
): BigDecimal => {
  const r0 = BigDecimal(pool.reserve0.toString());
  const r1 = BigDecimal(pool.reserve1.toString());
  const supply = BigDecimal(pool.totalSupply.toString());
  return r0.multipliedBy(price0USD).plus(r1.multipliedBy(price1USD)).div(supply);
};

export const getLPAssetPairData = (
  pool: UniswapV2Pool,
  price0USD: number,
  price1USD: number,
  timestamp: number,
  blockNumber: number,
  logIndex: number,
  dayStart: number,
  hourStart: number,
): { assetPairPrice: AssetPairPrice; assetPair: AssetPair } => {
  const lpPairId = `${pool.assetPairId}-LP/USD`;
  const { formatted, formattedBI } = formatTo8Decimals(
    computeLPPriceUSD(pool, price0USD, price1USD),
  );
  return {
    assetPairPrice: getNewAssetPairPrice(
      pool.id, timestamp, blockNumber, logIndex, lpPairId, formattedBI, formatted, dayStart, hourStart,
    ),
    assetPair: {
      id: lpPairId,
      latestPrice: formatted,
      latestPriceBI: formattedBI,
      updatedAt: timestamp,
      latestAggregatorAddress: pool.id,
    },
  };
};

export const getNewAssetPairPrice = (
  srcAddress: string,
  timestamp: number,
  blockNumber: number,
  logIndex: number,
  assetPairId: string,
  bstToUsdBI: bigint,
  bstToUsd: number,
  dayStart: number,
  hourStart: number,
): AssetPairPrice => {
  return {
    id: `${srcAddress}-${timestamp}-${logIndex}`,
    assetPair_id: assetPairId,
    priceBI: bstToUsdBI,
    price: bstToUsd,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    blockNumber: blockNumber,
    timestamp: timestamp,
  };
};
