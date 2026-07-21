import { indexer, DataStorageProxy } from "envio";

indexer.onEvent(
  { contract: "DataStorageProxy", event: "TransferPropertyToCP" },
  async ({ event, context }) => {
  const [cpWallet, propertyToken] = await Promise.all([
    context.Wallet.getOrThrow(
      `${event.chainId}-${event.params.cp}`,
      'DataStorageProxy.TransferPropertyToCP.handler: Wallet not found'
    ),
    context.PropertyToken.getOrThrow(
      `${event.chainId}-${event.params.property}`,
      'DataStorageProxy.TransferPropertyToCP.handler: PropertyToken not found'
    ),
  ]);

  if (!cpWallet.certifiedPartner_id)
    throw new Error(
      'DataStorageProxy.TransferPropertyToCP.handler: Certified Partner ID not found'
    );

  context.PropertyToken.set({
    ...propertyToken,
    certifiedPartner_id: cpWallet.certifiedPartner_id,
    certifiedPartnerWallet_id: cpWallet.id,
  });
}
);
