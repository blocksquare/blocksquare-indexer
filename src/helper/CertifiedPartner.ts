import { CertifiedPartner } from "envio";

export const getNewCertifiedPartner = (
  chainId: number,
  partnerId: string
): CertifiedPartner => {
  return {
    id: `${chainId}-${partnerId}`,
    chainId,
    name: '',
  };
};
