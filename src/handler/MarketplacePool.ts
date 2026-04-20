import { MarketplacePool } from 'generated';
import { getMarketplacePoolRecord, getNewMarketplacePoolPosition } from '../helper/MarketplacePool';
import { getNewWallet } from '../helper/Wallet';
import { MarketplacePoolTransactionType } from '../types/enums';

MarketplacePool.CPInitialized.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.CPInitialized.handler: MarketplacePool not found',
  );

  const marketplacePoolPosition = getNewMarketplacePoolPosition(
    event.chainId,
    event.srcAddress,
    marketplacePool.certifiedPartnerWallet,
  );

  const marketplacePoolUpdated = {
    ...marketplacePool,
    cpAmount: event.params.amount,
    totalDepositAmount: event.params.amount,
    stakedAmount: event.params.amount,
    lockPeriod: Number(event.params.lockPeriod),
    certifiedPartnerPoolPosition_id: marketplacePoolPosition.id,
  };

  context.MarketplacePool.set(marketplacePoolUpdated);

  context.MarketplacePoolPosition.set({
    ...marketplacePoolPosition,
    stakedAmount: event.params.amount,
  });

  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );

  const cpWalletId = `${event.chainId}-${marketplacePool.certifiedPartnerWallet}`;
  const cpWallet = await context.Wallet.get(cpWalletId);
  if (!cpWallet) {
    context.Wallet.set(getNewWallet(event.chainId, marketplacePool.certifiedPartnerWallet));
  }
  context.MarketplacePoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: MarketplacePoolTransactionType.CP_INITIALIZED,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: cpWalletId,
    amount: event.params.amount,
    issuedAmount: undefined,
    reward: undefined,
  });
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );
});

MarketplacePool.Deposit.handler(async ({ event, context }) => {
  const [marketplacePool, marketplacePoolPosition] = await Promise.all([
    context.MarketplacePool.getOrThrow(
      `${event.chainId}-${event.srcAddress}`,
      'MarketplacePool.Deposit.handler: MarketplacePool not found',
    ),
    context.MarketplacePoolPosition.get(
      `${event.chainId}-${event.srcAddress}-${event.params.owner}`,
    ),
  ]);

  const marketplacePoolUpdated = {
    ...marketplacePool,
    totalDepositAmount: marketplacePool.totalDepositAmount + event.params.inAmount,
    stakedAmount: marketplacePool.stakedAmount + event.params.inAmount,
    vAmount: marketplacePool.vAmount + event.params.outAmount,
  };
  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );

  let finalMarketplacePoolPosition = marketplacePoolPosition;
  if (!finalMarketplacePoolPosition) {
    const wallet = await context.Wallet.get(`${event.chainId}-${event.params.owner}`);
    if (!wallet) {
      context.Wallet.set(getNewWallet(event.chainId, event.params.owner));
    }
    finalMarketplacePoolPosition = getNewMarketplacePoolPosition(
      event.chainId,
      event.srcAddress,
      event.params.owner,
    );
  }

  context.MarketplacePoolPosition.set({
    ...finalMarketplacePoolPosition,
    stakedAmount: finalMarketplacePoolPosition.stakedAmount + event.params.inAmount,
    vAmount: finalMarketplacePoolPosition.vAmount + event.params.outAmount,
  });
  context.MarketplacePoolPosition.set({
    ...finalMarketplacePoolPosition,
    stakedAmount: finalMarketplacePoolPosition.stakedAmount + event.params.inAmount,
    vAmount: finalMarketplacePoolPosition.vAmount + event.params.outAmount,
  });

  context.MarketplacePoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: MarketplacePoolTransactionType.DEPOSIT,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: `${event.chainId}-${event.params.owner}`,
    amount: event.params.inAmount,
    issuedAmount: event.params.outAmount,
    reward: undefined,
  });
});

MarketplacePool.Withdraw.handler(async ({ event, context }) => {
  const [marketplacePool, marketplacePoolPosition] = await Promise.all([
    context.MarketplacePool.getOrThrow(
      `${event.chainId}-${event.srcAddress}`,
      'MarketplacePool.Withdraw.handler: MarketplacePool not found',
    ),
    context.MarketplacePoolPosition.getOrThrow(
      `${event.chainId}-${event.srcAddress}-${event.params.owner}`,
      'MarketplacePool.Withdraw.handler: MarketplacePoolPosition not found',
    ),
  ]);

  const marketplacePoolUpdated = {
    ...marketplacePool,
    totalWithdrawAmount: marketplacePool.totalWithdrawAmount + event.params.outAmount,
    stakedAmount: marketplacePool.stakedAmount - event.params.outAmount,
    vAmount: marketplacePool.vAmount - event.params.inAmount,
    totalRewardsClaimed: marketplacePool.totalRewardsClaimed + event.params.reward,
  };
  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );

  context.MarketplacePoolPosition.set({
    ...marketplacePoolPosition,
    stakedAmount: marketplacePoolPosition.stakedAmount - event.params.outAmount,
    vAmount: marketplacePoolPosition.vAmount - event.params.inAmount,
    rewards: marketplacePoolPosition.rewards + event.params.reward,
  });
  context.MarketplacePoolPosition.set({
    ...marketplacePoolPosition,
    stakedAmount: marketplacePoolPosition.stakedAmount - event.params.outAmount,
    vAmount: marketplacePoolPosition.vAmount - event.params.inAmount,
    rewards: marketplacePoolPosition.rewards + event.params.reward,
  });

  context.MarketplacePoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: MarketplacePoolTransactionType.WITHDRAW,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: `${event.chainId}-${event.params.owner}`,
    amount: event.params.outAmount,
    issuedAmount: event.params.inAmount,
    reward: event.params.reward,
  });
});

MarketplacePool.CPCanWithdraw.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.CPCanWithdraw.handler: MarketplacePool not found',
  );

  context.MarketplacePool.set({
    ...marketplacePool,
    certifiedPartnerCanWithdraw: true,
  });
});

MarketplacePool.Capped.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.Capped.handler: MarketplacePool not found',
  );

  context.MarketplacePool.set({
    ...marketplacePool,
    capped: true,
    lockedUntil: Number(event.params.lockEnd),
  });
});

MarketplacePool.Reward.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.Reward.handler: MarketplacePool not found',
  );

  const marketplacePoolUpdated = {
    ...marketplacePool,
    totalRewardsAdded: marketplacePool.totalRewardsAdded + event.params.amount,
  };

  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );
  const rewardWalletId = `${event.chainId}-${event.params.from}`;
  const rewardWallet = await context.Wallet.get(rewardWalletId);
  if (!rewardWallet) {
    context.Wallet.set(getNewWallet(event.chainId, event.params.from));
  }

  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );

  context.MarketplacePoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: MarketplacePoolTransactionType.REWARD,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: rewardWalletId,
    amount: event.params.amount,
    issuedAmount: undefined,
    reward: undefined,
  });
});

MarketplacePool.LockExtended.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.LockExtended.handler: MarketplacePool not found',
  );

  context.MarketplacePool.set({
    ...marketplacePool,
    lockPeriod: marketplacePool.lockPeriod + Number(event.params.extension),
  });
});

MarketplacePool.LiquidateCPCollateral.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.LiquidateCPCollateral.handler: MarketplacePool not found',
  );

  const marketplacePoolUpdated = {
    ...marketplacePool,
    cpAmount: 0n,
    totalWithdrawAmount: marketplacePool.totalWithdrawAmount + event.params.amount,
    isCpCollateralLiquidated: true,
    cpCollateralLiquidatedAt: event.block.timestamp,
  };
  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );
  const marketplacePoolUpdated = {
    ...marketplacePool,
    cpAmount: 0n,
    totalWithdrawAmount: marketplacePool.totalWithdrawAmount + event.params.amount,
    isCpCollateralLiquidated: true,
    cpCollateralLiquidatedAt: event.block.timestamp,
  };
  context.MarketplacePool.set(marketplacePoolUpdated);
  context.MarketplacePoolRecord.set(
    getMarketplacePoolRecord(marketplacePoolUpdated, event.block.timestamp),
  );

  context.MarketplacePoolTransaction.set({
    id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
    chainId: event.chainId,
    pool_id: `${event.chainId}-${event.srcAddress}`,
    transactionType: MarketplacePoolTransactionType.LIQUIDATE_CP_COLLATERAL,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    wallet_id: undefined,
    amount: event.params.amount,
    issuedAmount: undefined,
    reward: undefined,
  });
});

MarketplacePool.PoolCampaignConfigured.handler(async ({ event, context }) => {
  const marketplacePool = await context.MarketplacePool.getOrThrow(
    `${event.chainId}-${event.srcAddress}`,
    'MarketplacePool.PoolCampaignConfigured.handler: MarketplacePool not found',
  );

  context.MarketplacePool.set({
    ...marketplacePool,
    startMaxPledge: event.params.maxPledge,
    startTime: Number(event.params.startTime),
    duration: Number(event.params.duration),
  });
});
