export const ensureOfferingV2 = async (chainId: number, propertyId: string, context: any) => {
  const existing = await context.PropertyTokenOfferingV2.get(propertyId);

  if (!existing) {
    const propertyToken = await context.PropertyToken.getOrThrow(
      propertyId,
      'PropertyTokenOfferingV2: PropertyToken not found',
    );

    context.PropertyTokenOfferingV2.set({
      id: propertyId,
      chainId,
      property_id: propertyId,
    });

    context.PropertyToken.set({
      ...propertyToken,
      offeringV2_id: propertyId,
    });
  }
};
