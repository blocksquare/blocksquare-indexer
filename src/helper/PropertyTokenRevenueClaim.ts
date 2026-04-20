import { PropertyTokenRevenueClaim } from 'generated';

export const getNewPropertyTokenRevenueClaim = (
  chainId: number,
  transactionHash: string,
  blockNumber: number,
  blockTimestamp: number,
  logIndex: number,
  propertyTokenId: string,
  walletId: string,
  amount: bigint,
): PropertyTokenRevenueClaim => {
  return {
    id: `${chainId}-${transactionHash}-${logIndex}`,
    chainId,
    transactionHash,
    blockNumber,
    blockTimestamp,
    propertyToken_id: propertyTokenId,
    wallet_id: walletId,
    amount,
  };
};
