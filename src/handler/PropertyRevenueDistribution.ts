import { PropertyRevenueDistribution } from 'generated';
import { getNewPropertyTokenRevenue } from '../helper/PropertyTokenRevenue';
import { getNewPropertyTokenRevenueDistribution } from '../helper/PropertyTokenRevenueDistribution';
import { getNewPropertyTokenRevenueClaim } from '../helper/PropertyTokenRevenueClaim';
import { getAPY } from '../helper/APYCalculation';

PropertyRevenueDistribution.RevenueAdded.handler(async ({ event, context }) => {
  const propertyId = `${event.chainId}-${event.params.property}`;

  const [propertyTokenRevenueDistributionsLoaded, propertyTokenRecordsLoaded, propertyTokenLoaded] = await Promise.all([
      await context.PropertyTokenRevenueDistribution.getWhere.propertyToken_id.eq(propertyId),
      await context.PropertyTokenRecord.getWhere.propertyToken_id.eq(propertyId),
      await context.PropertyToken.getOrThrow(propertyId, 'PropertyRevenueDistribution.RevenueAdded.handler: Property not found')
  ]);

  const propertyTokenRevenues = await Promise.all(event.params.users.map(async (user): Promise<{ user: string, revenue: any }> => {
      return {
          user,
          revenue: await context.PropertyTokenRevenue.getOrCreate(
              getNewPropertyTokenRevenue(propertyTokenLoaded, user)
          )
      };
  }))

  const propertyTokenRevenuesLoaded = propertyTokenRevenues.reduce((propertyTokenRevenues, { user, revenue }) => {
      propertyTokenRevenues[user] = revenue;
      return propertyTokenRevenues;
  }, {} as { [key: string]: any });


    // There can be multiple entries for the same user. We need to aggregate all the amounts for the same user.
    const aggregatedPendingRevenues = event.params.users.reduce<Record<string, bigint>>((acc, user, index) => {
        acc[user] = (acc[user] ?? 0n) + event.params.amounts[index];
        return acc;
    }, {});

    for (const [user, totalPendingRevenue] of Object.entries(aggregatedPendingRevenues)) {
        const propertyTokenRevenue = propertyTokenRevenuesLoaded[user];
        context.PropertyTokenRevenue.set({
          ...propertyTokenRevenue,
          pendingRevenue: propertyTokenRevenue.pendingRevenue + totalPendingRevenue,
        });
    }

      const currentPropertyTokenRevenueDistribution =
          getNewPropertyTokenRevenueDistribution(
              propertyTokenLoaded,
              event.chainId,
              event.block.timestamp,
              event.params.users,
              event.params.amounts,
              event.params.fromTime,
              event.params.toTime,
              propertyTokenRecordsLoaded
          );

      context.PropertyTokenRevenueDistribution.set(
          currentPropertyTokenRevenueDistribution
      );

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
    `${event.chainId}-${event.params.property}-${event.params.user}`,
    'PropertyRevenueDistribution.RevenueClaimed.handler: PropertyTokenRevenue not found'
  );

    context.PropertyTokenRevenue.set({
      ...propertyTokenRevenue,
      pendingRevenue: propertyTokenRevenue.pendingRevenue - event.params.amount,
      claimedRevenue: propertyTokenRevenue.claimedRevenue + event.params.amount,
    });

    // Create revenue claim record
    const propertyTokenId = `${event.chainId}-${event.params.property}`;
    const walletId = `${event.chainId}-${event.params.user}`;

    const revenueClaim = getNewPropertyTokenRevenueClaim(
      event.chainId,
      event.transaction.hash,
      event.block.number,
      event.block.timestamp,
      event.logIndex,
      propertyTokenId,
      walletId,
      event.params.amount
    );

    context.PropertyTokenRevenueClaim.set(revenueClaim);
});