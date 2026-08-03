import { Token, TokenHolder, TokenRecord } from 'generated';
import { getDay, getHour } from './date';

export const getNewToken = (
  chainId: number,
  tokenAddress: string,
  name: string,
  symbol: string,
): Token => {
  return {
    id: `${chainId}-${tokenAddress}`,
    contractAddress: tokenAddress,
    chainId,
    name: name,
    symbol: symbol,
    totalSupply: 0n,
    totalTransfers: 0,
    totalHolders: 0,
    totalBurnt: 0n,
    marketcap: 0,
    marketcapBI: BigInt(0),
  };
};

export const getNewTokenHolder = (
  chainId: number,
  tokenHolderId: string,
  tokenAddress: string,
): TokenHolder => {
  return {
    id: tokenHolderId,
    chainId,
    amount: 0n,
    token_id: `${chainId}-${tokenAddress}`,
  };
};

export const getTokenRecord = (token: Token, timestamp: number): TokenRecord => {
  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  return {
    id: `${token.id}-${hourId}`,
    chainId: token.chainId,
    hourStartTimestamp: hourStart,
    dayStartTimestamp: dayStart,
    token_id: token.id,
    totalSupply: token.totalSupply,
    totalTransfers: token.totalTransfers,
    totalHolders: token.totalHolders,
    totalBurnt: token.totalBurnt,
    marketcap: token.marketcap,
    marketcapBI: token.marketcapBI,
  };
};
