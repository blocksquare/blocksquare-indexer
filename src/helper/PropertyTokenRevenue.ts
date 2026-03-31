import { PropertyTokenRevenue } from 'generated';
import { PropertyToken } from 'generated/src/Types.gen';

export const getNewPropertyTokenRevenue = (
  propertyToken: PropertyToken,
  walletAddress: string,
): PropertyTokenRevenue => {
  return {
    id: `${propertyToken.id}-${walletAddress}`,
    chainId: propertyToken.chainId,
    pendingRevenue: 0n,
    claimedRevenue: 0n,
    propertyToken_id: propertyToken.id,
    wallet_id: `${propertyToken.chainId}-${walletAddress}`,
  };
};
