import { PropertyTokenRevenueDistribution } from "envio";
import { type PropertyToken, propertyTokenRecord } from "envio";
import { normalizeTimestampToSeconds } from './time';

export const getNewPropertyTokenRevenueDistribution = ({
  propertyToken,
  chainId,
  blockTimestamp,
  contractAddress,
  users,
  amounts,
  fromTime,
  toTime,
  tokenRecords,
}: {
  propertyToken: PropertyToken;
  chainId: number;
  blockTimestamp: number;
  contractAddress: string;
  users: string[];
  amounts: bigint[];
  fromTime: bigint;
  toTime: bigint;
  tokenRecords: propertyTokenRecord[];
}): PropertyTokenRevenueDistribution => {
  //Get total supply and property valuation for the period of the distribution instead of the current time
  const { totalSupply, propertyValuation } = getSupplyAndValuationForPeriod(
    normalizeTimestampToSeconds(Number(fromTime)),
    normalizeTimestampToSeconds(Number(toTime)),
    tokenRecords,
  );

  return {
    id: `${propertyToken.id}-${contractAddress}-${blockTimestamp}`,
    blockTimestamp: blockTimestamp,
    chainId,
    contractAddress,
    users: users,
    amounts: amounts,
    totalAmount: amounts.reduce((a, b) => a + b, 0n),
    fromTime: fromTime,
    toTime: toTime,
    totalSupply: totalSupply !== 0n ? totalSupply : propertyToken.totalSupply, // Use the current total supply if no data is found
    propertyValuation:
      propertyValuation !== 0n ? propertyValuation : propertyToken.propertyValuation, // Use the current property valuation if no data is found
    propertyToken_id: propertyToken.id,
  };
};

const getSupplyAndValuationForPeriod = (
  fromTime: number,
  toTime: number,
  tokenRecords: Array<any>,
): { totalSupply: bigint; propertyValuation: bigint } => {
  tokenRecords.sort((a, b) => a.dayStartTimestamp - b.dayStartTimestamp);

  // Binary search for the closest matching token record
  let startIndex = 0;
  let endIndex = tokenRecords.length - 1;
  let closestMatchingRecord = null;

  while (startIndex <= endIndex) {
    const middleIndex = Math.floor((startIndex + endIndex) / 2);
    const currentRecord = tokenRecords[middleIndex];

    // Check if the current entry's timestamp falls within the specified range
    if (currentRecord.dayStartTimestamp >= fromTime && currentRecord.dayStartTimestamp <= toTime) {
      closestMatchingRecord = currentRecord;
      break;
    }

    // Narrow the search range based on the timestamp comparison
    if (currentRecord.dayStartTimestamp < fromTime) {
      startIndex = middleIndex + 1; // Search in the right half of the array
    } else {
      endIndex = middleIndex - 1; // Search in the left half of the array
    }
  }

  if (!closestMatchingRecord) {
    console.warn(`No matching data found for interval:${fromTime}-${toTime}`);
    return { totalSupply: 0n, propertyValuation: 0n }; // Return default values if no match is found
  }

  return {
    totalSupply: closestMatchingRecord.totalSupply,
    propertyValuation: closestMatchingRecord.propertyValuation,
  };
};
