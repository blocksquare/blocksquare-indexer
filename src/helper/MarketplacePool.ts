import { MarketplacePoolPosition, MarketplacePoolRecord, MarketplacePoolTransaction } from 'generated';
import { getDay, getHour } from './date';
import { MarketplacePool } from 'generated/src/Types.gen';

type TransactionBase = {
  chainId: number;
  poolId: string;
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: number;
  logIndex: number;
};

const buildTransaction = (
  base: TransactionBase,
  transactionType: MarketplacePoolTransaction['transactionType'],
  amount: bigint,
  walletId: string | undefined,
  issuedAmount?: bigint,
  reward?: bigint
): MarketplacePoolTransaction => ({
  id: `${base.transactionHash}-${base.logIndex}`,
  chainId: base.chainId,
  pool_id: `${base.chainId}-${base.poolId}`,
  transactionType,
  transactionHash: base.transactionHash,
  blockNumber: base.blockNumber,
  blockTimestamp: base.blockTimestamp,
  wallet_id: walletId,
  amount,
  issuedAmount,
  reward,
});

export const getMarketplacePoolCPInitializedTransaction = (
  base: TransactionBase,
  walletId: string,
  amount: bigint
): MarketplacePoolTransaction =>
  buildTransaction(base, 'CP_INITIALIZED' as const, amount, walletId);

export const getMarketplacePoolDepositTransaction = (
  base: TransactionBase,
  walletId: string,
  amount: bigint,
  issuedAmount: bigint
): MarketplacePoolTransaction =>
  buildTransaction(base, 'DEPOSIT' as const, amount, walletId, issuedAmount);

export const getMarketplacePoolWithdrawTransaction = (
  base: TransactionBase,
  walletId: string,
  amount: bigint,
  issuedAmount: bigint,
  reward: bigint
): MarketplacePoolTransaction =>
  buildTransaction(base, 'WITHDRAW' as const, amount, walletId, issuedAmount, reward);

export const getMarketplacePoolRewardTransaction = (
  base: TransactionBase,
  walletId: string,
  amount: bigint
): MarketplacePoolTransaction =>
  buildTransaction(base, 'REWARD' as const, amount, walletId);

export const getMarketplacePoolLiquidateCPCollateralTransaction = (
  base: TransactionBase,
  amount: bigint
): MarketplacePoolTransaction =>
  buildTransaction(base, 'LIQUIDATE_CP_COLLATERAL' as const, amount, undefined);

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
