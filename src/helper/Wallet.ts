import { EvmOnEventContext, Wallet } from "envio";

export const getNewWallet = (chainId: number, walletAddress: string): Wallet => {
  return {
    id: `${chainId}-${walletAddress}`,
    address: walletAddress,
    chainId,
    user_id: undefined,
    certifiedPartner_id: undefined,
  };
};

export const ensureWallet = async (context: EvmOnEventContext, chainId: number, address: string) => {
  const walletId = `${chainId}-${address}`;
  const wallet = await context.Wallet.get(walletId);
  if (!wallet) {
    context.Wallet.set(getNewWallet(chainId, address));
  }
  return walletId;
};
