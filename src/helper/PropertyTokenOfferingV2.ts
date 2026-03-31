export const getOfferingV2Id = (chainId: number, property: string) => `${chainId}-${property}`;

export const getMainSaleId = (chainId: number, property: string, mainSaleId: bigint) =>
  `${chainId}-${property}-${mainSaleId}`;

export const getPresaleId = (chainId: number, property: string, presaleId: bigint) =>
  `${chainId}-${property}-${presaleId}`;

/**
 * Ensures a PropertyTokenOfferingV2 entity exists for the given property.
 * Creates one if it doesn't exist yet, and links it to the PropertyToken.
 */
export const ensureOfferingV2 = async (chainId: number, property: string, context: any) => {
  const offeringV2Id = getOfferingV2Id(chainId, property);
  const existing = await context.PropertyTokenOfferingV2.get(offeringV2Id);

  if (!existing) {
    //Property Token which we want to put on the sale must exist in PropertyToken if not then through
    const propertyToken = await context.PropertyToken.getOrThrow(
      `${chainId}-${property}`,
      'PropertyTokenOfferingV2: PropertyToken not found',
    );

    context.PropertyTokenOfferingV2.set({
      id: offeringV2Id,
      chainId,
      property_id: `${chainId}-${property}`,
    });

    context.PropertyToken.set({
      ...propertyToken,
      offeringV2_id: offeringV2Id,
    });
  }
};
