import { indexer } from 'envio';
import { ZeroAddress } from 'ethers';
import {
  calculateWeightedNAVDeviation,
  getNewPropertyTokenHolder,
  getPropertyTokenRecord,
} from '../helper/PropertyToken';
import { getNewWallet } from '../helper/Wallet';

indexer.onEvent({ contract: 'PropertyToken', event: 'Transfer' }, async ({ event, context }) => {
  // Skip if value is 0
  if (event.params.value === 0n) return;

  const fromTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params.from}`;
  const toTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params.to}`;

  const [
    loadedPropertyToken,
    loadedFromTokenHolder,
    loadedToTokenHolder,
    loadedFromWallet,
    loadedToWallet,
  ] = await Promise.all([
    context.PropertyToken.get(`${event.chainId}-${event.srcAddress}`),
    context.PropertyTokenHolder.get(fromTokenHolderId),
    context.PropertyTokenHolder.get(toTokenHolderId),
    context.Wallet.get(`${event.chainId}-${event.params.from}`),
    context.Wallet.get(`${event.chainId}-${event.params.to}`),
  ]);

  if (!loadedPropertyToken)
    throw new Error('PropertyTokenContract_Transfer_handler: PropertyToken not found');

  let transferFrom = event.params.from;
  let transferTo = event.params.to;

  // Handle the case when the transferFrom and transferTo are the same
  if (transferFrom === transferTo) {
    return;
  }

  const propertyTokenUpdated = {
    ...loadedPropertyToken,
    totalTransfers: loadedPropertyToken.totalTransfers + 1,
  };

  // Mint
  if (transferFrom === ZeroAddress) {
    propertyTokenUpdated.totalSupply += event.params.value;
  } else {
    const fromTokenHolderId = `${event.chainId}-${event.srcAddress}-${transferFrom}`;
    let fromTokenHolder = loadedFromTokenHolder;

    if (!fromTokenHolder) {
      // We need to check if a wallet exists. The reason is that the BSPT staking contract doesn't need to be whitelisted.
      if (!loadedFromWallet) {
        context.Wallet.set(getNewWallet(event.chainId, transferFrom));
      }

      fromTokenHolder = getNewPropertyTokenHolder(event.chainId, event.srcAddress, transferFrom);
    }
    const newAmount = fromTokenHolder.amount - event.params.value;
    if (newAmount === 0n) {
      // Only decrement if we had a holder before
      if (fromTokenHolder.amount > 0n) {
        propertyTokenUpdated.totalHolders = Math.max(0, propertyTokenUpdated.totalHolders - 1);
      }
      context.PropertyTokenHolder.deleteUnsafe(fromTokenHolderId);
    } else {
      context.PropertyTokenHolder.set({
        ...fromTokenHolder,
        amount: newAmount,
      });
    }
  }

  // Burn
  if (transferTo === ZeroAddress) {
    propertyTokenUpdated.totalSupply -= event.params.value;
    propertyTokenUpdated.totalBurnt += event.params.value;
  } else if (event.params.value > 0n) {
    let toTokenHolder = loadedToTokenHolder;
    if (!toTokenHolder) {
      // We need to check if a wallet exists. The reason is that the BSPT staking contract doesn't need to be whitelisted.
      if (!loadedToWallet) {
        context.Wallet.set(getNewWallet(event.chainId, transferTo));
      }

      toTokenHolder = getNewPropertyTokenHolder(event.chainId, event.srcAddress, transferTo);
      propertyTokenUpdated.totalHolders += 1;
    }

    context.PropertyTokenHolder.set({
      ...toTokenHolder,
      amount: toTokenHolder.amount + event.params.value,
    });
  }

  const weightedNAVDeviation = calculateWeightedNAVDeviation(
    propertyTokenUpdated.tokenValuation,
    propertyTokenUpdated.propertyValuation,
    propertyTokenUpdated.totalSupply,
  );

  context.PropertyToken.set({ ...propertyTokenUpdated, weightedNAVDeviation });
  context.PropertyTokenRecord.set(
    getPropertyTokenRecord(propertyTokenUpdated, event.block.timestamp),
  );
});

// Transfer history log, derived purely from event data.
indexer.onEvent({ contract: 'PropertyToken', event: 'Transfer' }, async ({ event, context }) => {
  if (event.params.value === 0n || event.params.from === event.params.to) return;

  context.PropertyTokenTransfer.set({
    id: `${event.chainId}-${event.srcAddress}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    amount: event.params.value,
    blockHash: event.block.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    logIndex: event.logIndex,
    transactionHash: event.transaction.hash,
    transactionIndex: event.transaction.transactionIndex,
    propertyToken_id: `${event.chainId}-${event.srcAddress}`,
    from_id: `${event.chainId}-${event.params.from}`,
    to_id: `${event.chainId}-${event.params.to}`,
  });
});

indexer.onEvent(
  { contract: 'PropertyToken', event: 'CapitalStackChange' },
  async ({ event, context }) => {
    context.PropertyTokenCapitalStack.set({
      id: `${event.chainId}-${event.srcAddress}-${event.logIndex}`,
      chainId: event.chainId,
      timestamp: event.block.timestamp,
      property_id: `${event.chainId}-${event.srcAddress}`,
      tokenizationAmount: event.params.tokenizationAmount,
      commonEquity: event.params.commonEquity,
      preferredEquity: event.params.preferredEquity,
      mezzanine: event.params.mezzanine,
      juniorDebt: event.params.juniorDebt,
      seniorDebt: event.params.seniorDebt,
    });
  },
);
