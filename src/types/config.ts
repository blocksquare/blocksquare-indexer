import type { Dayjs } from 'dayjs';
import { PropertyStakingPoolType } from './enums';

export type Config = {
  chainId: number;
  startBlock: number;
  blockSquareTokenAddress: string;
  certifiedPartnersAddress: string;
  dataStorageProxyAddress: string;
  governancePoolAddress: string;
  liquidityStakingContracts: Array<{
    address: string;
  }>;
  marketPlacePoolFactoryAddress: string | null;
  propertyFactoryAddress: string;
  propertyRegistryAddress: string;
  propertyRevenueDistributionAddress: string;
  legacyPropertyRevenueDistributionAddress?: string;
  propertyStakingContracts: Array<{
    address: string;
    valuationAddress: string;
    type: PropertyStakingPoolType;
  }>;
  uniswapPoolContracts: Record<
    string,
    {
      address: string;
      token0PairId: string;
      token1PairId: string;
    }
  >;
  propertyTokenOfferingAddress: string;
  propertyTokenOfferingV2Address: string | null;
  uniswapWethDaiPoolAddress: string;
  usersRegistryAddress: string;
  zeroExAddress: string;
  zeroExStartBlock: number;
  oneInchPostInteractionAddress: string;
  uniswapV4PoolManagerAddress: string,
  uniswapV4PositionManagerAddress: string,
  uniswapV4StakingAddress: string,
  // Extra V4 poolIds (keccak256 of PoolKey) whose Swap/ModifyLiquidity events are
  // indexed in addition to the auto-derived standard-tier ETH/BST pools.
  // Only needed for ETH/BST pools with hooks or non-standard tick spacing.
  uniswapV4ExtraPoolIds: string[],
};

export type PropertyTokenRevenueDistributionInterval = {
  fromDate: Dayjs;
  toDate: Dayjs;
  totalRewards: bigint;
  tokenSupply: bigint;
  propertyValuation: bigint;
};
