import { UserCertifiedPartner } from 'generated';

export const getNewUserCertifiedPartner = (
  chainId: number,
  userAddress: string,
  certifiedPartnerAddress: string,
): UserCertifiedPartner => {
  return {
    id: `${chainId}-${userAddress}-${certifiedPartnerAddress}`,
    chainId,
    user_id: `${chainId}-${userAddress}`,
    certifiedPartner_id: `${chainId}-${certifiedPartnerAddress}`,
  };
};
