import { BigDecimal, UniswapPoolV2 } from 'generated';
import { getLoadedConfig } from '../config';
import { formatTo8Decimals } from '../helper/format';
import { ZeroAddress } from 'ethers';
import { getDay, getHour } from '../helper/date';
import { getAssetPairData, getNewAssetPairPrice } from '../helper/UniswapPoolV2';

const uniswapWethBstPoolAddress = getLoadedConfig().uniswapPoolContracts.find(
  (contract) => contract.assetPairId === 'BST/ETH',
)?.address;

const uniswapBstPointPoolAddress = getLoadedConfig().uniswapPoolContracts.find(
  (contract) => contract.assetPairId === 'BST/POINT',
)?.address;

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
