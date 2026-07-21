import {
  CHAINLINK_AUD_ADDRESS,
  CHAINLINK_DAI_ADDRESS,
  CHAINLINK_ETH_ADDRESS,
  CHAINLINK_EUR_ADDRESS,
  CHAINLINK_GBP_ADDRESS,
  CHAINLINK_JPY_ADDRESS,
  CHAINLINK_USD_ADDRESS,
} from '../helper/constants';

import { indexer, PriceFeedRegistry } from "envio";

// Map of base addresses to their asset symbols (all paired with USD)
const USD_PAIR_MAPPINGS: Record<string, string> = {
  [CHAINLINK_ETH_ADDRESS]: 'ETH',
  [CHAINLINK_DAI_ADDRESS]: 'DAI',
  [CHAINLINK_GBP_ADDRESS]: 'GBP',
  [CHAINLINK_EUR_ADDRESS]: 'EUR',
  [CHAINLINK_JPY_ADDRESS]: 'JPY',
  [CHAINLINK_AUD_ADDRESS]: 'AUD',
};

/**
 * Helper function to get asset pair ID for USD denominated pairs
 */
const getUsdAssetPairId = (base: string, denomination: string): string | null => {
  if (denomination !== CHAINLINK_USD_ADDRESS) return null;
  const baseSymbol = USD_PAIR_MAPPINGS[base];
  return baseSymbol ? `${baseSymbol}/USD` : null;
};

indexer.contractRegister(
  { contract: "PriceFeedRegistry", event: "FeedConfirmed" },
  async ({ event, context }) => {
    // Only register aggregator if it's a USD pair we're tracking
    if (getUsdAssetPairId(event.params.asset, event.params.denomination)) {
      context.chain.PriceDataFeed.add(event.params.latestAggregator);
    }
  }
);

indexer.onEvent(
  { contract: "PriceFeedRegistry", event: "FeedConfirmed" },
  async ({ event, context }) => {
  const assetPairId = getUsdAssetPairId(event.params.asset, event.params.denomination);

  if (!assetPairId) return;

  const assetPair = await context.AssetPair.getOrCreate({
    id: assetPairId,
    latestPrice: 0,
    latestPriceBI: 0n,
    updatedAt: 0,
    latestAggregatorAddress: event.params.latestAggregator,
  });

  context.AssetPair.set({
    ...assetPair,
    latestAggregatorAddress: event.params.latestAggregator,
  });
}
);
