import { ZeroAddress } from 'ethers';
import { indexer, GovernancePool } from "envio";
import {
  getNewStakingPoolPosition,
  StakingDepositHandler,
  StakingWithdrawHandler,
  StakingRewardHandler,
} from '../helper/StakingPool';
import { getNewWallet } from '../helper/Wallet';

indexer.onEvent(
  { contract: "GovernancePool", event: "Deposit" },
  async ({ event, context }) => {
  await StakingDepositHandler(event, context);
}
);

indexer.onEvent(
  { contract: "GovernancePool", event: "Withdraw" },
  async ({ event, context }) => {
  await StakingWithdrawHandler(event, context);
}
);

indexer.onEvent(
  { contract: "GovernancePool", event: "Transfer" },
  async ({ event, context }) => {
  // Skip if value is zero
  if (event.params.value === 0n) return;
  // Skip if from or two is zero address. This is handled by the deposit / withdraw already
  if (event.params.from == ZeroAddress || event.params.to == ZeroAddress)
    return;

  const fromPoolPositionId = `${event.chainId}-${event.srcAddress}-${event.params.from}`;
  const toPoolPositionId = `${event.chainId}-${event.srcAddress}-${event.params.to}`;
  const [fromPoolPosition, loadedToPoolPosition] = await Promise.all([
    context.StakingPoolPosition.getOrThrow(
      fromPoolPositionId,
      'GovernancePool.Transfer.handler: StakingPoolPosition not found'
    ),
    context.StakingPoolPosition.get(toPoolPositionId),
  ]);

  const newFromSAmount = fromPoolPosition.issuedAmount - event.params.value;
  if (newFromSAmount === 0n) {
    context.StakingPoolPosition.deleteUnsafe(fromPoolPositionId);
  } else {
    context.StakingPoolPosition.set({
      ...fromPoolPosition,
      issuedAmount: newFromSAmount,
    });
  }

  let toPoolPosition = loadedToPoolPosition;

  if (!toPoolPosition) {
    const toWallet = await context.Wallet.get(
      `${event.chainId}-${event.params.to}`
    );
    if (!toWallet) {
      context.Wallet.set(getNewWallet(event.chainId, event.params.to));
    }
    toPoolPosition = getNewStakingPoolPosition(
      event.chainId,
      event.srcAddress,
      event.params.to
    );
  }

  context.StakingPoolPosition.set({
    ...toPoolPosition,
    chainId: event.chainId,
    issuedAmount: toPoolPosition.issuedAmount + event.params.value,
  });
}
);

indexer.onEvent(
  { contract: "GovernancePool", event: "Reward" },
  async ({ event, context }) => {
  await StakingRewardHandler(event, context);
}
);
