import type { EvmEvent, EvmOnEventContext } from 'envio';
import { uint256ToAddress } from './LimitOrderTrades';

type OneInchOrderFilledEvent = EvmEvent<'OneInchPostInteraction', 'PostInteractionOrderFilled'>;

export type ValidReferral = {
  referralCode: string;
  referralId: string;
  referrerUserId: string;
  buyerWalletId: string;
  marketplaceId: string;
  tradeId: string;
};

// Returns null for: no property token, malformed extraData, unknown referrer, or self-referral.
export const resolveReferral = async (
  event: OneInchOrderFilledEvent,
  context: EvmOnEventContext,
): Promise<ValidReferral | null> => {
  const extraData = event.params.extraData;
  if (!extraData || extraData.length !== 66) return null;

  const makerToken = uint256ToAddress(event.params.order.makerAsset);
  const takerToken = uint256ToAddress(event.params.order.takerAsset);

  const [makerPropertyToken, takerPropertyToken] = await Promise.all([
    context.PropertyToken.get(`${event.chainId}-${makerToken}`),
    context.PropertyToken.get(`${event.chainId}-${takerToken}`),
  ]);

  const propertyToken = makerPropertyToken || takerPropertyToken;
  if (!propertyToken) return null;

  const buyerWalletId = `${event.chainId}-${event.params.taker}`;
  const marketplaceId = propertyToken.certifiedPartner_id;
  const referrerUserId = `${event.chainId}-${extraData.slice(2)}`;

  const [referrerUser, buyerWalletEntity] = await Promise.all([
    context.User.get(referrerUserId),
    context.Wallet.get(buyerWalletId),
  ]);

  if (!referrerUser || buyerWalletEntity?.user_id === referrerUserId) return null;

  return {
    referralCode: extraData,
    referralId: `${event.chainId}-${marketplaceId}-${event.params.taker}`,
    referrerUserId,
    buyerWalletId,
    marketplaceId,
    tradeId: `${event.chainId}-${propertyToken.contractAddress}-${event.transaction.hash}-${event.logIndex}`,
  };
};
