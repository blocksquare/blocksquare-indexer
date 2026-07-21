import { indexer, OceanpointValuation } from "envio";
import { getNewOceanpointTokenInformation } from '../helper/OceanpointTokenValuation';
import {
  getStakingPoolAddressFromValuationAddress,
  getStakingPoolTypeFromValuationAddress,
} from '../helper/PropertyStakingPool';
import { BIGINT_100K } from '../helper/constants';

indexer.onEvent(
  { contract: "OceanpointValuation", event: "ValuationUpdate" },
  async ({ event, context }) => {
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
}
);

indexer.onEvent(
  { contract: "OceanpointValuation", event: "APYUpdate" },
  async ({ event, context }) => {
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
}
);
