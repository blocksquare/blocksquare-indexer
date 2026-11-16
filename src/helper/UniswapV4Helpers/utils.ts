import { ethers, keccak256 } from "ethers";
import { MerkleTree } from "merkletreejs";
import { getLoadedConfig } from "../../config";

// Total monthly rewards distributed to stakers in wei, set per chain in the config.
export const TOTAL_MONTHLY_REWARDS = getLoadedConfig().uniswapV4StakingMonthlyRewards;

// Daily reward amount = monthly / 30 (integer division).
export const TOTAL_DAILY_REWARDS = TOTAL_MONTHLY_REWARDS / 30n;

// Precision factor for timeBoost values.
// A boost of 100 represents 1.0x (no boost), 122 = 1.22x, etc.
// Used to normalize boosted liquidity calculations.
export const BOOST_PRECISION = 100n;

const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Builds a Merkle tree from reward buckets, one per (tokenId, epoch).
 * Each leaf is keccak256(abi.encode(uint256 tokenId, uint256 epoch, uint256 cumulativeReward)),
 * where cumulativeReward is the running total earned by that one deposit of the NFT.
 *
 * @param records - Reward buckets, in leaf order.
 * @returns The Merkle tree instance, its hex root, and `proofs[i]`, the hex proof for `records[i]`.
 */
export function buildMerkleTree(
  records: Array<{ tokenId: bigint; epoch: bigint; cumulativeReward: bigint }>,
) {
  const leaves = records.map(({ tokenId, epoch, cumulativeReward }) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256"],
        [tokenId, epoch, cumulativeReward]
      )
    )
  );
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  // Proofs are looked up by leaf index. Looking them up by leaf hash scans every leaf per proof,
  // which is O(n²): about 20s for 50k records.
  const proofs = leaves.map((_, i) => tree.getHexProof(tree.getLeaf(i), i));
  return { tree, root: tree.getHexRoot(), proofs };
}

/** Comparator for sorting bigints ascending, e.g. `records.sort((a, b) => compareBigInt(a.tokenId, b.tokenId))`. */
export const compareBigInt = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

/** Leaf order of a reward tree: by tokenId, then epoch, so the same state always gives the same root. */
export const compareRewardBuckets = (
  a: { tokenId: bigint; epoch: bigint },
  b: { tokenId: bigint; epoch: bigint },
) => compareBigInt(a.tokenId, b.tokenId) || compareBigInt(a.epoch, b.epoch);

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

// Uniswap V4 poolId = keccak256(abi.encode(PoolKey)).
export const computeV4PoolId = (
  currency0: string,
  currency1: string,
  fee: bigint,
  tickSpacing: bigint,
  hooks: string,
): string =>
  keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [currency0, currency1, fee, tickSpacing, hooks],
    ),
  );
