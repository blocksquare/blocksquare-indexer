import { indexer } from 'envio';
import { uint256ToAddress, updatePropertyTokenTradeCounts } from '../helper/LimitOrderTrades';
import { resolveReferral } from '../helper/Referral';
import { LimitOrderProtocol } from '../types/enums';

indexer.onEvent(
  { contract: 'OneInchPostInteraction', event: 'PostInteractionOrderFilled' },
  async ({ event, context }) => {
    // The 1inch Order struct fields (makerAsset, takerAsset, maker) are ABI-typed as uint256
    // but semantically hold packed addresses. In V2, Envio decoded tuples as positional arrays
    // requiring index constants (ORDER_STRUCT_INDEX.MAKER_ASSET). In V3, Solidity struct
    // components are decoded as named objects, so we access fields directly by name.
    // See: https://docs.envio.dev/docs/HyperIndex/whats-new-in-v3#better-tuples-developer-experience
    const makerToken = uint256ToAddress(event.params.order.makerAsset);
    const takerToken = uint256ToAddress(event.params.order.takerAsset);
    const maker = uint256ToAddress(event.params.order.maker);

    // Check if either makerToken or takerToken is a property token
    const [makerPropertyToken, takerPropertyToken] = await Promise.all([
      context.PropertyToken.get(`${event.chainId}-${makerToken}`),
      context.PropertyToken.get(`${event.chainId}-${takerToken}`),
    ]);

    // Determine which property token to use (at least one must exist)
    const propertyToken = makerPropertyToken || takerPropertyToken;
    if (!propertyToken) {
      return;
    }

    const tradeId = `${event.chainId}-${propertyToken.contractAddress}-${event.transaction.hash}-${event.logIndex}`;
    const buyerWalletId = `${event.chainId}-${event.params.taker}`;

    const referral = await resolveReferral(event, context);

    context.PropertyTokenTrade.set({
      id: tradeId,
      chainID: event.chainId,
      transactionHash: event.transaction.hash,
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      propertyToken_id: propertyToken.id,
      maker_id: `${event.chainId}-${maker}`,
      taker_id: buyerWalletId,
      orderHash: event.params.orderHash,
      makerToken: makerToken,
      takerToken: takerToken,
      takerTokenFilledAmount: event.params.takingAmount,
      makerTokenFilledAmount: event.params.makingAmount,
      propertyValuation: propertyToken.propertyValuation,
      protocol: LimitOrderProtocol.OneInch,
      referralCode: referral?.referralCode ?? '',
    });

    // Handle case where property token is on maker side (being sold)
    if (makerPropertyToken) {
      context.PropertyToken.set({
        ...makerPropertyToken,
        totalPropertyTokenTraded:
          makerPropertyToken.totalPropertyTokenTraded + event.params.makingAmount,
        totalValueTraded: makerPropertyToken.totalValueTraded + event.params.takingAmount,
      });
    }

    // Handle case where property token is on taker side (being bought)
    if (takerPropertyToken) {
      context.PropertyToken.set({
        ...takerPropertyToken,
        totalPropertyTokenTraded:
          takerPropertyToken.totalPropertyTokenTraded + event.params.takingAmount,
        totalValueTraded: takerPropertyToken.totalValueTraded + event.params.makingAmount,
      });
    }

    await updatePropertyTokenTradeCounts(context, event.chainId, maker, 'makerCount');
    await updatePropertyTokenTradeCounts(context, event.chainId, event.params.taker, 'takerCount');
  },
);

// Referral bookkeeping runs as a separate handler on the same event.
indexer.onEvent(
  { contract: 'OneInchPostInteraction', event: 'PostInteractionOrderFilled' },
  async ({ event, context }) => {
    const referral = await resolveReferral(event, context);
    if (!referral) return;

    const existingReferral = await context.Referral.get(referral.referralId);
    if (existingReferral) return;

    context.Referral.set({
      id: referral.referralId,
      wallet_id: referral.buyerWalletId,
      referrer_id: referral.referrerUserId,
      marketplace_id: referral.marketplaceId,
      firstOrderTrade_id: referral.tradeId,
      createdAt: event.block.timestamp,
    });
  },
);
