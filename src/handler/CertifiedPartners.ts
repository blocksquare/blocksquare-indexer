import { indexer, CertifiedPartners } from "envio";
import { getNewCertifiedPartner } from '../helper/CertifiedPartner';
import { getNewUserCertifiedPartner } from '../helper/UserCertifiedPartner';
import { getNewWallet } from '../helper/Wallet';

indexer.onEvent(
  { contract: "CertifiedPartners", event: "AddedCertifiedPartner" },
  async ({ event, context }) => {
  const certifiedPartner = getNewCertifiedPartner(event.chainId, event.params.cpBytes);
  context.CertifiedPartner.set({
    ...certifiedPartner,
    name: event.params.cp,
  });
}
);

indexer.onEvent(
  { contract: "CertifiedPartners", event: "AddedWallet" },
  async ({ event, context }) => {
  const wallet = await context.Wallet.getOrCreate(getNewWallet(event.chainId, event.params.wallet));

  // Only update if certifiedPartner_id changed
  const newCertifiedPartnerId = `${event.chainId}-${event.params.cp}`;
  if (wallet.certifiedPartner_id !== newCertifiedPartnerId) {
    context.Wallet.set({
      ...wallet,
      certifiedPartner_id: newCertifiedPartnerId,
    });
  }
}
);

indexer.onEvent(
  { contract: "CertifiedPartners", event: "RemovedWallet" },
  async ({ event, context }) => {
  const wallet = await context.Wallet.getOrThrow(
    `${event.chainId}-${event.params.wallet}`,
    'CertifiedPartners.RemovedWallet.handler: Wallet not found',
  );

  context.Wallet.set({
    ...wallet,
    certifiedPartner_id: undefined,
  });
}
);

indexer.onEvent(
  { contract: "CertifiedPartners", event: "AddedWhitelisted" },
  async ({ event, context }) => {
  for (let i = 0; i < event.params.users.length; i++) {
    context.UserCertifiedPartner.set(
      getNewUserCertifiedPartner(event.chainId, event.params.users[i], event.params.cp),
    );
  }
}
);

indexer.onEvent(
  { contract: "CertifiedPartners", event: "RemovedWhitelisted" },
  async ({ event, context }) => {
  for (let i = 0; i < event.params.users.length; i++) {
    const user = event.params.users[i];
    context.UserCertifiedPartner.deleteUnsafe(`${event.chainId}-${user}-${event.params.cp}`);
  }
}
);
