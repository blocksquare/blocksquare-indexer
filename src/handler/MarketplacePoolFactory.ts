import { indexer, MarketplacePoolFactory } from "envio";
import { getNewMarketplacePool } from '../helper/MarketplacePool';

indexer.contractRegister(
  { contract: "MarketplacePoolFactory", event: "MarketplacePoolCreated" },
  async ({ event, context }) => {
    context.chain.MarketplacePool.add(event.params.marketplacePoolAddress);
  }
);

indexer.onEvent(
  { contract: "MarketplacePoolFactory", event: "MarketplacePoolCreated" },
  async ({ event, context }) => {
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
    const marketplacePool = getNewMarketplacePool(
      event.chainId,
      event.params.marketplacePoolAddress
    );

    context.MarketplacePool.set({
      ...marketplacePool,
      certifiedPartnerUrl: event.params.cpUrl,
      certifiedPartnerWallet: event.params.cpWallet,
      certifiedPartnerIdentifier: event.params.cpIdentifier,
      bsWallet: event.params.bsWallet,
      tokenName: event.params.tokenName,
      tokenSymbol: event.params.tokenSymbol,
    });
  }
);
