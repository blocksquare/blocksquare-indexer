import { Dayjs } from 'dayjs';
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
  uniswapPoolContracts: Record<string, {
    address: string;
    token0PairId: string;
    token1PairId: string;
  }>;
  propertyTokenOfferingAddress: string;
  propertyTokenOfferingV2Address: string | null;
  uniswapWethDaiPoolAddress: string;
  usersRegistryAddress: string;
  zeroExAddress: string;
  zeroExStartBlock: number;
  oneInchPostInteractionAddress: string;
};

export type PropertyTokenRevenueDistributionInterval = {
  fromDate: Dayjs;
  toDate: Dayjs;
  totalRewards: bigint;
  tokenSupply: bigint;
  propertyValuation: bigint;
};
