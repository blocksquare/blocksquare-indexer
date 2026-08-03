import { BigDecimal, UniswapPoolV2, onBlock } from 'generated';
import { getLoadedConfig } from '../config';
import { formatTo8Decimals } from '../helper/format';
import { ZeroAddress } from 'ethers';
import { getDay, getHour } from '../helper/date';
import { getAssetPairData, getNewAssetPairPrice, getNewUniswapV2Pool, getLPAssetPairData } from '../helper/UniswapPoolV2';

const config = getLoadedConfig();

const uniswapWethBstPoolAddress = config.uniswapPoolContracts['BST/ETH']?.address;
const uniswapBstPointPoolAddress = config.uniswapPoolContracts['BST/POINT']?.address;

// address → { pairId, token0PairId, token1PairId } — used by generic Sync/Transfer/onBlock handlers
const addressToPool = Object.fromEntries(
  Object.entries(config.uniswapPoolContracts).map(([pairId, c]) => [c.address, { pairId, ...c }]),
);

UniswapPoolV2.Swap.handler(async ({ event, context }) => {
  const [ethUSDAssetPair, bstUSDAssetPair] = await Promise.all([
    context.AssetPair.get('ETH/USD'),
    context.AssetPair.get('BST/USD'),
  ]);

  if (ethUSDAssetPair) {
    //ETH:USD

    if (event.srcAddress === uniswapWethBstPoolAddress) {
      // BST:ETH Liquidity Pool
      // BST price calculation only
      const amount0In = BigDecimal(event.params.amount0In.toString());
      const amount1In = BigDecimal(event.params.amount1In.toString());
      const amount0Out = BigDecimal(event.params.amount0Out.toString());
      const amount1Out = BigDecimal(event.params.amount1Out.toString());

      // We need to check on which side of the swap BST is and calculate the price accordingly
      const bstToEth = amount0In.gt(0) ? amount1Out.div(amount0In) : amount1In.div(amount0Out);

      const bstToUsdPrecise = bstToEth.multipliedBy(ethUSDAssetPair.latestPrice);

      const { formatted: bstToUsd, formattedBI: bstToUsdBI } = formatTo8Decimals(bstToUsdPrecise);

      const assetPairId = 'BST/USD';
      const { start: hourStart } = getHour(event.block.timestamp);
      const { start: dayStart } = getDay(event.block.timestamp);

      const assetPairPrice = getNewAssetPairPrice(
        event.srcAddress,
        event.block.timestamp,
        event.block.number,
        event.logIndex,
        assetPairId,
        bstToUsdBI,
        bstToUsd,
        dayStart,
        hourStart,
      );
      context.AssetPairPrice.set(assetPairPrice);

      context.AssetPair.set({
        id: assetPairId,
        latestPrice: assetPairPrice.price,
        latestPriceBI: assetPairPrice.priceBI,
        updatedAt: event.block.timestamp,
        latestAggregatorAddress: ZeroAddress,
      });
    }

    if (bstUSDAssetPair) {
      if (event.srcAddress === uniswapBstPointPoolAddress) {
        // BST:POINT Liquidity Pool
        let { assetPairPrice, assetPairId } = getAssetPairData(bstUSDAssetPair, 'POINT', event);

        context.AssetPairPrice.set(assetPairPrice);

        context.AssetPair.set({
          id: assetPairId,
          latestPrice: assetPairPrice.price,
          latestPriceBI: assetPairPrice.priceBI,
          updatedAt: event.block.timestamp,
          latestAggregatorAddress: ZeroAddress,
        });
      }
    }
  }
});

// Track LP token total supply via mint (from=0x0) and burn (to=0x0) transfers
UniswapPoolV2.Transfer.handler(async ({ event, context }) => {
  const isMint = event.params.from === ZeroAddress;
  const isBurn = event.params.to === ZeroAddress;
  if (!isMint && !isBurn) return;

  const poolCfg = addressToPool[event.srcAddress];
  if (!poolCfg) return;

  const pool =
    (await context.UniswapV2Pool.get(event.srcAddress)) ??
    getNewUniswapV2Pool(event.srcAddress, poolCfg.pairId);

  context.UniswapV2Pool.set({
    ...pool,
    totalSupply: isMint
      ? pool.totalSupply + event.params.value
      : pool.totalSupply - event.params.value,
  });
});

// On every reserve change, compute and store LP token price in USD
UniswapPoolV2.Sync.handler(async ({ event, context }) => {
  const poolCfg = addressToPool[event.srcAddress];
  if (!poolCfg) return;

  const pool = await context.UniswapV2Pool.get(event.srcAddress);
  if (!pool || pool.totalSupply === 0n) return;

  const updatedPool = {
    ...pool,
    reserve0: event.params.reserve0,
    reserve1: event.params.reserve1,
  };
  context.UniswapV2Pool.set(updatedPool);

  const [token0Price, token1Price] = await Promise.all([
    context.AssetPair.get(poolCfg.token0PairId),
    context.AssetPair.get(poolCfg.token1PairId),
  ]);
  if (!token0Price || !token1Price) return;

  const { start: hourStart } = getHour(event.block.timestamp);
  const { start: dayStart } = getDay(event.block.timestamp);
  const { assetPairPrice, assetPair } = getLPAssetPairData(
    updatedPool, token0Price.latestPrice, token1Price.latestPrice,
    event.block.timestamp, event.block.number, event.logIndex, dayStart, hourStart,
  );
  context.AssetPairPrice.set(assetPairPrice);
  context.AssetPair.set(assetPair);
});

// Recalculate LP price every ~1 hour using latest USD asset pair prices,
// so AssetPairPrice stays current even when no Sync event fires for extended periods.
onBlock(
  { name: 'HourlyLPPriceUpdate', chain: 1, interval: 300 },
  async ({ block, context }) => {
    if (context.isPreload) return;

    const poolCfgs = Object.values(addressToPool);
    const results = await Promise.all(
      poolCfgs.map(({ address, token0PairId, token1PairId }) =>
        Promise.all([
          context.UniswapV2Pool.get(address),
          context.AssetPair.get(token0PairId),
          context.AssetPair.get(token1PairId),
        ]),
      ),
    );

    for (let i = 0; i < poolCfgs.length; i++) {
      const [pool, token0Price, token1Price] = results[i];
      if (!pool || pool.totalSupply === 0n || !token0Price || !token1Price) continue;
      const timestamp = Math.max(token0Price.updatedAt, token1Price.updatedAt);
      const { start: hourStart } = getHour(timestamp);
      const { start: dayStart } = getDay(timestamp);
      const { assetPairPrice, assetPair } = getLPAssetPairData(
        pool, token0Price.latestPrice, token1Price.latestPrice, timestamp, block.number, 0, dayStart, hourStart,
      );
      context.AssetPairPrice.set(assetPairPrice);
      context.AssetPair.set(assetPair);
    }
  },
);
