import { ethers, keccak256, parseUnits } from "ethers";
import MerkleTree from "merkletreejs";

// Total monthly rewards distributed to stakers in wei.
// TODO: this set to 300 for testing, we should replace this with the correct amount for mainnet
export const TOTAL_MONTHLY_REWARDS = parseUnits("300", 18);

// Daily reward amount = monthly / 30 (integer division).
export const TOTAL_DAILY_REWARDS = TOTAL_MONTHLY_REWARDS / 30n;

const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Determines whether a Uniswap V4 position is currently in-range (active)
 * and returns its active liquidity.
 *
 * @param uniPosition - The Uniswap V4 position object containing tick bounds and liquidityDelta.
 * @param currentTick - The current tick of the pool.
 * @returns The active liquidity (liquidityDelta if in-range, otherwise 0n).
 */
export function calculateActiveLiquidity(
  uniPosition: { tickLower: number; tickUpper: number; liquidityDelta: bigint },
  currentTick: number
): bigint {
  const inRange = currentTick >= uniPosition.tickLower && currentTick < uniPosition.tickUpper;
  return inRange ? uniPosition.liquidityDelta : 0n;
}

/**
 * Builds a Merkle tree from an array of reward data (tokenId + cumulativeReward).
 * Each leaf is the keccak256 hash of (tokenId, cumulativeReward).
 *
 * @param positions - Array of objects containing tokenId and cumulativeReward.
 * @returns An object containing the Merkle tree instance and its hex root.
 */
export function buildMerkleTree(positions: Array<{ tokenId: bigint; cumulativeReward: bigint }>) {
  const leaves = positions.map(({ tokenId, cumulativeReward }) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"],
        [tokenId, cumulativeReward]
      )
    )
  );
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return { tree, root: tree.getHexRoot() };
}

/**
 * Returns the predicted number of blocks per day for a given chain.
 * Used to schedule daily onBlock handlers.
 *
 * @param chainId - The chain ID
 * @returns Number of blocks expected in a 24-hour period.
 */
export const getPredictedDailyBlockCount = (chainId: number) => {
    return chainId === SEPOLIA_CHAIN_ID ? 7080 : 7200;
}

/**
 * Returns the block number at which the Uniswap V4 Staking contract was deployed
 * on the specified chain. Used as the startBlock for daily reward calculations.
 *
 * @param chainId - The chain ID.
 * @returns The deployment block number.
 */
export const getUniswapV4StakingDeployementBlock = (chainId: number) => {
    // TODO: Replace with mainnet deployment block when available.
    return chainId === SEPOLIA_CHAIN_ID ? 10245814 : 10245814;
}