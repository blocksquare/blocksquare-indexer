import {
  BigDecimal,
  GovernancePool_Deposit_eventArgs,
  GovernancePool_Reward_eventArgs,
  GovernancePool_Withdraw_eventArgs,
  LiquidityStakingPool_Deposit_eventArgs,
  LiquidityStakingPool_Reward_eventArgs,
  LiquidityStakingPool_Withdraw_eventArgs,
  StakingPool,
  StakingPoolPosition,
  StakingPoolPositionRecord,
  StakingPoolRecord,
  eventLog,
  handlerContext,
} from 'generated';

import {ensureWallet, getNewWallet} from './Wallet';
import { TWO_DAYS_IN_SECONDS } from './constants';
import { getDay, getHour } from './date';
import { StakingPoolTransactionType } from '../types/enums';

export const getNewStakingPool = (poolId: string, chainId: number): StakingPool => {
  return {
    id: `${chainId}-${poolId}`,
    chainId,
    issuedAmount: 0n,
    stakedAmount: 0n,
    currentAmount: 0n,
    totalDepositAmount: 0n,
    totalRewards: 0n,
    totalWithdrawAmount: 0n,
    ratio: BigDecimal(0),
  };
};

export const getNewStakingPoolPosition = (
  chainId: number,
  poolAddress: string,
  walletAddress: string,
): StakingPoolPosition => {
  return {
    id: `${chainId}-${poolAddress}-${walletAddress}`,
    chainId,
    stakedAmount: 0n,
    issuedAmount: 0n,
    lockedUntil: 0,
    wallet_id: `${chainId}-${walletAddress}`,
    pool_id: `${chainId}-${poolAddress}`,
  };
};

export const calculatePoolRatio = (pool: StakingPool): BigDecimal => {
  if (pool.issuedAmount === 0n) return BigDecimal(1);

  const ratio = BigDecimal(pool.currentAmount.toString()).div(pool.issuedAmount.toString());

  return ratio;
};

export const getStakingPoolPositionRecord = (
  chainId: number,
  poolAddress: string,
  walletAddress: string,
  issuedAmount: bigint,
  ratio: BigDecimal,
  event: {
    transaction: { hash: string };
    logIndex: number;
    block: { timestamp: number; number: number };
  },
): StakingPoolPositionRecord => {
  return {
    id: `${chainId}-${poolAddress}-${walletAddress}-${event.transaction.hash}-${event.logIndex}`,
    chainId,
    pool_id: `${chainId}-${poolAddress}`,
    walletAddress,
    issuedAmount,
    ratio,
    blockTimestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  };
};

export const getStakingPoolRecord = (pool: StakingPool, timestamp: number): StakingPoolRecord => {
  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  return {
    id: `${pool.id}-${hourId}`,
    chainId: pool.chainId,
    hourStartTimestamp: hourStart,
    dayStartTimestamp: dayStart,
    issuedAmount: pool.issuedAmount,
    stakedAmount: pool.stakedAmount,
    ratio: pool.ratio,
    currentAmount: pool.currentAmount,
    totalDepositAmount: pool.totalDepositAmount,
    totalRewards: pool.totalRewards,
    totalWithdrawAmount: pool.totalWithdrawAmount,
    pool_id: pool.id,
  };
};

export const StakingDepositHandler = async (
  event: eventLog<GovernancePool_Deposit_eventArgs | LiquidityStakingPool_Deposit_eventArgs>,
  context: handlerContext,
) => {
  const stakingPool = await context.StakingPool.getOrCreate(
    getNewStakingPool(event.srcAddress, event.chainId),
  );

  const newStakingPoolData = {
    ...stakingPool,
    chainId: event.chainId,
    currentAmount: stakingPool.currentAmount + event.params.inAmount,
    issuedAmount: stakingPool.issuedAmount + event.params.outAmount,
    stakedAmount: stakingPool.stakedAmount + event.params.inAmount,
    totalDepositAmount: stakingPool.totalDepositAmount + event.params.inAmount,
    ratio: calculatePoolRatio(stakingPool),
  };

  context.StakingPool.set(newStakingPoolData);
  context.StakingPoolRecord.set(getStakingPoolRecord(newStakingPoolData, event.block.timestamp));

  let stakingPoolPosition = await context.StakingPoolPosition.get(
    `${event.chainId}-${event.srcAddress}-${event.params.owner}`,
  );

  if (!stakingPoolPosition) {
    const wallet = await context.Wallet.get(`${event.chainId}-${event.params.owner}`);
    if (!wallet) {
      context.Wallet.set(getNewWallet(event.chainId, event.params.owner));
    }
    stakingPoolPosition = getNewStakingPoolPosition(
      event.chainId,
      event.srcAddress,
      event.params.owner,
    );
  }

  const tempLockedUntil = (event as eventLog<LiquidityStakingPool_Deposit_eventArgs>).params
    .lockedUntil;

  const lockedUntil = tempLockedUntil
    ? Number(tempLockedUntil)
    : event.block.timestamp + TWO_DAYS_IN_SECONDS;

  const newIssuedAmount = stakingPoolPosition.issuedAmount + event.params.outAmount;
  context.StakingPoolPosition.set({
    ...stakingPoolPosition,
    stakedAmount: stakingPoolPosition.stakedAmount + event.params.inAmount,
    issuedAmount: newIssuedAmount,
    lockedUntil,
  });
  context.StakingPoolPositionRecord.set(
    getStakingPoolPositionRecord(event.chainId, event.srcAddress, event.params.owner, newIssuedAmount, newStakingPoolData.ratio, event),
  );

  const { start: dayStart } = getDay(event.block.timestamp);

  context.StakingPoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: StakingPoolTransactionType.DEPOSIT,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: `${event.chainId}-${event.params.owner}`,
    amount: event.params.inAmount,
    issuedAmount: event.params.outAmount,
    dayStartTimestamp: dayStart
  });
};

export const StakingRewardHandler = async (
  event: eventLog<GovernancePool_Reward_eventArgs | LiquidityStakingPool_Reward_eventArgs>,
  context: handlerContext,
) => {
  const stakingPool = await context.StakingPool.get(`${event.chainId}-${event.srcAddress}`);

  if (!stakingPool) throw new Error('StakingRewardHandler: StakingPool not found');

  const newStakingPoolData = {
    ...stakingPool,
    currentAmount: stakingPool.currentAmount + event.params.amount,
    totalRewards: stakingPool.totalRewards + event.params.amount,
    ratio: calculatePoolRatio(stakingPool),
  };

  const rewardWalletId = await ensureWallet(context, event.chainId, event.params.from);

  context.StakingPool.set(newStakingPoolData);
  context.StakingPoolRecord.set(getStakingPoolRecord(newStakingPoolData, event.block.timestamp));

  const { start: dayStart } = getDay(event.block.timestamp);

  context.StakingPoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: StakingPoolTransactionType.REWARD,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: rewardWalletId,
    amount: event.params.amount,
    issuedAmount: undefined,
    dayStartTimestamp: dayStart
  });
};

export const StakingWithdrawHandler = async (
  event: eventLog<GovernancePool_Withdraw_eventArgs | LiquidityStakingPool_Withdraw_eventArgs>,
  context: handlerContext,
) => {
  // Edge case: Some users attempt zero-value withdrawals without having any token balance
  // Example TX: 0x1e546e039bf5e32b0f223ffb19dcfac10d8d714b5b3fc35f0da20602d71641ea
  if (event.params.inAmount === 0n) return;

  const stakingPool = await context.StakingPool.get(`${event.chainId}-${event.srcAddress}`);
  if (!stakingPool) throw new Error('StakingWithdrawHandler: StakingPool not found');

  const newStakingPoolData = {
    ...stakingPool,
    currentAmount: stakingPool.currentAmount - event.params.outAmount,
    issuedAmount: stakingPool.issuedAmount - event.params.inAmount,
    stakedAmount: stakingPool.stakedAmount - event.params.outAmount,
    totalWithdrawAmount: stakingPool.totalWithdrawAmount + event.params.outAmount,
    ratio: calculatePoolRatio(stakingPool),
  };

  context.StakingPool.set(newStakingPoolData);
  context.StakingPoolRecord.set(getStakingPoolRecord(newStakingPoolData, event.block.timestamp));

  const stakingPoolPositionId = `${event.chainId}-${event.srcAddress}-${event.params.owner}`;

  const stakingPoolPosition = await context.StakingPoolPosition.get(stakingPoolPositionId);
  if (!stakingPoolPosition)
    throw new Error('StakingWithdrawHandler: StakingPoolPosition not found');

  const newIssuedAmount = stakingPoolPosition.issuedAmount - event.params.inAmount;
  const newStakedAmount = stakingPoolPosition.stakedAmount - event.params.outAmount;

  if (newIssuedAmount === 0n || newStakedAmount === 0n) {
    context.StakingPoolPosition.deleteUnsafe(stakingPoolPositionId);
    context.StakingPoolPositionRecord.set(
      getStakingPoolPositionRecord(event.chainId, event.srcAddress, event.params.owner, 0n, newStakingPoolData.ratio, event),
    );
  } else {
    context.StakingPoolPosition.set({
      ...stakingPoolPosition,
      issuedAmount: newIssuedAmount,
      stakedAmount: newStakedAmount,
    });
    context.StakingPoolPositionRecord.set(
      getStakingPoolPositionRecord(event.chainId, event.srcAddress, event.params.owner, newIssuedAmount, newStakingPoolData.ratio, event),
    );
  }

  const { start: dayStart } = getDay(event.block.timestamp);

  context.StakingPoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: StakingPoolTransactionType.WITHDRAW,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: `${event.chainId}-${event.params.owner}`,
    amount: event.params.outAmount,
    issuedAmount: event.params.inAmount,
    dayStartTimestamp: dayStart
  });
};
