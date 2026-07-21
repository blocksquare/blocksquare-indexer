import { indexer, PropertyFactory } from "envio";
import { getNewPropertyToken } from '../helper/PropertyToken';

indexer.contractRegister(
  { contract: "PropertyFactory", event: "NewPropToken" },
  async ({ event, context }) => {
    context.chain.PropertyToken.add(event.params.proptoken);
  }
);

indexer.onEvent(
  { contract: "PropertyFactory", event: "NewPropToken" },
  async ({ event, context }) => {
  const cpWallet = await context.Wallet.getOrThrow(
    `${event.chainId}-${event.params.certifiedPartner}`,
    'PropertyFactory.NewPropToken.handler: Wallet not found'
  );

  if (!cpWallet.certifiedPartner_id)
    throw new Error(
      'PropertyFactory.NewPropToken.handler: Certified Partner ID not found'
    );

  const propertyTokenLoaded = getNewPropertyToken(
    event.chainId,
    event.params.proptoken,
    cpWallet.certifiedPartner_id,
    cpWallet.id
  );

  context.PropertyToken.set({
    ...propertyTokenLoaded,
    createdAt: event.block.timestamp,
    createdAtBlock: event.block.number,
    creationTransaction: event.transaction.hash,
  });
}
);
