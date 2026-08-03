import { PriceDataFeed } from 'generated';
import { getDay, getHour } from '../helper/date';

PriceDataFeed.AnswerUpdated.handler(async ({ event, context }) => {
  // Returns a list that should always only contain a maximum of one entry
  const assetPairs = await context.AssetPair.getWhere.latestAggregatorAddress.eq(event.srcAddress);

  /*
    The preRegisterDynamicContracts in PriceFeedRegistry.FeedConfirmed.contractRegister
    collects all the contract addresses of the price feeds to group them and so bigger
    batches of events from the RPC can be fetched. This is done to improve the indexing speed.
    Since this contracts have already events before the registry, we need to filter them out
    due to the fact that AssetPair is created in the PriceFeedRegistry. Otherwise
    we will throw an error here. Therefore we decide to simply skip the events.
  */
  if (assetPairs.length === 0) return;

  const { start: hourStart } = getHour(Number(event.params.updatedAt));
  const { start: dayStart } = getDay(Number(event.params.updatedAt));

  const newPrice = {
    id: `${event.srcAddress}-${event.params.updatedAt}`,
    assetPair_id: assetPairs[0].id,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    priceBI: event.params.current,
    price: Number(event.params.current) / 10 ** 8,
    blockNumber: event.block.number,
    timestamp: Number(event.params.updatedAt),
  };

  context.AssetPairPrice.set(newPrice);
  context.AssetPair.set({
    ...assetPairs[0],
    latestPrice: newPrice.price,
    latestPriceBI: newPrice.priceBI,
    updatedAt: event.block.timestamp,
  });
});
