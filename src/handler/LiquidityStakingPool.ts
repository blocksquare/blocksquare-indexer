import { indexer, LiquidityStakingPool } from "envio";
import {
  StakingDepositHandler,
  StakingWithdrawHandler,
  StakingRewardHandler,
} from '../helper/StakingPool';

indexer.onEvent(
  { contract: "LiquidityStakingPool", event: "Deposit" },
  async ({ event, context }) => {
  await StakingDepositHandler(event, context);
}
);

indexer.onEvent(
  { contract: "LiquidityStakingPool", event: "Withdraw" },
  async ({ event, context }) => {
  await StakingWithdrawHandler(event, context);
}
);

indexer.onEvent(
  { contract: "LiquidityStakingPool", event: "Reward" },
  async ({ event, context }) => {
  await StakingRewardHandler(event, context);
}
);
