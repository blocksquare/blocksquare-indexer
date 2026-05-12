import { DataStorageProxy } from 'generated';
import {MOCK_PROPERTY_ADDRESS} from "../helper/PropertyToken";

DataStorageProxy.TransferPropertyToCP.handler(async ({ event, context }) => {
  // Skip handling mock property token. Temporary fix until v2 contracts are deployed.
  if (event.params.property === MOCK_PROPERTY_ADDRESS) return;

  const [cpWallet, propertyToken] = await Promise.all([
    context.Wallet.getOrThrow(
      `${event.chainId}-${event.params.cp}`,
      'DataStorageProxy.TransferPropertyToCP.handler: Wallet not found',
    ),
    context.PropertyToken.getOrThrow(
      `${event.chainId}-${event.params.property}`,
      'DataStorageProxy.TransferPropertyToCP.handler: PropertyToken not found',
    ),
  ]);

  if (!cpWallet.certifiedPartner_id)
    throw new Error(
      'DataStorageProxy.TransferPropertyToCP.handler: Certified Partner ID not found',
    );

  context.PropertyToken.set({
    ...propertyToken,
    certifiedPartner_id: cpWallet.certifiedPartner_id,
    certifiedPartnerWallet_id: cpWallet.id,
  });
});
