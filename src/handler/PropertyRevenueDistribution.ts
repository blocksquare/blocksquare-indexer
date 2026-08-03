import { PropertyRevenueDistribution } from 'generated';
import { getNewPropertyTokenRevenue } from '../helper/PropertyTokenRevenue';
import { getNewPropertyTokenRevenueDistribution } from '../helper/PropertyTokenRevenueDistribution';
import { getNewPropertyTokenRevenueClaim } from '../helper/PropertyTokenRevenueClaim';
import { getAPY } from '../helper/APYCalculation';

PropertyRevenueDistribution.RevenueAdded.handler(async ({ event, context }) => {
  const propertyId = `${event.chainId}-${event.params.property}`;

  const [propertyTokenRevenueDistributionsLoaded, propertyTokenRecordsLoaded, propertyTokenLoaded] =
    await Promise.all([
      await context.PropertyTokenRevenueDistribution.getWhere.propertyToken_id.eq(propertyId),
      await context.PropertyTokenRecord.getWhere.propertyToken_id.eq(propertyId),
      await context.PropertyToken.getOrThrow(
        propertyId,
        'PropertyRevenueDistribution.RevenueAdded.handler: Property not found',
      ),
    ]);

  const propertyTokenRevenues = await Promise.all(
    event.params.users.map(async (user): Promise<{ user: string; revenue: any }> => {
      return {
        user,
        revenue: await context.PropertyTokenRevenue.getOrCreate(
          getNewPropertyTokenRevenue(propertyTokenLoaded, user, event.srcAddress),
        ),
      };
    }),
  );

  const propertyTokenRevenuesLoaded = propertyTokenRevenues.reduce(
    (propertyTokenRevenues, { user, revenue }) => {
      propertyTokenRevenues[user] = revenue;
      return propertyTokenRevenues;
    },
    {} as { [key: string]: any },
  );

  // There can be multiple entries for the same user. We need to aggregate all the amounts for the same user.
  const aggregatedPendingRevenues = event.params.users.reduce<Record<string, bigint>>(
    (acc, user, index) => {
      acc[user] = (acc[user] ?? 0n) + event.params.amounts[index];
      return acc;
    },
    {},
  );

  for (const [user, totalPendingRevenue] of Object.entries(aggregatedPendingRevenues)) {
    const propertyTokenRevenue = propertyTokenRevenuesLoaded[user];
    context.PropertyTokenRevenue.set({
      ...propertyTokenRevenue,
      pendingRevenue: propertyTokenRevenue.pendingRevenue + totalPendingRevenue,
    });
  }

  const currentPropertyTokenRevenueDistribution = getNewPropertyTokenRevenueDistribution({
    propertyToken: propertyTokenLoaded,
    chainId: event.chainId,
    blockTimestamp: event.block.timestamp,
    contractAddress: event.srcAddress,
    users: event.params.users,
    amounts: event.params.amounts,
    fromTime: event.params.fromTime,
    toTime: event.params.toTime,
    tokenRecords: propertyTokenRecordsLoaded,
  });

  context.PropertyTokenRevenueDistribution.set(currentPropertyTokenRevenueDistribution);

  const allRevenueDistributions = [
    ...propertyTokenRevenueDistributionsLoaded,
    currentPropertyTokenRevenueDistribution,
  ];

  const { allTimeAPY, currentYearAPY } = getAPY(allRevenueDistributions);

  context.PropertyToken.set({
    ...propertyTokenLoaded,
    apy: allTimeAPY,
    currentYearApy: currentYearAPY,
  });
});

PropertyRevenueDistribution.RevenueClaimed.handler(async ({ event, context }) => {
  // Skip if amount is 0
  if (event.params.amount === 0n) return;

  const propertyTokenRevenue = await context.PropertyTokenRevenue.getOrThrow(
    `${event.chainId}-${event.params.property}-${event.srcAddress}-${event.params.user}`,
    'PropertyRevenueDistribution.RevenueClaimed.handler: PropertyTokenRevenue not found',
  );

  context.PropertyTokenRevenue.set({
    ...propertyTokenRevenue,
    pendingRevenue: propertyTokenRevenue.pendingRevenue - event.params.amount,
    claimedRevenue: propertyTokenRevenue.claimedRevenue + event.params.amount,
  });

  // Create revenue claim record
  const propertyTokenId = `${event.chainId}-${event.params.property}`;
  const walletId = `${event.chainId}-${event.params.user}`;

  const revenueClaim = getNewPropertyTokenRevenueClaim({
    chainId: event.chainId,
    contractAddress: event.srcAddress,
    transactionHash: event.transaction.hash,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    logIndex: event.logIndex,
    propertyTokenId,
    walletId,
    amount: event.params.amount,
  });

  context.PropertyTokenRevenueClaim.set(revenueClaim);
});
