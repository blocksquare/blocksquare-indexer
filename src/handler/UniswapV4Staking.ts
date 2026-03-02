import { getNewWallet } from "../helper/Wallet";
import { chain, onBlock, UniswapV4Staking } from "generated";
import { getDay, getHour } from "../helper/date";
import { getLoadedConfig } from "../config";
import {
  buildMerkleTree,
  calculateActiveLiquidity,
  getPredictedDailyBlockCount,
  getUniswapV4StakingDeployementBlock,
  TOTAL_DAILY_REWARDS,
} from "../helper/UniswapV4Staking";

const { uniswapV4StakingAddress, chainId: loadedChainId } = getLoadedConfig();

UniswapV4Staking.LPStakingInit.handler(async ({ event, context }) => {
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

  const uniV4PoolEntityId = `${chainId}-${targetPoolKey.toString()}`;

  const exitsingUniV4Pool = await context.UniswapV4Pool.get(uniV4PoolEntityId);

  if (exitsingUniV4Pool) {
    const stakingPoolEntityId = `${chainId}-${contractAddress}`;
    const existingContract =
      await context.StakingPoolV4.get(stakingPoolEntityId);

    if (!existingContract) {
      context.StakingPoolV4.set({
        id: stakingPoolEntityId,
        chainId,
        contractAddress,
        positionManager,
        targetPoolKey: targetPoolKey.toString(),
        minDays,
        maxDays,
        minBoost,
        maxBoost,
        earlyPositionSlash,
        earlyRewardSlash,
        totalRewardsAdded: 0n,
        totalRewardsClaimed: 0n,
        totalRewardsBurned: 0n,
        createdAtTimestamp: timestamp,
        creationTransaction: transactionHash,
        uniswapV4Pool_id: exitsingUniV4Pool.id,
      });
    }
  }
});

UniswapV4Staking.Deposit.handler(async ({ event, context }) => {
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
   */

  const {
    chainId,
    srcAddress: stakingContractAddress,
    transaction: { hash: transactionHash },
    logIndex,
  } = event;
  const { owner, tokenId, liquidity, lockedUntil, timeBoost } = event.params;

  /**
   * Get or create wallet entity for the staking user.
   */
  const wallet = await context.Wallet.getOrCreate(
    getNewWallet(event.chainId, owner),
  );

  /**
   * Find the associated Uniswap V4 NFT position token.
   */
  const uniTokenEntityId = `${chainId}-${tokenId}`;
  const existingUniToken =
    await context.UniswapV4PositionToken.get(uniTokenEntityId);

  /**
   * Only process staking logic if NFT position token exists.
   * This guarantees staking state is always linked to a valid liquidity position.
   */
  if (existingUniToken) {
    const stakingPoolEntityId = `${chainId}-${stakingContractAddress}`;
    const positionEntityId = `${chainId}-${owner}-${tokenId}`;
    const existingStakingPosition =
      await context.StakingPoolV4Position.get(positionEntityId);

    if (existingStakingPosition) {
      context.StakingPoolV4Position.set({
        ...existingStakingPosition,
        lockedUntil,
        positionToken_id: existingUniToken.id,
        liquidity,
        timeBoost,
        isPositionClosed: false,
      });
    } else {
      context.StakingPoolV4Position.set({
        id: positionEntityId,
        chainId,
        lockedUntil,
        tokenId,
        liquidity,
        timeBoost,
        isPositionClosed: false,
        wallet_id: wallet.id,
        pool_id: stakingPoolEntityId,
        positionToken_id: existingUniToken.id,
        uniPosition_id: existingUniToken.position_id,
      });
    }
    const { id: hourId, start: hourStart } = getHour(event.block.timestamp);
    const { start: dayStart } = getDay(event.block.timestamp);

    context.StakingPoolV4PositionRecord.set({
      id: `${stakingPoolEntityId}-${existingUniToken.tokenId}-${hourId}-${logIndex}`,
      transactionHash,
      chainId,
      hourStartTimestamp: hourStart,
      dayStartTimestamp: dayStart,
      tokenId,
      pool_id: stakingPoolEntityId,
      rewardsClaimed: 0n,
      rewardsBurned: 0n,
      transactionType: "DEPOSIT",
    });
  }
});

UniswapV4Staking.Withdraw.handler(async ({ event, context }) => {
  /**
   * Withdraw event is emitted when a user unstakes their liquidity position NFT.
   *
   * This event updates staking state by:
   * - Closing staking position lifecycle
   * - Historical activity tracking
   */

  const {
    chainId,
    transaction: { hash: transactionHash },
    srcAddress: stakingContractAddress,
    logIndex,
  } = event;
  const { owner, tokenId } = event.params;

  const stakingPositionEntityId = `${chainId}-${owner}-${tokenId}`;
  const stakingPosition = await context.StakingPoolV4Position.get(
    stakingPositionEntityId,
  );

  if (stakingPosition) {
    /**
     * Mark staking position as closed since liquidity is withdrawn.
     */
    context.StakingPoolV4Position.set({
      ...stakingPosition,
      isPositionClosed: true,
    });

    const { id: hourId, start: hourStart } = getHour(event.block.timestamp);
    const { start: dayStart } = getDay(event.block.timestamp);

    const stakingContractId = `${chainId}-${stakingContractAddress}`;

    context.StakingPoolV4PositionRecord.set({
      id: `${stakingPosition.pool_id}-${tokenId}-${hourId}-${logIndex}`,
      transactionHash,
      chainId,
      hourStartTimestamp: hourStart,
      dayStartTimestamp: dayStart,
      tokenId,
      rewardsClaimed: 0n,
      rewardsBurned: 0n,
      transactionType: "WITHDRAW",
      pool_id: stakingContractId,
    });
  }
});

UniswapV4Staking.EarlyWithdraw.handler(async ({ event, context }) => {
  /**
   * EarlyWithdraw event is emitted when a user withdraws liquidity
   * before the staking lock period is completed.
   *
   * Early withdrawals usually trigger:
   * - Position lifecycle closure
   * - Potential penalty / slash logic (handled on contract side)
   * - Historical activity tracking
   */

  const {
    chainId,
    transaction: { hash: transactionHash },
    srcAddress: stakingContractAddress,
    logIndex,
  } = event;
  const { owner, tokenId } = event.params;

  const stakingPositionEntityId = `${chainId}-${owner}-${tokenId}`;

  const stakingPosition = await context.StakingPoolV4Position.get(
    stakingPositionEntityId,
  );

  if (stakingPosition) {
    /**
     * Mark position as closed since liquidity is withdrawn early.
     */
    context.StakingPoolV4Position.set({
      ...stakingPosition,
      isPositionClosed: true,
    });

    const { id: hourId, start: hourStart } = getHour(event.block.timestamp);
    const { start: dayStart } = getDay(event.block.timestamp);

    const stakingContractId = `${chainId}-${stakingContractAddress}`;

    context.StakingPoolV4PositionRecord.set({
      id: `${stakingPosition.pool_id}-${tokenId}-${hourId}-${logIndex}`,
      transactionHash,
      chainId,
      hourStartTimestamp: hourStart,
      dayStartTimestamp: dayStart,
      tokenId,
      rewardsClaimed: 0n,
      rewardsBurned: 0n,
      transactionType: "EARLY_WITHDRAW",
      pool_id: stakingContractId,
    });
  }
});

onBlock(
  {
    name: "DailyUniswapV4StakingRewards",
    chain: loadedChainId as chain,
    startBlock: getUniswapV4StakingDeployementBlock(loadedChainId),
    interval: getPredictedDailyBlockCount(loadedChainId),
  },
  async ({ block, context }) => {
    /**
     * DailyRewards Handler
     * ---------------------
     * This onBlock handler runs once per day (based on chain block time) to calculate
     * cumulative rewards for all active staked positions in the Uniswap V4 staking pool.
     *
     * It computes each user's share of the daily reward pool based on the active liquidity
     * (in-range positions) of their staked Uniswap V4 position. A Merkle tree is built
     * from the cumulative rewards (tokenId + cumulativeReward) and the root is stored.
     * Each user's cumulative reward record is updated with the new total and linked to
     * the current Merkle root. These records are later marked as distributed when the
     * `Reward` event is emitted.
     */

    const STAKING_POOL_ENTITY_ID = `${loadedChainId}-${uniswapV4StakingAddress}`;

    // Fetch staking pool and associated Uniswap pool. If either doesn't exist, we cannot calculate rewards.
    const stakingPool = await context.StakingPoolV4.get(STAKING_POOL_ENTITY_ID);
    if (!stakingPool) return;

    const uniV4Pool = await context.UniswapV4Pool.get(
      stakingPool.uniswapV4Pool_id,
    );
    if (!uniV4Pool) return;

    // Fetch all staked positions for this pool and filter out closed ones.
    const allStakedPositions =
      await context.StakingPoolV4Position.getWhere.pool_id.eq(
        STAKING_POOL_ENTITY_ID,
      );
    const activeStakedPositions = allStakedPositions.filter(
      (p) => !p.isPositionClosed,
    );
    if (activeStakedPositions.length === 0) return;

    const uniPositions = await context.UniswapV4PoolPosition.getWhere.poolId.eq(
      uniV4Pool.poolId,
    );

    // Compute total active liquidity and build list of eligible positions.
    // Only positions that are in-range (active liquidity > 0) qualify for rewards.
    let totalActiveLiquidity = 0n;
    const rewardCandidates: Array<{
      stakedPosition: (typeof activeStakedPositions)[0];
      uniPosition: (typeof uniPositions)[0];
      activeLiquidity: bigint;
      cumulativeReward: bigint;
    }> = [];

    for (const stakedPosition of activeStakedPositions) {
      const uniPosition = uniPositions.find(
        (p) => p.id === stakedPosition.uniPosition_id,
      );
      if (!uniPosition) continue;

      // Determine if the position is currently in-range.
      const activeLiquidity = calculateActiveLiquidity(
        uniPosition,
        uniV4Pool.tick,
      );
      if (activeLiquidity === 0n) continue; // skip out-of-range positions

      totalActiveLiquidity += activeLiquidity;
      rewardCandidates.push({
        cumulativeReward: 0n, // will be set after cumulative calculation
        stakedPosition,
        uniPosition,
        activeLiquidity,
      });
    }

    // If no positions are in-range, no rewards to distribute.
    if (totalActiveLiquidity === 0n) return;

    // Calculate cumulative rewards and build merkle tree leaves
    const merkleLeaves: Array<{ tokenId: bigint; cumulativeReward: bigint }> =
      [];

    for (let i = 0; i < rewardCandidates.length; i++) {
      const candidate = rewardCandidates[i];
      const rewardAmount =
        (TOTAL_DAILY_REWARDS * candidate.activeLiquidity) /
        totalActiveLiquidity;

      // The staking position ID (chainId-owner-tokenId) is all we need for the cumulative reward data too
      const userRewardId = candidate.stakedPosition.id;

      const existingRewardData =
        await context.UserCumulativeReward.get(userRewardId);
      const cumulativeReward =
        (existingRewardData?.cumulativeReward ?? 0n) + rewardAmount;

      candidate.cumulativeReward = cumulativeReward;

      // Each leaf in the Merkle tree is the hash of (tokenId, cumulativeReward).
      merkleLeaves.push({
        tokenId: candidate.stakedPosition.tokenId,
        cumulativeReward,
      });
    }

    // Build Merkle tree from leaves and obtain the root.
    // The root will be stored with each cumulative reward record and later
    // used in the on-chain reward distribution event.
    const { root: merkleRoot } = buildMerkleTree(merkleLeaves);

    for (const candidate of rewardCandidates) {
      context.UserCumulativeReward.set({
        id: candidate.stakedPosition.id,
        cumulativeReward: candidate.cumulativeReward,
        updatedAtTimestamp: 0,
        merkleRoot,
        isRewardsDistributed: false,
        distributionSkipped: false,
        blockNumber: block.number,
        wallet_id: candidate.stakedPosition.wallet_id,
        stakingPool_id: STAKING_POOL_ENTITY_ID,
        uniPosition_id: candidate.uniPosition.id,
      });
    }
  },
);

UniswapV4Staking.Reward.handler(async ({ event, context }) => {
  /**
   * Reward Event Handler
   * --------------------
   * Triggered when a rewards distribution occurs on-chain from the staking contract
   *
   * This handler:
   * 1. Updates the staking pool's total rewards added.
   * 2. Records an hourly/daily aggregate record for the pool.
   * 3. Marks all pending cumulative reward records as either distributed (if their merkle root matches)
   *    or skipped (if they belong to a different root). Pending records are those with updatedAtTimestamp = 0.
   */
  const {
    chainId,
    block: { timestamp },
    params: { merkleRoot, amount },
    srcAddress: stakingContractAddress,
    transaction: { hash },
  } = event;

  const stakingEntityId = `${chainId}-${stakingContractAddress}`;

  const stakingPool = await context.StakingPoolV4.get(stakingEntityId);
  if (!stakingPool) return;

  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  const updatedTotalRewards = stakingPool.totalRewardsAdded + amount;
  context.StakingPoolV4.set({
    ...stakingPool,
    totalRewardsAdded: updatedTotalRewards,
  });

  context.StakingPoolV4Record.set({
    id: `${stakingPool.id}-${hourId}`,
    chainId,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    pool_id: stakingPool.id,
    totalRewards: updatedTotalRewards,
    transactionHash: hash,
  });

  // Fetch all pending cumulative reward records.
  // A pending record has updatedAtTimestamp = 0, meaning it was created
  // by a daily rewards calculation but not yet marked as distributed.
  const pendingRewards =
    await context.UserCumulativeReward.getWhere.updatedAtTimestamp.eq(0);
  if (pendingRewards.length === 0) return;

  // Update each pending reward: mark as distributed if merkleRoot matches, otherwise skipped
  for (const pending of pendingRewards) {
    const isMatch = pending.merkleRoot === merkleRoot;
    context.UserCumulativeReward.set({
      ...pending,
      isRewardsDistributed: isMatch,
      updatedAtTimestamp: timestamp,
      distributionSkipped: !isMatch,
    });
  }
});

UniswapV4Staking.RewardsClaimed.handler(async ({ event, context }) => {
  /**
   * RewardsClaimed Event Handler
   * -----------------------------
   * Triggered when a user claims rewards from the staking contract
   *
   * This handler:
   * 1. Updates the staking pool's total claimed rewards.
   * 2. Creates a position record entry for the claim, used for historical tracking and aggregation.
   */

  const {
    chainId,
    block: { timestamp },
    params: { tokenId, amount },
    srcAddress: stakingContractAddress,
    transaction: { hash },
    logIndex,
  } = event;

  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  const tokenEntityId = `${chainId}-${tokenId}`;
  const stakingEntityId = `${chainId}-${stakingContractAddress}`;

  const uniswapV4PositionToken =
    await context.UniswapV4PositionToken.get(tokenEntityId);
  if (!uniswapV4PositionToken) return;

  const stakingPool = await context.StakingPoolV4.get(stakingEntityId);
  if (!stakingPool) return;

  context.StakingPoolV4.set({
    ...stakingPool,
    totalRewardsClaimed: stakingPool.totalRewardsClaimed + amount,
  });

  context.StakingPoolV4PositionRecord.set({
    id: `${stakingPool.id}-${uniswapV4PositionToken.tokenId}-${hourId}-${logIndex}`,
    chainId,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    pool_id: stakingPool.id,
    rewardsClaimed: amount,
    rewardsBurned: 0n,
    transactionHash: hash,
    tokenId: uniswapV4PositionToken.tokenId,
    transactionType: "REWARDS_CLAIMED",
  });
});

UniswapV4Staking.RewardsBurned.handler(async ({ event, context }) => {
  /**
   * RewardsBurned Event Handler
   * ----------------------------
   * Triggered when rewards are burned (slashed) due to early withdrawal or other penalties
   *
   * This handler:
   * 1. Updates the staking pool's total burned rewards.
   * 2. Creates a position record entry for the burn, used for historical tracking and aggregation.
   */

  const {
    chainId,
    block: { timestamp },
    params: { tokenId, amount },
    srcAddress: stakingContractAddress,
    transaction: { hash },
    logIndex,
  } = event;

  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  const tokenEntityId = `${chainId}-${tokenId}`;
  const stakingEntityId = `${chainId}-${stakingContractAddress}`;

  const uniswapV4PositionToken =
    await context.UniswapV4PositionToken.get(tokenEntityId);
  if (!uniswapV4PositionToken) return;

  const stakingPool = await context.StakingPoolV4.get(stakingEntityId);
  if (!stakingPool) return;

  context.StakingPoolV4.set({
    ...stakingPool,
    totalRewardsBurned: stakingPool.totalRewardsBurned + amount,
  });

  context.StakingPoolV4PositionRecord.set({
    id: `${stakingPool.id}-${uniswapV4PositionToken.tokenId}-${hourId}-${logIndex}`,
    chainId,
    dayStartTimestamp: dayStart,
    hourStartTimestamp: hourStart,
    pool_id: stakingPool.id,
    rewardsClaimed: 0n,
    rewardsBurned: amount,
    transactionHash: hash,
    tokenId: uniswapV4PositionToken.tokenId,
    transactionType: "REWARDS_BURNED",
  });
});
