import { Dayjs } from "dayjs";
import { PropertyStakingPoolType } from "./enums";

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
  propertyStakingContracts: Array<{
    address: string;
    valuationAddress: string;
    type: PropertyStakingPoolType;
  }>;
  uniswapPoolContracts: Array<{
    assetPairId: string;
    address: string;
  }>;
  propertyTokenOfferingAddress: string;
  uniswapWethDaiPoolAddress: string;
  usersRegistryAddress: string;
  zeroExAddress: string;
  zeroExStartBlock: number;
  oneInchPostInteractionAddress: string;
  uniswapV4PoolManagerAddress: string,
  uniswapV4PositionManagerAddress: string,
  uniswapV4StakingAddress: string,
};

export type PropertyTokenRevenueDistributionInterval = {
  fromDate: Dayjs;
  toDate: Dayjs;
  totalRewards: bigint;
  tokenSupply: bigint;
  propertyValuation: bigint;
};
