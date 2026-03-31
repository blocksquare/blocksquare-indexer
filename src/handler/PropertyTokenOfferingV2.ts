import { PropertyTokenOfferingV2 } from 'generated';
import {
  ensureOfferingV2,
  getMainSaleId,
  getOfferingV2Id,
  getPresaleId,
} from '../helper/PropertyTokenOfferingV2';

// ─── MainSaleAdded ──────────────────────────────────────────────────────────────

PropertyTokenOfferingV2.MainSaleAdded.handler(async ({ event, context }) => {
  const { params } = event;

  await ensureOfferingV2(event.chainId, params.property, context);

  context.MainSaleOffering.set({
    id: getMainSaleId(event.chainId, params.property, params.mainSaleId),
    chainId: event.chainId,
    offering_id: getOfferingV2Id(event.chainId, params.property),
    startDateTimestamp: Number(params.startDate),
    endDateTimestamp: Number(params.endDate),
    maxInvestment: params.maxInvestment,
    minInvestment: params.minInvestment,
    mintedAmount: 0n,
    pricePerToken: params.pricePerToken,
    assetPriceIdentifier: params.assetPriceIdentifier,
    softCap: params.softCap,
    hardCap: params.hardCap,
    collector: params.collector,
    feeCollector: params.feeCollector,
    fee: params.fee,
    investmentTokens: params.investmentTokens,
    status: 'active',
  });
});

// ─── PresaleAdded ───────────────────────────────────────────────────────────────

PropertyTokenOfferingV2.PresaleAdded.handler(async ({ event, context }) => {
  const { params } = event;

  await ensureOfferingV2(event.chainId, params.property, context);

  context.PresaleOffering.set({
    id: getPresaleId(event.chainId, params.property, params.presaleId),
    chainId: event.chainId,
    offering_id: getOfferingV2Id(event.chainId, params.property),
    startDateTimestamp: Number(params.startDate),
    endDateTimestamp: Number(params.endDate),
    maxInvestment: params.maxInvestment,
    minInvestment: params.minInvestment,
    pricePerToken: params.pricePerToken,
    softCap: params.softCap,
    hardCap: params.hardCap,
    totalMintedAmount: 0n,
    status: 'active',
  });
});

// ─── Invested ───────────────────────────────────────────────────────────────────

PropertyTokenOfferingV2.Invested.handler(async ({ event, context }) => {
  const { params } = event;

  const mainSaleId = getMainSaleId(event.chainId, params.property, params.mainSaleId);
  const [mainSale, wallet] = await Promise.all([
    context.MainSaleOffering.getOrThrow(
      mainSaleId,
      'PropertyTokenOfferingV2.Invested: MainSale not found',
    ),
    context.Wallet.getOrThrow(
      `${event.chainId}-${params.wallet}`,
      'PropertyTokenOfferingV2.Invested: Wallet not found',
    ),
  ]);

  context.MainSaleOffering.set({
    ...mainSale,
    mintedAmount: mainSale.mintedAmount + params.amountReceived,
  });

  context.MainSaleInvestment.set({
    id: `${event.chainId}-${params.property}-${params.mainSaleId}-${params.wallet}-${event.transaction.hash}`,
    chainId: event.chainId,
    transactionHash: event.transaction.hash,
    mainSaleOffering_id: mainSaleId,
    propertyToken_id: `${event.chainId}-${params.property}`,
    wallet_id: wallet.id,
    investmentToken: params.investmentToken,
    amountInvested: params.amountInvested,
    amountReceived: params.amountReceived,
  });
});

// ─── PresaleTokensMinted ────────────────────────────────────────────────────────

PropertyTokenOfferingV2.PresaleTokensMinted.handler(async ({ event, context }) => {
  const { params } = event;

  const presaleId = getPresaleId(event.chainId, params.property, params.presaleId);
  const presale = await context.PresaleOffering.getOrThrow(
    presaleId,
    'PropertyTokenOfferingV2.PresaleTokensMinted: Presale not found',
  );

  context.PresaleOffering.set({
    ...presale,
    totalMintedAmount: params.totalMintedAmount,
    status: 'finished',
  });
});

// ─── ClaimInvestment ────────────────────────────────────────────────────────────

PropertyTokenOfferingV2.ClaimInvestment.handler(async ({ event, context }) => {
  const { params } = event;

  const mainSaleId = getMainSaleId(event.chainId, params.property, params.mainSaleId);
  const mainSale = await context.MainSaleOffering.getOrThrow(
    mainSaleId,
    'PropertyTokenOfferingV2.ClaimInvestment: MainSale not found',
  );

  context.MainSaleOffering.set({
    ...mainSale,
    status: 'finished',
  });
});

// ─── MainSaleCanceled ───────────────────────────────────────────────────────────

PropertyTokenOfferingV2.MainSaleCanceled.handler(async ({ event, context }) => {
  const { params } = event;

  const mainSaleId = getMainSaleId(event.chainId, params.property, params.mainSaleId);
  const mainSale = await context.MainSaleOffering.getOrThrow(
    mainSaleId,
    'PropertyTokenOfferingV2.MainSaleCanceled: MainSale not found',
  );

  context.MainSaleOffering.set({
    ...mainSale,
    status: 'canceled',
  });
});

// ─── PresaleCanceled ────────────────────────────────────────────────────────────

PropertyTokenOfferingV2.PresaleCanceled.handler(async ({ event, context }) => {
  const { params } = event;

  const presaleId = getPresaleId(event.chainId, params.property, params.presaleId);
  const presale = await context.PresaleOffering.getOrThrow(
    presaleId,
    'PropertyTokenOfferingV2.PresaleCanceled: Presale not found',
  );

  context.PresaleOffering.set({
    ...presale,
    status: 'canceled',
  });
});

// ─── MainSaleInvestmentsRefunded fires one if not get minCap ────────────────────────────────────────────────

PropertyTokenOfferingV2.MainSaleInvestmentsRefunded.handler(async ({ event, context }) => {
  const { params } = event;

  const mainSaleId = getMainSaleId(event.chainId, params.property, params.mainSaleId);
  const mainSale = await context.MainSaleOffering.getOrThrow(
    mainSaleId,
    'PropertyTokenOfferingV2.MainSaleInvestmentsRefunded: MainSale not found',
  );

  context.MainSaleOffering.set({
    ...mainSale,
    status: 'refunded',
  });
});

// ─── PresaleInvestmentsRefunded ─────────────────────────────────────────────────

PropertyTokenOfferingV2.PresaleInvestmentsRefunded.handler(async ({ event, context }) => {
  const { params } = event;

  const presaleId = getPresaleId(event.chainId, params.property, params.presaleId);
  const presale = await context.PresaleOffering.getOrThrow(
    presaleId,
    'PropertyTokenOfferingV2.PresaleInvestmentsRefunded: Presale not found',
  );

  context.PresaleOffering.set({
    ...presale,
    status: 'refunded',
  });
});
