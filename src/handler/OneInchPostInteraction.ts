import { OneInchPostInteraction } from 'generated';
import {ORDER_STRUCT_INDEX, uint256ToAddress, updatePropertyTokenTradeCounts} from '../helper/LimitOrderTrades';
import {LimitOrderProtocol} from "../types/enums";

OneInchPostInteraction.PostInteractionOrderFilled.handler(async ({ event, context }) => {
  // Extract token addresses from the nested order struct (tuple array)
  // In 1inch, makerAsset and takerAsset are stored as uint256 (Address type)
  const makerToken = uint256ToAddress(event.params.order[ORDER_STRUCT_INDEX.MAKER_ASSET]);
  const takerToken = uint256ToAddress(event.params.order[ORDER_STRUCT_INDEX.TAKER_ASSET]);

  // Extract maker address from the order struct (stored as uint256)
  const maker = uint256ToAddress(event.params.order[ORDER_STRUCT_INDEX.MAKER]);

  // Check if either makerToken or takerToken is a property token
  const [makerPropertyToken, takerPropertyToken] = await Promise.all([
    context.PropertyToken.get(`${event.chainId}-${makerToken}`),
    context.PropertyToken.get(`${event.chainId}-${takerToken}`)
  ]);

  // Determine which property token to use (at least one must exist)
  const propertyToken = makerPropertyToken || takerPropertyToken;
  if (!propertyToken) {
    return;
  }

  context.PropertyTokenTrade.set({
    id: `${event.chainId}-${propertyToken.contractAddress}-${event.transaction.hash}-${event.logIndex}`,
    chainID: event.chainId,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    propertyToken_id: propertyToken.id,
    maker_id: `${event.chainId}-${maker}`,
    taker_id: `${event.chainId}-${event.params.taker}`,
    orderHash: event.params.orderHash,
    makerToken: makerToken,
    takerToken: takerToken,
    takerTokenFilledAmount: event.params.takingAmount,
    makerTokenFilledAmount: event.params.makingAmount,
    propertyValuation: propertyToken.propertyValuation,
    protocol: LimitOrderProtocol.OneInch,
  });

  // Handle case where property token is on maker side (being sold)
  if (makerPropertyToken) {
    context.PropertyToken.set({
      ...makerPropertyToken,
      totalPropertyTokenTraded:
        makerPropertyToken.totalPropertyTokenTraded +
        event.params.makingAmount,
      totalValueTraded:
        makerPropertyToken.totalValueTraded +
        event.params.takingAmount,
    });
  }

  // Handle case where property token is on taker side (being bought)
  if (takerPropertyToken) {
    context.PropertyToken.set({
      ...takerPropertyToken,
      totalPropertyTokenTraded:
        takerPropertyToken.totalPropertyTokenTraded +
        event.params.takingAmount,
      totalValueTraded:
        takerPropertyToken.totalValueTraded +
        event.params.makingAmount,
    });
  }

  await updatePropertyTokenTradeCounts(
    context,
    event.chainId,
    maker,
    'makerCount'
  );
  await updatePropertyTokenTradeCounts(
    context,
    event.chainId,
    event.params.taker,
    'takerCount'
  );

  const extraData = event.params.extraData;
  const EMPTY_BYTES32 = '0x' + '0'.repeat(64);
  //We are extracting and checking extraData if it's not null/undefined, if it's not empty bytes and it's length 66 which suppose to be 
  if (!extraData || extraData.length !== 66 || extraData === EMPTY_BYTES32) {
    return;
  }
  //After we get our referralCode from schema if it's not there, then it's invalid referralCode this referralCode isn't exist
  const referralCode = await context.ReferralCode.get(extraData);
  if (!referralCode) {
    return;
  }
  //Extracting buyer wallet who is actually referral, and check if referralCode owner != buyer wallet
  const buyerWallet = event.params.taker;
  const buyerId = `${event.chainId}-${buyerWallet}`;
  if (referralCode.wallet_id === buyerId) {
    return;
  }
  //After we are checking if this Referral is already exist or not 
  const referralId = `${event.chainId}-${referralCode.marketplace_id}-${buyerWallet}`;
  const existingReferral = await context.Referral.get(referralId);
  if (existingReferral) {
    return;
  }
  //If everything above was false,then we can conclude that it's valid Referral and we create new Referral entity which embedded with referrer
  const tradeId = `${event.chainId}-${propertyToken.contractAddress}-${event.transaction.hash}-${event.logIndex}`;
  context.Referral.set({
    id: referralId,
    wallet_id: buyerId,
    referrer_id: referralCode.id,
    marketplace_id: referralCode.marketplace_id,
    firstOrderTrade_id: tradeId,
    createdAt: event.block.timestamp
  });
});

