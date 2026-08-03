import { OceanpointValuation } from 'generated';
import { getNewOceanpointTokenInformation } from '../helper/OceanpointTokenValuation';
import {
  getStakingPoolAddressFromValuationAddress,
  getStakingPoolTypeFromValuationAddress,
} from '../helper/PropertyStakingPool';
import { BIGINT_100K } from '../helper/constants';

OceanpointValuation.ValuationUpdate.handler(async ({ event, context }) => {
  const stakingPoolAdddress = getStakingPoolAddressFromValuationAddress(event.srcAddress);

  const stakingPoolType = getStakingPoolTypeFromValuationAddress(event.srcAddress);

  const valuation = await context.OceanpointTokenInformation.getOrCreate(
    getNewOceanpointTokenInformation(
      event.chainId,
      event.params.property,
      event.srcAddress,
      stakingPoolAdddress,
      stakingPoolType,
    ),
  );

  const valuePerBSPT = event.params.newValuation / BIGINT_100K;

  context.OceanpointTokenInformation.set({
    ...valuation,
    valuation: event.params.newValuation,
    valuationFrom: event.srcAddress,
    valuePerBSPT,
    propertyStakingPoolType: stakingPoolType,
  });
});

OceanpointValuation.APYUpdate.handler(async ({ event, context }) => {
  const stakingPoolAdddress = getStakingPoolAddressFromValuationAddress(event.srcAddress);

  const stakingPoolType = getStakingPoolTypeFromValuationAddress(event.srcAddress);

  const valuation = await context.OceanpointTokenInformation.getOrCreate(
    getNewOceanpointTokenInformation(
      event.chainId,
      event.params.property,
      event.srcAddress,
      stakingPoolAdddress,
      stakingPoolType,
    ),
  );

  context.OceanpointTokenInformation.set({
    ...valuation,
    apy: event.params.newAPY,
    propertyStakingPoolType: stakingPoolType,
  });
});
