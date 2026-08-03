import { MarketplacePoolFactory } from 'generated';
import { getNewMarketplacePool } from '../helper/MarketplacePool';

MarketplacePoolFactory.MarketplacePoolCreated.contractRegister(
  ({ event, context }) => {
    context.addMarketplacePool(event.params.marketplacePoolAddress);
  },
  {
    preRegisterDynamicContracts: false,
  },
);

MarketplacePoolFactory.MarketplacePoolCreated.handler(async ({ event, context }) => {
  /*  const cpWallet = context.Wallet.get(
      `${event.chainId}-${event.params.cpWallet}`
    );
    if (!cpWallet)
      throw new Error(
        'MarketplacePoolFactoryContract.MarketplacePoolCreated.handler: Wallet not found'
      );

    if (!cpWallet.certifiedPartner_id)
      throw new Error(
        'MarketplacePoolFactoryContract.MarketplacePoolCreated.handler: Certified Partner ID not found'
      ); */
  const marketplacePool = getNewMarketplacePool(event.chainId, event.params.marketplacePoolAddress);

  context.MarketplacePool.set({
    ...marketplacePool,
    certifiedPartnerUrl: event.params.cpUrl,
    certifiedPartnerWallet: event.params.cpWallet,
    certifiedPartnerIdentifier: event.params.cpIdentifier,
    bsWallet: event.params.bsWallet,
    tokenName: event.params.tokenName,
    tokenSymbol: event.params.tokenSymbol,
  });
});
