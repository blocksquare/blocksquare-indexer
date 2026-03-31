import { BlocksquareToken } from 'generated';

import { ZeroAddress, formatUnits } from 'ethers';
import { getNewToken, getNewTokenHolder, getTokenRecord } from '../helper/Token';
import { DEAD_ADDRESS } from '../helper/constants';
import { BigDecimal } from 'generated';
import { formatTo8Decimals } from '../helper/format';

BlocksquareToken.Transfer.handler(async ({ event, context }) => {
  // Skip if value is zero
  if (event.params._amount === 0n) return;

  const fromTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params._from}`;
  const toTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params._to}`;

  const [bstToken, bstUsdAssetPair, loadedFromTokenHolder, loadedToTokenHolder] = await Promise.all(
    [
      context.Token.get(`${event.chainId}-${event.srcAddress}`),
      context.AssetPair.get('BST/USD'),
      context.TokenHolder.get(fromTokenHolderId),
      context.TokenHolder.get(toTokenHolderId),
    ],
  );

  const token = bstToken ?? getNewToken(event.chainId, event.srcAddress, 'BlocksquareToken', 'BST');

  let transferFrom = event.params._from;
  let transferTo = event.params._to;

  const tokenUpdated = {
    ...token,
    totalTransfers: token.totalTransfers + 1,
  };

  // Mint
  if (transferFrom === ZeroAddress) {
    tokenUpdated.totalSupply = tokenUpdated.totalSupply + event.params._amount;
  } else {
    const fromTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params._from}`;
    const fromTokenHolder =
      loadedFromTokenHolder ??
      getNewTokenHolder(event.chainId, fromTokenHolderId, event.srcAddress);

    const newAmount = fromTokenHolder.amount - event.params._amount;
    if (newAmount === 0n) {
      tokenUpdated.totalHolders = tokenUpdated.totalHolders - 1;
      context.TokenHolder.deleteUnsafe(fromTokenHolderId);
    } else {
      context.TokenHolder.set({
        ...fromTokenHolder,
        amount: newAmount,
      });
    }
  }

  // Burn
  if (transferTo === ZeroAddress) {
    tokenUpdated.totalSupply = tokenUpdated.totalSupply - event.params._amount;
    tokenUpdated.totalBurnt = tokenUpdated.totalBurnt + event.params._amount;
  } else {
    // This is a special case as the token is transferred to the dead address
    if (transferTo === DEAD_ADDRESS)
      tokenUpdated.totalBurnt = tokenUpdated.totalBurnt + event.params._amount;

    const toTokenHolderId = `${event.chainId}-${event.srcAddress}-${event.params._to}`;
    let toTokenHolder = loadedToTokenHolder;
    if (!toTokenHolder) {
      toTokenHolder = getNewTokenHolder(event.chainId, toTokenHolderId, event.srcAddress);
      tokenUpdated.totalHolders = tokenUpdated.totalHolders + 1;
    }

    context.TokenHolder.set({
      ...toTokenHolder,
      amount: toTokenHolder.amount + event.params._amount,
    });
  }

  if (bstUsdAssetPair) {
    const marketcapPrecise = BigDecimal(formatUnits(tokenUpdated.totalSupply, 18)).times(
      BigDecimal(bstUsdAssetPair.latestPrice),
    );

    const { formatted: marketcap, formattedBI: marketcapBI } = formatTo8Decimals(marketcapPrecise);

    tokenUpdated.marketcap = marketcap;
    tokenUpdated.marketcapBI = marketcapBI;
  }

  context.Token.set(tokenUpdated);
  context.TokenRecord.set(getTokenRecord(tokenUpdated, event.block.timestamp));
});
