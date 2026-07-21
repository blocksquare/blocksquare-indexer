import { PropertyTokenRevenue } from "envio";
import { type PropertyToken } from "envio";

export const getNewPropertyTokenRevenue = (
  propertyToken: PropertyToken,
  walletAddress: string,
  contractAddress: string,
): PropertyTokenRevenue => {
  return {
    id: `${propertyToken.id}-${contractAddress}-${walletAddress}`,
    chainId: propertyToken.chainId,
    contractAddress,
    pendingRevenue: 0n,
    claimedRevenue: 0n,
    propertyToken_id: propertyToken.id,
    wallet_id: `${propertyToken.chainId}-${walletAddress}`,
  };
};
