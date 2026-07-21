import { PropertyTokenHolder, PropertyTokenRecord } from "envio";
import { getDay, getHour } from './date';
import { type PropertyToken } from "envio";

export const MOCK_PROPERTY_ADDRESS = '0x489632e4953c0EeE5E327dc1527838d7E9B5dD32';

export const getNewPropertyToken = (
  chainId: number,
  tokenAddress: string,
  certifiedPartnerId: string,
  certifiedPartnerWalletId: string,
): PropertyToken => {
  return {
    id: `${chainId}-${tokenAddress}`,
    contractAddress: tokenAddress,
    chainId,
    name: '',
    symbol: '',
    totalSupply: 0n,
    totalTransfers: 0,
    totalHolders: 0,
    totalBurnt: 0n,
    tokenValuation: 0n,
    propertyValuation: 0n,
    propertyValuationUpdateTimestamp: 0,
    propertyValuationCurrency: '',
    streetLocation: '',
    geoLocation: '',
    lat: 0,
    lng: 0,
    countryCode: '',
    parcelNumber: '',
    kadastralMunicipality: '',
    buildingPart: 0,
    propertyType: '',
    ipfs: '',
    createdAt: 0,
    createdAtBlock: 0,
    creationTransaction: '',
    certifiedPartner_id: certifiedPartnerId,
    certifiedPartnerWallet_id: certifiedPartnerWalletId,
    latestOffering_id: '',
    offeringV2_id: undefined,
    apy: 0,
    currentYearApy: 0,
    weightedNAVDeviation: 0,
    totalPropertyTokenTraded: 0n,
    totalValueTraded: 0n,
  };
};

export const getNewPropertyTokenHolder = (
  chainId: number,
  tokenAddress: string,
  walletAddress: string,
): PropertyTokenHolder => {
  return {
    id: `${chainId}-${tokenAddress}-${walletAddress}`,
    chainId,
    amount: 0n,
    token_id: `${chainId}-${tokenAddress}`,
    wallet_id: `${chainId}-${walletAddress}`,
  };
};

export const getPropertyTokenRecord = (
  propertyToken: PropertyToken,
  timestamp: number,
): PropertyTokenRecord => {
  const { id: hourId, start: hourStart } = getHour(timestamp);
  const { start: dayStart } = getDay(timestamp);

  return {
    id: `${propertyToken.id}-${hourId}`,
    chainId: propertyToken.chainId,
    hourStartTimestamp: hourStart,
    dayStartTimestamp: dayStart,
    totalSupply: propertyToken.totalSupply,
    totalBurnt: propertyToken.totalBurnt,
    totalTransfers: propertyToken.totalTransfers,
    totalHolders: propertyToken.totalHolders,
    tokenValuation: propertyToken.tokenValuation,
    propertyValuation: propertyToken.propertyValuation,
    countryCode: propertyToken.countryCode,
    propertyToken_id: propertyToken.id,
  };
};

export const calculateWeightedNAVDeviation = (
  tokenValuation: bigint,
  propertyValuation: bigint,
  totalSupply: bigint,
): number => {
  if (totalSupply === 0n || propertyValuation === 0n || tokenValuation === 0n) {
    return 0;
  }
  const MAX_SUPPLY = 100000n;
  const DECIMAL_SHIFT = 10000; // For 4 decimal places precision

  const weightedValue =
    tokenValuation * totalSupply + propertyValuation * (MAX_SUPPLY - totalSupply);
  const normalizedWeightedNavDeviation =
    Number(weightedValue / MAX_SUPPLY - propertyValuation) / Number(propertyValuation) / 10 ** 18;
  return Math.round(normalizedWeightedNavDeviation * 100 * DECIMAL_SHIFT) / DECIMAL_SHIFT; // Round to 4 decimal places
};
