import { getNewWallet } from "../helper/Wallet";
import { indexer } from "envio";
import type { EvmEvent, EvmOnEventContext } from "envio";
import { getDay, getHour } from "../helper/date";
import { getLoadedConfig } from "../config";
import {
  buildMerkleTree,
  compareRewardBuckets,
  computeV4PoolId,
  getPredictedDailyBlockCount,
  TOTAL_DAILY_REWARDS,
} from "../helper/UniswapV4Helpers/utils";
import { getBlockTimestamp } from "../helper/blockTimestamp";
import { StakingPoolV4PositionRecordType } from "../types/enums";
import {
  accrueStakingWeights,
  getReleasableBoostReward,
  getRewardRecordId,
  getStakingPoolId,
  getStakingPositionId,
  recordRewardPayout,
  writeStakingHistoryRecord,
} from "../helper/UniswapV4Staking";

const {
  uniswapV4StakingAddress,
  uniswapV4StakingStartBlock,
  chainId: loadedChainId,
} = getLoadedConfig();

indexer.onEvent({ contract: "UniswapV4Staking", event: "LPStakingInit" }, async ({ event, context }) => {
  /**
   * LPStakingInit event is emitted when a new staking pool is initialized.
   *
   * This event links:
   * - Staking contract configuration
   * - Target Uniswap V4 pool
   * - Reward / boost parameters
   */

  const {
    chainId,
    transaction: { hash: transactionHash },
    block: { timestamp },
    srcAddress: contractAddress,
  } = event;

  const {
    positionManager,
    targetPoolKey,
    minDays,
    maxDays,
    minBoost,
    maxBoost,
    earlyPositionSlash,
    earlyRewardSlash,
  } = event.params;

  // Uniswap V4 poolId = keccak256(abi.encode(PoolKey)). targetPoolKey is an
  // indexed tuple: real logs carry only its keccak topic hash (= the poolId),
  // while decoded forms (positional array or named object) need hashing here.
  const poolKey: unknown = targetPoolKey;
  let poolId: string;
  if (typeof poolKey === 'string') {
    poolId = poolKey;
  } else {
    const [currency0, currency1, fee, tickSpacing, hooks] = Array.isArray(poolKey)
      ? poolKey
      : [
          targetPoolKey.currency0,
          targetPoolKey.currency1,
          targetPoolKey.fee,
          targetPoolKey.tickSpacing,
          targetPoolKey.hooks,
        ];
    poolId = computeV4PoolId(currency0, currency1, fee, tickSpacing, hooks);
  }
  const uniV4PoolEntityId = `${chainId}-${poolId}`;

  const exitsingUniV4Pool = await context.UniswapV4Pool.get(uniV4PoolEntityId);
  if (!exitsingUniV4Pool) {
    // The pool's Initialize must be indexed before the staking contract's initialize, or no staking
    // pool is created and nothing of this contract is indexed. Nothing retries it.
    context.log.error(
      `LPStakingInit: target pool ${uniV4PoolEntityId} is not indexed, staking pool ${contractAddress} not created`,
    );
    return;
  }

  const stakingPoolEntityId = getStakingPoolId(chainId, contractAddress);
  const existingContract =
    await context.StakingPoolV4.get(stakingPoolEntityId);

  if (!existingContract) {
    context.StakingPoolV4.set({
      id: stakingPoolEntityId,
      chainId,
      contractAddress,
      positionManager,
      targetPoolKey: poolId,
      minDays,
      maxDays,
      minBoost,
      maxBoost,
      // LPStakingInit carries only the maximum slash rates; the minimums arrive with the first
      // EarlyWithdrawSlashRatesUpdated.
      earlyPositionSlash,
      earlyRewardSlash,
      earlyMinimumPositionSlash: undefined,
      earlyMinimumRewardSlash: undefined,
      totalRewardsAdded: 0n,
      totalRewardsClaimed: 0n,
      totalRewardsBurned: 0n,
      lastAccrualTimestamp: timestamp,
      carryOverReward: 0n,
      createdAtTimestamp: timestamp,
      creationTransaction: transactionHash,
      uniswapV4Pool_id: exitsingUniV4Pool.id,
    });
  }
});

indexer.onEvent(
  { contract: "UniswapV4Staking", event: "EarlyWithdrawSlashRatesUpdated" },
  async ({ event, context }) => {
    const stakingPool = await context.StakingPoolV4.get(
      getStakingPoolId(event.chainId, event.srcAddress),
    );
    if (!stakingPool) return;

    const { minimumPositionSlash, maximumPositionSlash, minimumRewardSlash, maximumRewardSlash } =
      event.params;
    context.StakingPoolV4.set({
      ...stakingPool,
      earlyPositionSlash: maximumPositionSlash,
      earlyRewardSlash: maximumRewardSlash,
      earlyMinimumPositionSlash: minimumPositionSlash,
      earlyMinimumRewardSlash: minimumRewardSlash,
    });
  },
);

indexer.onEvent({ contract: "UniswapV4Staking", event: "Deposit" }, async ({ event, context }) => {
  /**
   * Deposit event is emitted when a user stakes their liquidity position NFT.
   *
   * This event updates staking state by linking:
   * - User wallet
   * - NFT position token
   * - Staking configuration
   *
   * Staking positions track:
   * - Locked liquidity
   * - Lock duration
   * - Boost multipliers
   * - The deposit's epoch: every deposit starts a new, empty reward bucket (tokenId, epoch)
   */

  const {
    chainId,
    srcAddress: stakingContractAddress,
    block: { timestamp },
  } = event;
  const { owner, tokenId, epoch, liquidity, lockedUntil, timeBoost } = event.params;

  /**
   * Get or create wallet entity for the staking user.
   */
  const wallet = await context.Wallet.getOrCreate(getNewWallet(chainId, owner));

  /**
   * Only process staking logic if NFT position token exists.
   * This guarantees staking state is always linked to a valid liquidity position.
   */
  const positionToken = await context.UniswapV4PositionToken.get(`${chainId}-${tokenId}`);
  if (!positionToken) return;

  // Close the interval before this deposit changes the set of earning positions.
  await accrueStakingWeights(context, { chainId, now: timestamp, blockNumber: event.block.number });

  const stakingPoolId = getStakingPoolId(chainId, stakingContractAddress);
  const stakingPositionId = getStakingPositionId(chainId, owner, tokenId);

  // Creates the position, or reopens it with the new terms when the same owner re-deposits.
  context.StakingPoolV4Position.set({
    id: stakingPositionId,
    chainId,
    tokenId,
    epoch,
    lockedUntil,
    liquidity,
    timeBoost,
    stakingTimestamp: timestamp,
    isPositionClosed: false,
    updatedAtTimestamp: timestamp,
    wallet_id: wallet.id,
    pool_id: stakingPoolId,
    positionToken_id: positionToken.id,
    uniPosition_id: positionToken.position_id,
  });

  /**
   * The NFT's reward records of earlier epochs now belong to the new staker: unclaimed
   * rewards follow the NFT. No record is created for the new epoch here; the daily run
   * creates it when this deposit first earns.
   */
  const rewardRecords = await context.UserCumulativeReward.getWhere({
    tokenId: { _eq: tokenId },
    stakingPool_id: { _eq: stakingPoolId },
  });
  for (const rewardRecord of rewardRecords) {
    context.UserCumulativeReward.set({ ...rewardRecord, wallet_id: wallet.id });
  }

  writeStakingHistoryRecord(context, event, {
    tokenId,
    epoch,
    transactionType: StakingPoolV4PositionRecordType.DEPOSIT,
    pool_id: stakingPoolId,
    stakingPosition_id: stakingPositionId,
    wallet_id: wallet.id,
  });
});

/**
 * Shared body of the Withdraw and EarlyWithdraw handlers: closes the staking position and
 * writes a history record. `epoch` defaults to the position's current epoch, since Withdraw
 * carries none: a normal withdraw always ends the current epoch.
 */
const closeStakingPosition = async (
  event:
    | EvmEvent<"UniswapV4Staking", "Withdraw">
    | EvmEvent<"UniswapV4Staking", "EarlyWithdraw">,
  context: EvmOnEventContext,
  transactionType:
    | StakingPoolV4PositionRecordType.WITHDRAW
    | StakingPoolV4PositionRecordType.EARLY_WITHDRAW,
  epoch?: bigint,
) => {
  const {
    chainId,
    block: { timestamp, number: blockNumber },
    params: { owner, tokenId },
  } = event;

  // Credit the position for its time in range up to this exit, while it still counts as open.
  await accrueStakingWeights(context, { chainId, now: timestamp, blockNumber });

  const stakingPositionId = getStakingPositionId(chainId, owner, tokenId);
  const stakingPosition = await context.StakingPoolV4Position.get(stakingPositionId);
  if (!stakingPosition) return;

  context.StakingPoolV4Position.set({
    ...stakingPosition,
    isPositionClosed: true,
    updatedAtTimestamp: timestamp,
  });

  writeStakingHistoryRecord(context, event, {
    tokenId,
    epoch: epoch ?? stakingPosition.epoch,
    transactionType,
    pool_id: stakingPosition.pool_id,
    stakingPosition_id: stakingPositionId,
    wallet_id: stakingPosition.wallet_id,
  });
};

/**
 * Withdraw event is emitted when a user unstakes their liquidity position NFT
 * after the lock period.
 */
indexer.onEvent({ contract: "UniswapV4Staking", event: "Withdraw" }, ({ event, context }) =>
  closeStakingPosition(event, context, StakingPoolV4PositionRecordType.WITHDRAW),
);

indexer.onEvent({ contract: "UniswapV4Staking", event: "EarlyWithdraw" }, async ({ event, context }) => {
  /**
   * EarlyWithdraw event is emitted when a user withdraws liquidity
   * before the staking lock period is completed.
   *
   * Early withdrawals trigger:
   * - Position lifecycle closure
   * - A position slash: `positionSlash` is an amount of liquidity sent to the treasury
   * - A reward slash: `rewardSlash` is a rate (100000 scale) stored on-chain for this epoch,
   *   applied to every later claim of the epoch
   * - The held boost bonus is cut to what the days actually served earned; the rest goes back
   *   into the next daily pool
   * - Historical activity tracking
   */
  const {
    chainId,
    block: { timestamp, number: blockNumber },
  } = event;
  const { owner, tokenId, epoch, rewardSlash } = event.params;

  // Credit the time in range up to this exit first, so its boost is prorated below too.
  await accrueStakingWeights(context, { chainId, now: timestamp, blockNumber });

  // A deposit that was never in range has no record: nothing to slash or prorate.
  const rewardRecord = await context.UserCumulativeReward.get(
    getRewardRecordId(getStakingPoolId(chainId, event.srcAddress), tokenId, epoch),
  );
  if (rewardRecord) {
    const position = await context.StakingPoolV4Position.get(
      getStakingPositionId(chainId, owner, tokenId),
    );
    const pool = position && (await context.StakingPoolV4.get(position.pool_id));

    // Keep only the boost bonus the days served earned; the rest is forfeited and never enters a
    // leaf. That applies to the bonus already held and to the boost part of the weight accrued
    // since the last run. What is left of pendingBoostReward is released by the next daily run.
    const prorate = (bonus: bigint) =>
      position && pool
        ? getReleasableBoostReward({
            pending: bonus,
            timeBoost: position.timeBoost,
            stakingTimestamp: position.stakingTimestamp,
            exitTimestamp: timestamp,
            pool,
          })
        : bonus;
    const pending = rewardRecord.pendingBoostReward;
    const releasable = prorate(pending);
    const accruedBonusWeight = rewardRecord.accruedWeight - rewardRecord.accruedBaseWeight;

    const forfeited = pending - releasable;

    context.UserCumulativeReward.set({
      ...rewardRecord,
      // Stored so the UI can show the epoch's slash without an RPC call.
      rewardSlash,
      pendingBoostReward: releasable,
      forfeitedBoostReward: rewardRecord.forfeitedBoostReward + forfeited,
      accruedWeight: rewardRecord.accruedBaseWeight + prorate(accruedBonusWeight),
    });

    // The forfeited bonus was taken from the other stakers' shares on the days it was held, so it
    // goes back to them: the next daily run adds it to its pool. The cut accrued weight needs no
    // carry-over: it simply weighs less in that run's split.
    if (pool && forfeited > 0n) {
      context.StakingPoolV4.set({ ...pool, carryOverReward: pool.carryOverReward + forfeited });
    }
  }

  await closeStakingPosition(event, context, StakingPoolV4PositionRecordType.EARLY_WITHDRAW, epoch);
});

indexer.onBlock(
  {
    name: "DailyUniswapV4StakingRewards",
    where: ({ chain }) => {
      if (chain.id !== loadedChainId) return false;
      return {
        block: {
          number: {
            _gte: uniswapV4StakingStartBlock,
            _every: getPredictedDailyBlockCount(loadedChainId),
          },
        },
      };
    },
  },
  async ({ block, context }) => {
    /**
     * DailyRewards Handler
     * ---------------------
     * This onBlock handler runs once per day (based on chain block time) and builds the
     * reward Merkle tree for the Uniswap V4 staking pool.
     *
     * Today's reward pool (the daily emission plus boost bonus forfeited by early exits since the
     * last tree) is split by the weight each deposit accrued since the last run:
     * capital value in ETH × seconds in range, boosted while locked (see accrueStakingWeights). Weight
     * accrues on every swap, liquidity change, deposit and withdrawal, so a deposit earns for
     * the time it was actually in range, including one that closed during the day. Each share
     * goes to that deposit's record (one per (tokenId, epoch)). Only the 1x base of a share
     * goes into the leaf; the boost bonus is held in pendingBoostReward until the deposit's
     * lock is completed, so leaving early can't keep a boost that wasn't earned. The tree covers
     * every deposit that has ever earned: records that didn't earn today carry forward
     * unchanged, because the contract only accepts proofs against its latest root. Every record
     * in the tree is rewritten with the new root and its proof, and later marked as distributed
     * when the `Reward` event publishes that root.
     */

    if (context.isPreload) return;

    const STAKING_POOL_ENTITY_ID = getStakingPoolId(loadedChainId, uniswapV4StakingAddress);

    const stakingPool = await context.StakingPoolV4.get(STAKING_POOL_ENTITY_ID);
    if (!stakingPool) return;

    const activeStakedPositions = await context.StakingPoolV4Position.getWhere({
      pool_id: { _eq: STAKING_POOL_ENTITY_ID },
      isPositionClosed: { _eq: false },
    });
    const accruedRecordsSoFar = await context.UserCumulativeReward.getWhere({
      stakingPool_id: { _eq: STAKING_POOL_ENTITY_ID },
      accruedWeight: { _gt: 0n },
    });
    const recordsHoldingBonus = await context.UserCumulativeReward.getWhere({
      stakingPool_id: { _eq: STAKING_POOL_ENTITY_ID },
      pendingBoostReward: { _gt: 0n },
    });
    // Nothing staked, nothing earned since the last run and no held bonus to release.
    if (
      activeStakedPositions.length === 0 &&
      accruedRecordsSoFar.length === 0 &&
      recordsHoldingBonus.length === 0
    ) {
      return;
    }

    // Block handlers only receive the block number, so the run's timestamp is read from the chain.
    const now = await context.effect(getBlockTimestamp, {
      chainId: loadedChainId,
      blockNumber: block.number,
    });

    // Close the day: accrue every open position up to this block.
    await accrueStakingWeights(context, { chainId: loadedChainId, now, blockNumber: block.number });

    // Reloaded: accruing just moved its clock.
    const accruedPool = (await context.StakingPoolV4.get(STAKING_POOL_ENTITY_ID)) ?? stakingPool;
    // Today's emission plus the boost bonus forfeited by early exits since the last tree.
    const dailyPool = TOTAL_DAILY_REWARDS + accruedPool.carryOverReward;

    const earningRecords = await context.UserCumulativeReward.getWhere({
      stakingPool_id: { _eq: STAKING_POOL_ENTITY_ID },
      accruedWeight: { _gt: 0n },
    });
    const totalWeight = earningRecords.reduce((sum, record) => sum + record.accruedWeight, 0n);

    // Today's earners, keyed by reward record ID, with their share of the daily pool. `base` is
    // the part the share would be at 1x; the rest (share − base) is the boost bonus.
    const earners = new Map<string, { share: bigint; base: bigint }>();
    for (const record of earningRecords) {
      const share = (dailyPool * record.accruedWeight) / totalWeight;
      const base = (share * record.accruedBaseWeight) / record.accruedWeight;
      earners.set(record.id, { share, base });
    }

    // Deposits still staked and locked keep their boost bonus held back. Every other deposit
    // (lock completed, withdrawn, or exited early and already prorated) gets it released.
    const nowBigInt = BigInt(now);
    const lockedRecordIds = new Set(
      activeStakedPositions
        .filter((position) => nowBigInt < position.lockedUntil)
        .map((position) => getRewardRecordId(STAKING_POOL_ENTITY_ID, position.tokenId, position.epoch)),
    );

    // The contract only accepts proofs against the latest root, so every deposit that has
    // ever earned must be in every tree: today's earners plus every existing record,
    // including earlier epochs and withdrawn, out-of-range and resold positions (carried
    // forward unchanged).
    const existingRecords = await context.UserCumulativeReward.getWhere({
      stakingPool_id: { _eq: STAKING_POOL_ENTITY_ID },
    });

    // New totals: the base of today's share goes into the leaf, the bonus into pendingBoostReward,
    // and a deposit that is no longer locked gets all of its pending bonus moved into the leaf.
    // Earners' accrued weight is used up. Totals only change here, together with the tree, so a
    // record's proof always matches it.
    let totalReleased = 0n;
    const mergedRecords = existingRecords.map((record) => {
      const earner = earners.get(record.id);
      const pending = record.pendingBoostReward + (earner ? earner.share - earner.base : 0n);
      const released = lockedRecordIds.has(record.id) ? 0n : pending;
      totalReleased += released;
      return {
        ...record,
        cumulativeReward: record.cumulativeReward + (earner?.base ?? 0n) + released,
        pendingBoostReward: pending - released,
        accruedWeight: earner ? 0n : record.accruedWeight,
        accruedBaseWeight: earner ? 0n : record.accruedBaseWeight,
      };
    });

    // No staked position was in range since the last run and no held bonus became claimable:
    // nothing changes, so don't publish a new root. The previous one stays valid on-chain.
    // A day with nobody in range still builds a tree when a lock ended or a staker left, or
    // their held bonus would wait for someone else to earn.
    if (earners.size === 0 && totalReleased === 0n) return;

    // Records with a zero total have nothing to claim and get no leaf.
    // Sorted by (tokenId, epoch) so the same state always produces the same root.
    const updatedRecords = mergedRecords
      .filter((record) => record.cumulativeReward > 0n)
      .sort(compareRewardBuckets);

    // Earners without a leaf yet (everything so far is held-back bonus, or a share that rounded
    // to 0) still need their used-up weight and held bonus saved.
    for (const record of mergedRecords) {
      if (record.cumulativeReward === 0n && earners.has(record.id)) {
        context.UserCumulativeReward.set(record);
      }
    }

    // Each leaf in the Merkle tree is the hash of (tokenId, epoch, cumulativeReward). Held-back
    // bonus is not in any leaf, so the operator doesn't fund it until it is released.
    const { root: merkleRoot, proofs } = buildMerkleTree(updatedRecords);

    // Rewrite every record in the tree with the new root and a fresh proof, marked pending
    // (updatedAtTimestamp = 0) until the `Reward` event publishes this root.
    // `proofs[i]` belongs to `updatedRecords[i]`.
    for (const [index, record] of updatedRecords.entries()) {
      context.UserCumulativeReward.set({
        ...record,
        updatedAtTimestamp: 0,
        merkleRoot,
        proof: proofs[index]!,
        isRewardsDistributed: false,
        distributionSkipped: false,
        blockNumber: block.number,
      });
    }

    // Someone earned today, so the carried-over bonus went into their shares. With no earners it
    // waits for the next run that has some.
    if (earners.size > 0 && accruedPool.carryOverReward > 0n) {
      context.StakingPoolV4.set({ ...accruedPool, carryOverReward: 0n });
    }

    // One entity per tree, so the operator can read the latest root and how much it needs
    // funding with a single query.
    context.StakingPoolV4RewardTree.set({
      id: `${STAKING_POOL_ENTITY_ID}-${block.number}`,
      chainId: loadedChainId,
      merkleRoot,
      blockNumber: block.number,
      leafCount: updatedRecords.length,
      totalCumulativeReward: updatedRecords.reduce((sum, r) => sum + r.cumulativeReward, 0n),
      dailyReward: [...earners.values()].reduce((sum, e) => sum + e.share, 0n),
      totalPendingBoostReward: mergedRecords.reduce((sum, r) => sum + r.pendingBoostReward, 0n),
      isPublished: false,
      publishedAtTimestamp: undefined,
      publishedTransactionHash: undefined,
      publishedAmount: undefined,
      pool_id: STAKING_POOL_ENTITY_ID,
    });
  },
);

indexer.onEvent({ contract: "UniswapV4Staking", event: "Reward" }, async ({ event, context }) => {
  /**
   * Reward Event Handler
   * --------------------
   * Triggered when a rewards distribution occurs on-chain from the staking contract
   *
   * This handler:
   * 1. Updates the staking pool's total rewards added.
   * 2. Records one pool record per Reward event, with its hour and day for grouping.
   * 3. Marks the reward tree with this root as published.
   * 4. Marks the pending cumulative reward records of this root as distributed; records of other
   *    roots stay pending.
   */
  const {
    chainId,
    block: { timestamp, number: blockNumber },
    logIndex,
    params: { merkleRoot, amount },
    srcAddress: stakingContractAddress,
    transaction: { hash },
  } = event;

  const stakingEntityId = getStakingPoolId(chainId, stakingContractAddress);

  const stakingPool = await context.StakingPoolV4.get(stakingEntityId);
  if (!stakingPool) return;

  const { start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  const updatedTotalRewards = stakingPool.totalRewardsAdded + amount;
  context.StakingPoolV4.set({
    ...stakingPool,
    totalRewardsAdded: updatedTotalRewards,
  });

  context.StakingPoolV4Record.set({
    id: `${stakingPool.id}-${blockNumber}-${logIndex}`,
    chainId,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    pool_id: stakingPool.id,
    totalRewards: updatedTotalRewards,
    transactionHash: hash,
    merkleRoot,
  });

  // Mark the tree this root came from as published.
  const publishedTrees = await context.StakingPoolV4RewardTree.getWhere({
    merkleRoot: { _eq: merkleRoot },
    pool_id: { _eq: stakingPool.id },
  });
  for (const tree of publishedTrees) {
    context.StakingPoolV4RewardTree.set({
      ...tree,
      isPublished: true,
      publishedAtTimestamp: timestamp,
      publishedTransactionHash: hash,
      publishedAmount: amount,
    });
  }

  // Mark the records of this root as distributed. A pending record has updatedAtTimestamp = 0: a
  // daily run wrote it but its root wasn't published yet. Records of another root are left pending
  // for when that root is published: when several trees are built before the operator catches up,
  // every record is already on the newest root, and publishing an older one must not use them up.
  // - `lastDistributedCumulativeReward` / `lastDistributedMerkleRoot` / `lastDistributedProof` keep
  //   the values of the latest published root, a fallback for the frontend while a newer tree is
  //   not published yet.
  const pendingRewards = await context.UserCumulativeReward.getWhere({
    updatedAtTimestamp: { _eq: 0 },
    stakingPool_id: { _eq: stakingPool.id },
  });
  for (const pending of pendingRewards) {
    if (pending.merkleRoot !== merkleRoot) continue;
    context.UserCumulativeReward.set({
      ...pending,
      lastDistributedCumulativeReward: pending.cumulativeReward,
      lastDistributedMerkleRoot: pending.merkleRoot,
      lastDistributedProof: pending.proof,
      isRewardsDistributed: true,
      updatedAtTimestamp: timestamp,
      distributionSkipped: false,
    });
  }
});

indexer.onEvent({ contract: "UniswapV4Staking", event: "RewardsClaimed" }, ({ event, context }) =>
  recordRewardPayout(event, context, "claimed"),
);

indexer.onEvent({ contract: "UniswapV4Staking", event: "RewardsBurned" }, ({ event, context }) =>
  recordRewardPayout(event, context, "burned"),
);
