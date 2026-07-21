import { indexer, Users } from "envio";
import { getNewUser } from '../helper/User';
import { getNewWallet } from '../helper/Wallet';

indexer.onEvent(
  { contract: "Users", event: "AddedWallet" },
  async ({ event, context }) => {
  const [user, wallet] = await Promise.all([
    context.User.getOrCreate(getNewUser(event.chainId, event.params.user)),
    context.Wallet.getOrCreate(getNewWallet(event.chainId, event.params.wallet)),
  ]);

  // Only update if user_id changed
  if (wallet.user_id !== user.id) {
    context.Wallet.set({
      ...wallet,
      user_id: user.id,
    });
  }
}
);

indexer.onEvent(
  { contract: "Users", event: "RemovedWallet" },
  async ({ event, context }) => {
  const wallet = await context.Wallet.getOrThrow(
    `${event.chainId}-${event.params.wallet}`,
    'UsersContract_RemovedWallet_handler: Wallet not found',
  );

  context.Wallet.set({
    ...wallet,
    user_id: undefined,
  });
}
);
