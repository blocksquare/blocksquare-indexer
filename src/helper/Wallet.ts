import { Wallet } from 'generated';

export const getNewWallet = (chainId: number, walletAddress: string): Wallet => {
  return {
    id: `${chainId}-${walletAddress}`,
    address: walletAddress,
    chainId,
    user_id: undefined,
    certifiedPartner_id: undefined,
  };
};
