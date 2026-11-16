import type {
  EvmEvent,
  EvmOnEventContext,
  StakingPoolV4,
  StakingPoolV4PositionRecord,
  UniswapV4PositionToken,
  UserCumulativeReward,
} from 'envio';

import { getDay } from './date';
import { getLoadedConfig } from '../config';
import { BOOST_PRECISION } from './UniswapV4Helpers/utils';
import { getActivePositionValue } from './UniswapV4Helpers/liquidityAmounts';
import { StakingPoolV4PositionRecordType } from '../types/enums';

const SECONDS_PER_DAY = 86400n;

export const getStakingPoolId = (chainId: number, contractAddress: string) =>
  `${chainId}-${contractAddress}`;

/**
 * The v4 position record of a PositionManager NFT. The PositionManager uses salt = bytes32(tokenId),
 * so ModifyLiquidity can key it by token id, the same id the NFT's Transfer handler links to.
 */
export const getUniswapV4PoolPositionId = (chainId: number, tokenId: bigint) => `${chainId}-${tokenId}`;

/** One staking position per (owner, NFT): a re-deposit by the same owner reopens it. */
export const getStakingPositionId = (chainId: number, owner: string, tokenId: bigint) =>
  `${chainId}-${owner}-${tokenId}`;

type StakingEventMeta = {
  chainId: number;
  logIndex: number;
  block: { number: number; timestamp: number };
  transaction: { hash: string };
};

/**
 * Writes one entry of a token's staking history (deposit, withdrawal, claim or burn).
 * Keyed by (blockNumber, logIndex), which is unique per chain: an hour bucket is not, because
 * logIndex only counts logs within one block.
 */
export const writeStakingHistoryRecord = (
  context: EvmOnEventContext,
  event: StakingEventMeta,
  record: Pick<
    StakingPoolV4PositionRecord,
    'tokenId' | 'epoch' | 'transactionType' | 'pool_id' | 'stakingPosition_id' | 'wallet_id'
  > &
    Partial<Pick<StakingPoolV4PositionRecord, 'rewardsClaimed' | 'rewardsBurned'>>,
) => {
  const {
    chainId,
    logIndex,
    block: { number: blockNumber, timestamp },
    transaction: { hash },
  } = event;
  context.StakingPoolV4PositionRecord.set({
    id: `${record.pool_id}-${record.tokenId}-${blockNumber}-${logIndex}`,
    chainId,
    transactionHash: hash,
    blockNumber,
    blockTimestamp: timestamp,
    dayStartTimestamp: getDay(timestamp).start,
    rewardsClaimed: 0n,
    rewardsBurned: 0n,
    ...record,
  });
};

/**
 * Cumulative rewards belong to one deposit of the NFT, not to the wallet that staked it: every
 * deposit starts a new epoch, the contract verifies leaves of (tokenId, epoch, cumulativeReward)
 * and tracks `totalClaimedRewards[tokenId][epoch]`. Keying the record by (tokenId, epoch) keeps
 * each deposit's total and slash separate, and intact across withdrawals and resales.
 */
export const getRewardRecordId = (stakingPoolId: string, tokenId: bigint, epoch: bigint) =>
  `${stakingPoolId}-${tokenId}-${epoch}`;

/**
 * A reward record with nothing earned, claimed or burned yet. It gets no leaf until its
 * cumulativeReward is above zero.
 */
export const getNewUserCumulativeReward = ({
  tokenId,
  epoch,
  walletId,
  stakingPoolId,
  uniPositionId,
  blockNumber,
}: {
  tokenId: bigint;
  epoch: bigint;
  walletId: string;
  stakingPoolId: string;
  uniPositionId: string;
  blockNumber: number;
}): UserCumulativeReward => ({
  id: getRewardRecordId(stakingPoolId, tokenId, epoch),
  tokenId,
  epoch,
  rewardSlash: 0n,
  pendingBoostReward: 0n,
  forfeitedBoostReward: 0n,
  accruedWeight: 0n,
  accruedBaseWeight: 0n,
  cumulativeReward: 0n,
  claimed: 0n,
  burned: 0n,
  lastDistributedCumulativeReward: 0n,
  updatedAtTimestamp: 0,
  blockNumber,
  merkleRoot: '',
  proof: [],
  lastDistributedProof: [],
  lastDistributedMerkleRoot: '',
  isRewardsDistributed: false,
  distributionSkipped: false,
  wallet_id: walletId,
  stakingPool_id: stakingPoolId,
  uniPosition_id: uniPositionId,
});

/** Port of the contract's `_getBoost(days)`: the boost an honest lock of `days` earns. */
export const getLockBoost = (
  days: bigint,
  pool: Pick<StakingPoolV4, 'minDays' | 'maxDays' | 'minBoost' | 'maxBoost'>,
) => {
  if (days < pool.minDays) return BOOST_PRECISION;
  if (days >= pool.maxDays) return pool.maxBoost;
  return ((days - pool.minDays) * (pool.maxBoost - pool.minBoost)) / (pool.maxDays - pool.minDays) + pool.minBoost;
};

/**
 * Adds every open staked position's reward weight for the time since the last accrual, to the
 * reward record of its current deposit: capital value × seconds in range, boosted for the seconds
 * before `lockedUntil`. Value is the position's worth in ETH at the pool price, so a narrow range
 * earns the same per unit of capital as a wide one, and only while in range. The daily run then splits the day's pool by this weight, so what counts is
 * how long a position was in range, not where the price sat at one predictable block. A swap into
 * range and back within one block adds no time and earns nothing.
 *
 * Call it before anything that changes a weight: a swap (tick), a liquidity change in the pool, a
 * deposit or withdrawal, and at the start of the daily run. The store still holds the tick and
 * positions that applied over the elapsed time. Pass `uniswapV4PoolId` from pool events so other
 * pools are ignored.
 */
export const accrueStakingWeights = async (
  context: EvmOnEventContext,
  {
    chainId,
    now,
    blockNumber,
    uniswapV4PoolId,
  }: { chainId: number; now: number; blockNumber: number; uniswapV4PoolId?: string },
) => {
  const stakingPool = await context.StakingPoolV4.get(
    getStakingPoolId(chainId, getLoadedConfig().uniswapV4StakingAddress),
  );
  if (!stakingPool) return;
  if (uniswapV4PoolId !== undefined && uniswapV4PoolId !== stakingPool.uniswapV4Pool_id) return;

  const from = stakingPool.lastAccrualTimestamp;
  if (now <= from) return;
  context.StakingPoolV4.set({ ...stakingPool, lastAccrualTimestamp: now });
  // No start time yet (LPStakingInit sets one): this call only starts the clock.
  if (from === 0) return;

  const uniV4Pool = await context.UniswapV4Pool.get(stakingPool.uniswapV4Pool_id);
  if (!uniV4Pool) return;

  const openPositions = await context.StakingPoolV4Position.getWhere({
    pool_id: { _eq: stakingPool.id },
    isPositionClosed: { _eq: false },
  });

  const seconds = BigInt(now - from);
  for (const position of openPositions) {
    if (!position.uniPosition_id) continue;
    const uniPosition = await context.UniswapV4PoolPosition.get(position.uniPosition_id);
    if (!uniPosition) continue;

    // The tick and price in the store are the ones that held since `from`.
    const value = getActivePositionValue(uniPosition, uniV4Pool.tick, uniV4Pool.sqrtPriceX96);
    // A position record should never be negative, but one that is must never subtract weight.
    if (value <= 0n) continue;

    // The boost pays for the promise not to leave, so it applies only to seconds before lockedUntil.
    const lockedEnd = position.lockedUntil < BigInt(now) ? position.lockedUntil : BigInt(now);
    const lockedSeconds = lockedEnd > BigInt(from) ? lockedEnd - BigInt(from) : 0n;
    const baseWeight = value * seconds;
    const weight =
      (value * (lockedSeconds * position.timeBoost + (seconds - lockedSeconds) * BOOST_PRECISION)) /
      BOOST_PRECISION;

    const recordId = getRewardRecordId(stakingPool.id, position.tokenId, position.epoch);
    const record =
      (await context.UserCumulativeReward.get(recordId)) ??
      getNewUserCumulativeReward({
        tokenId: position.tokenId,
        epoch: position.epoch,
        walletId: position.wallet_id,
        stakingPoolId: stakingPool.id,
        uniPositionId: uniPosition.id,
        blockNumber,
      });
    context.UserCumulativeReward.set({
      ...record,
      accruedWeight: record.accruedWeight + weight,
      accruedBaseWeight: record.accruedBaseWeight + baseWeight,
      // The record follows its current staker.
      wallet_id: position.wallet_id,
      uniPosition_id: uniPosition.id,
    });
  }
};

/**
 * The part of a deposit's boost bonus that an early exit keeps: the bonus an honest lock of the
 * days actually served would have earned. Applies to the held bonus and to the bonus part of
 * weight accrued since the last daily run alike. A 365-day lock left on day 180 keeps the bonus of
 * a 180-day lock, so declaring a longer lock than you serve never pays more than the honest one.
 */
export const getReleasableBoostReward = ({
  pending,
  timeBoost,
  stakingTimestamp,
  exitTimestamp,
  pool,
}: {
  pending: bigint;
  timeBoost: bigint;
  stakingTimestamp: number;
  exitTimestamp: number;
  pool: Pick<StakingPoolV4, 'minDays' | 'maxDays' | 'minBoost' | 'maxBoost'>;
}) => {
  if (timeBoost <= BOOST_PRECISION) return 0n;
  const daysServed = BigInt(exitTimestamp - stakingTimestamp) / SECONDS_PER_DAY;
  const earnedBoost = getLockBoost(daysServed, pool);
  const servedBoost = earnedBoost < timeBoost ? earnedBoost : timeBoost;
  return (pending * (servedBoost - BOOST_PRECISION)) / (timeBoost - BOOST_PRECISION);
};

/**
 * Resolves who a claim/burn for `tokenId` belongs to. The events only carry the tokenId and epoch,
 * and `transaction.from` can be a relayer or bundler, so it cannot be used.
 * - Staked: the staker of the open position.
 * - Claimed inside `withdraw`: the staker of the position that just closed. The contract pays the
 *   claim before it sends the NFT back, so the NFT is still held by the staking contract.
 * - Unstaked: the current NFT holder; the history record links the latest closed position.
 */
export const resolveRewardOwner = async (
  context: EvmOnEventContext,
  chainId: number,
  stakingPoolId: string,
  positionToken: UniswapV4PositionToken,
) => {
  const stakingPositions = [
    ...(await context.StakingPoolV4Position.getWhere({
      tokenId: { _eq: positionToken.tokenId },
      pool_id: { _eq: stakingPoolId },
    })),
  ].sort((a, b) => b.updatedAtTimestamp - a.updatedAtTimestamp);

  const openPosition = stakingPositions.find((p) => !p.isPositionClosed);
  // The history record links to the position that earned the rewards: the open one, or else the
  // latest closed one. After a resale, a holder who hasn't staked yet (e.g. Dave claiming #44)
  // has no position of their own, so the claim links to the seller's closed position while
  // `walletId` names the holder.
  const stakingPosition = openPosition ?? stakingPositions[0];

  const heldByStaking =
    positionToken.owner.toLowerCase() === getLoadedConfig().uniswapV4StakingAddress.toLowerCase();

  return {
    walletId:
      openPosition?.wallet_id ??
      (heldByStaking ? stakingPositions[0]?.wallet_id : undefined) ??
      positionToken.wallet_id,
    stakingPositionId:
      stakingPosition?.id ??
      getStakingPositionId(chainId, positionToken.owner, positionToken.tokenId),
  };
};

const PAYOUT_FIELDS = {
  claimed: {
    poolTotal: 'totalRewardsClaimed',
    transactionType: StakingPoolV4PositionRecordType.REWARDS_CLAIMED,
  },
  burned: {
    poolTotal: 'totalRewardsBurned',
    transactionType: StakingPoolV4PositionRecordType.REWARDS_BURNED,
  },
} as const;

/**
 * Shared body of the RewardsClaimed and RewardsBurned handlers. A claim pays rewards out and a
 * burn slashes them (early-withdrawal penalty); both reduce what is left to claim for that
 * deposit's (tokenId, epoch) bucket.
 *
 * This:
 * 1. Adds the amount to the staking pool's claimed or burned total.
 * 2. Writes a history record for the claim or burn.
 * 3. Adds the amount to the (tokenId, epoch) reward record and moves it to the current reward owner.
 */
export const recordRewardPayout = async (
  event:
    | EvmEvent<'UniswapV4Staking', 'RewardsClaimed'>
    | EvmEvent<'UniswapV4Staking', 'RewardsBurned'>,
  context: EvmOnEventContext,
  kind: 'claimed' | 'burned',
) => {
  const {
    chainId,
    params: { tokenId, epoch, amount },
    srcAddress: stakingContractAddress,
  } = event;
  const { poolTotal, transactionType } = PAYOUT_FIELDS[kind];

  const uniswapV4PositionToken = await context.UniswapV4PositionToken.get(`${chainId}-${tokenId}`);
  if (!uniswapV4PositionToken) return;

  const stakingPool = await context.StakingPoolV4.get(
    getStakingPoolId(chainId, stakingContractAddress),
  );
  if (!stakingPool) return;

  // Rewards are tracked per (tokenId, epoch), like the contract does. The reward owner is resolved
  // from staking state rather than `transaction.from`, which may be a relayer or bundler.
  const { walletId, stakingPositionId } = await resolveRewardOwner(
    context,
    chainId,
    stakingPool.id,
    uniswapV4PositionToken,
  );
  const rewardRecord = await context.UserCumulativeReward.get(
    getRewardRecordId(stakingPool.id, tokenId, epoch),
  );

  context.StakingPoolV4.set({
    ...stakingPool,
    [poolTotal]: stakingPool[poolTotal] + amount,
  });

  writeStakingHistoryRecord(context, event, {
    tokenId,
    epoch,
    transactionType,
    pool_id: stakingPool.id,
    stakingPosition_id: stakingPositionId,
    wallet_id: walletId,
    rewardsClaimed: kind === 'claimed' ? amount : 0n,
    rewardsBurned: kind === 'burned' ? amount : 0n,
  });

  const record =
    rewardRecord ??
    getNewUserCumulativeReward({
      tokenId,
      epoch,
      walletId,
      stakingPoolId: stakingPool.id,
      uniPositionId: uniswapV4PositionToken.position_id,
      blockNumber: 0,
    });
  context.UserCumulativeReward.set({
    ...record,
    [kind]: record[kind] + amount,
    // The record follows the current owner, e.g. a buyer claiming before staking.
    wallet_id: walletId,
  });
};
