import { CertifiedPartners } from 'generated';
import { getNewCertifiedPartner } from '../helper/CertifiedPartner';
import { getNewUserCertifiedPartner } from '../helper/UserCertifiedPartner';
import { getNewWallet } from '../helper/Wallet';

CertifiedPartners.AddedCertifiedPartner.handler(async ({ event, context }) => {
  const certifiedPartner = getNewCertifiedPartner(event.chainId, event.params.cpBytes);
  context.CertifiedPartner.set({
    ...certifiedPartner,
    name: event.params.cp,
  });
});

CertifiedPartners.AddedWallet.handler(async ({ event, context }) => {
  const wallet = await context.Wallet.getOrCreate(getNewWallet(event.chainId, event.params.wallet));

  // Only update if certifiedPartner_id changed
  const newCertifiedPartnerId = `${event.chainId}-${event.params.cp}`;
  if (wallet.certifiedPartner_id !== newCertifiedPartnerId) {
    context.Wallet.set({
      ...wallet,
      certifiedPartner_id: newCertifiedPartnerId,
    });
  }
});

CertifiedPartners.RemovedWallet.handler(async ({ event, context }) => {
  const wallet = await context.Wallet.getOrThrow(
    `${event.chainId}-${event.params.wallet}`,
    'CertifiedPartners.RemovedWallet.handler: Wallet not found',
  );

  context.Wallet.set({
    ...wallet,
    certifiedPartner_id: undefined,
  });
});

CertifiedPartners.AddedWhitelisted.handler(async ({ event, context }) => {
  for (let i = 0; i < event.params.users.length; i++) {
    context.UserCertifiedPartner.set(
      getNewUserCertifiedPartner(event.chainId, event.params.users[i], event.params.cp),
    );
  }
});

CertifiedPartners.RemovedWhitelisted.handler(async ({ event, context }) => {
  for (let i = 0; i < event.params.users.length; i++) {
    const user = event.params.users[i];
    context.UserCertifiedPartner.deleteUnsafe(`${event.chainId}-${user}-${event.params.cp}`);
  }
});
