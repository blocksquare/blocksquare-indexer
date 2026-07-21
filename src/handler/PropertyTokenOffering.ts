import { indexer, PropertyTokenInvestment, PropertyTokenOffering } from "envio";

import { THREE_DAYS_IN_SECONDS } from '../helper/constants';
import { type PropertyTokenOffering } from "envio";

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "InitialOffer" },
  async ({ event, context }) => {
  const property = await context.PropertyToken.getOrThrow(
    `${event.chainId}-${event.params.property}`,
    'PropertyTokenOffering.InitialOffer: Property not found'
  );

  const newPropertyTokenOffering: PropertyTokenOfferingType = {
    id: `${event.chainId}-${event.params.property}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    property_id: `${event.chainId}-${event.params.property}`,
    price: Number(event.params.pricePerToken),
    presaleMaxInvestment: event.params.presaleMaxInvestment,
    presaleMinInvestment: event.params.presaleMinInvestment,
    maxInvestment: event.params.maxInvestment,
    minInvestment: event.params.minInvestment,
    softCap: event.params.softCap,
    presaleStartTimestamp: Number(event.params.presaleStart),
    presaleEndTimestamp: Number(event.params.presaleEnd),
    saleStartTimestamp: Number(event.params.presaleEnd) + THREE_DAYS_IN_SECONDS,
    saleEndTimestamp: Number(event.params.saleEnd),
    investmentToken: event.params.investmentCurrency,
    collector: event.params.collector,
    feeCollector: event.params.feeCollector,
    fee: event.params.fee,
    status: 'active',
  };

  context.PropertyTokenOffering.set(newPropertyTokenOffering);

  context.PropertyToken.set({
    ...property,
    latestOffering_id: newPropertyTokenOffering.id,
  });
}
);

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "InitialOfferingCanceled" },
  async ({ event, context }) => {
    const property = await context.PropertyToken.getOrThrow(
      `${event.chainId}-${event.params.property}`,
      'PropertyTokenOffering.InitialOfferingCanceled: Property not found'
    );

    //Get active offering
    const activeOffering = await context.PropertyTokenOffering.getOrThrow(
      property.latestOffering_id,
      'PropertyTokenOffering.InitialOfferingCanceled: Offering not found'
    );

    context.PropertyTokenOffering.set({
      ...activeOffering,
      status: 'canceled',
    });
  }
);

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "Invested" },
  async ({ event, context }) => {
  const wallet = await context.Wallet.getOrThrow(
    `${event.chainId}-${event.params.wallet}`,
    'PropertyTokenOffering.Invested: Wallet not found'
  );

  const propertyInvestment: PropertyTokenInvestment = {
    id: `${event.chainId}-${event.params.property}-${event.params.wallet}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    transactionHash: event.transaction.hash,
    propertyToken_id: `${event.chainId}-${event.params.property}`,
    wallet_id: wallet.id,
    investmentToken: event.params.investmentToken,
    amountInvested: event.params.amountInvested,
    amountReceived: event.params.amountReceived,
    blockTimestamp: event.block.timestamp,
  };

  context.PropertyTokenInvestment.set(propertyInvestment);
}
);

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "ClaimInvestment" },
  async ({ event, context }) => {
  //property, collected, fee
  const property = await context.PropertyToken.getOrThrow(
    `${event.chainId}-${event.params.property}`,
    'PropertyTokenOffering.ClaimInvestment: Property not found'
  );

  const propertyTokenOffering = await context.PropertyTokenOffering.getOrThrow(
    property.latestOffering_id,
    'PropertyTokenOffering.ClaimInvestment: Offering not found'
  );

  context.PropertyTokenOffering.set({
    ...propertyTokenOffering,
    status: 'finished',
  });
}
);

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "ReturnedPresaleInvestment" },
  async ({ event, context }) => {
    const property = await context.PropertyToken.getOrThrow(
      `${event.chainId}-${event.params.property}`,
      'PropertyTokenOffering.ReturnedPresaleInvestment: property not found'
    );

    const propertyTokenOffering =
      await context.PropertyTokenOffering.getOrThrow(
        property.latestOffering_id,
        'PropertyTokenOffering.ReturnedPresaleInvestment: Offering not found'
      );

    context.PropertyTokenOffering.set({
      ...propertyTokenOffering,
      status: 'failed',
    });
  }
);

indexer.onEvent(
  { contract: "PropertyTokenOffering", event: "ReturnedInvestment" },
  async ({ event, context }) => {
  const property = await context.PropertyToken.getOrThrow(
    `${event.chainId}-${event.params.property}`,
    'PropertyTokenOffering.ReturnedInvestment: property not found'
  );

  const propertyTokenOffering = await context.PropertyTokenOffering.getOrThrow(
    property.latestOffering_id,
    'PropertyTokenOffering.ReturnedInvestment: Offering not found'
  );

  context.PropertyTokenOffering.set({
    ...propertyTokenOffering,
    status: 'failed',
  });
}
);
