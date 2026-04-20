import { MarketplacePoolPosition, MarketplacePoolRecord } from 'generated';
import { getDay, getHour } from './date';
import { MarketplacePool } from 'generated/src/Types.gen';

export const getNewMarketplacePool = (
  chainId: number,
  marketplaceAddress: string
): MarketplacePool => {
  return {
    id: `${chainId}-${marketplaceAddress}`,
    contractAddress: marketplaceAddress,
    chainId,
    capped: false,
    certifiedPartnerCollateralAmount: 0n,
    certifiedPartnerCanWithdraw: false,
    certifiedPartnerIdentifier: '',
    certifiedPartnerUrl: '',
    certifiedPartnerWallet: '',
    bsWallet: '',
    duration: 0,
    lockPeriod: 0,
    lockedUntil: 0,
    stakedAmount: 0n,
    totalDepositAmount: 0n,
    totalWithdrawAmount: 0n,
    startMaxPledge: 0n,
    startTime: 0,
    tokenName: '',
    tokenSymbol: '',
    totalRewardsAdded: 0n,
    totalRewardsClaimed: 0n,
    vAmount: 0n,
    certifiedPartnerPoolPosition_id: '',
    isCpCollateralLiquidated: false,
    cpCollateralLiquidatedAt: 0,
  };
};

export const getMarketplacePoolRecord = (
  pool: MarketplacePool,
  timestamp: number
): MarketplacePoolRecord => {
  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  return {
    id: `${pool.id}-${hourId}`,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    chainId: pool.chainId,
    stakedAmount: pool.stakedAmount,
    totalDepositAmount: pool.totalDepositAmount,
    totalWithdrawAmount: pool.totalWithdrawAmount,
    totalRewardsAdded: pool.totalRewardsAdded,
    totalRewardsClaimed: pool.totalRewardsClaimed,
    vAmount: pool.vAmount,
    pool_id: pool.id,
  };
};

export const getNewMarketplacePoolPosition = (
  chainId: number,
  poolAddress: string,
  walletAddress: string
): MarketplacePoolPosition => {
  return {
    id: `${chainId}-${poolAddress}-${walletAddress}`,
    chainId,
    stakedAmount: 0n,
    vAmount: 0n,
    rewards: 0n,
    wallet_id: `${chainId}-${walletAddress}`,
    pool_id: `${chainId}-${poolAddress}`,
  };
};
