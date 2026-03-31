import { OceanpointTokenInformation } from 'generated';
import { PropertyStakingPoolType } from '../types/enums';

export const getNewOceanpointTokenInformation = (
  chainId: number,
  propertyAddress: string,
  contractAddress: string,
  propertyStakingContractAddress: string,
  poolType: PropertyStakingPoolType,
): OceanpointTokenInformation => {
  return {
    id: `${chainId}-${propertyAddress}-${contractAddress}`,
    chainId,
    apy: 0n,
    valuation: 0n,
    valuationFrom: '',
    propertyStakingPool_id: `${chainId}-${propertyStakingContractAddress}`,
    propertyToken_id: `${chainId}-${propertyAddress}`,
    valuePerBSPT: 0n,
    propertyStakingPoolType: poolType,
  };
};
