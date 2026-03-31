import { ZeroEx } from 'generated';
import { updatePropertyTokenTradeCounts } from '../helper/LimitOrderTrades';
import { LimitOrderProtocol } from '../types/enums';

ZeroEx.LimitOrderFilled.handler(async ({ event, context }) => {
  // Check if either makerToken or takerToken is a property token
  const [makerPropertyToken, takerPropertyToken] = await Promise.all([
    context.PropertyToken.get(`${event.chainId}-${event.params.makerToken}`),
    context.PropertyToken.get(`${event.chainId}-${event.params.takerToken}`),
  ]);

  // Determine which property token to use (at least one must exist)
  const propertyToken = makerPropertyToken || takerPropertyToken;
  if (!propertyToken) return;

  // Create PropertyTokenTrade record
  context.PropertyTokenTrade.set({
    id: `${event.chainId}-${propertyToken.contractAddress}-${event.transaction.hash}-${event.logIndex}`,
    chainID: event.chainId,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    propertyToken_id: propertyToken.id,
    maker_id: `${event.chainId}-${event.params.maker}`,
    taker_id: `${event.chainId}-${event.params.taker}`,
    orderHash: event.params.orderHash,
    makerToken: event.params.makerToken,
    takerToken: event.params.takerToken,
    takerTokenFilledAmount: event.params.takerTokenFilledAmount,
    makerTokenFilledAmount: event.params.makerTokenFilledAmount,
    propertyValuation: propertyToken.propertyValuation,
    protocol: LimitOrderProtocol.ZeroEx,
  });

  // Handle case where property token is on maker side (being sold)
  if (makerPropertyToken) {
    context.PropertyToken.set({
      ...makerPropertyToken,
      totalPropertyTokenTraded:
        makerPropertyToken.totalPropertyTokenTraded + event.params.makerTokenFilledAmount,
      totalValueTraded: makerPropertyToken.totalValueTraded + event.params.takerTokenFilledAmount,
    });
  }

  // Handle case where property token is on taker side (being bought)
  if (takerPropertyToken) {
    context.PropertyToken.set({
      ...takerPropertyToken,
      totalPropertyTokenTraded:
        takerPropertyToken.totalPropertyTokenTraded + event.params.takerTokenFilledAmount,
      totalValueTraded: takerPropertyToken.totalValueTraded + event.params.makerTokenFilledAmount,
    });
  }

  await updatePropertyTokenTradeCounts(context, event.chainId, event.params.maker, 'makerCount');
  await updatePropertyTokenTradeCounts(context, event.chainId, event.params.taker, 'takerCount');
});
