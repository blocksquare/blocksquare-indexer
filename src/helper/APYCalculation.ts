import { PropertyTokenRevenueDistribution } from "envio";
import { formatUnits } from 'ethers';
import dayjs from 'dayjs';
import { PropertyTokenRevenueDistributionInterval } from '../types/config';
import { convertUnixToDate, getRangeOfDays } from './date';
import { normalizeTimestampToSeconds } from './time';

export const getAPY = (
  allRevenueDistributions: PropertyTokenRevenueDistribution[],
): { allTimeAPY: number; currentYearAPY: number } => {
  // Transform revenue distributions into intervals
  const intervals = allRevenueDistributions.map(getInterval);

  // Sort intervals by `fromDate`
  const sortedIntervals = sortIntervals(intervals);

  // Merge overlapping intervals
  const mergedIntervals = mergeOverlappingIntervals(sortedIntervals);

  // Calculate APY and return { allTimeAPY, currentYearAPY }
  return getAPYwithYTD(mergedIntervals);
};

const getAPYwithYTD = (
  mergedIntervals: PropertyTokenRevenueDistributionInterval[],
): { allTimeAPY: number; currentYearAPY: number } => {
  const currentYear = dayjs().year();

  let totalRewardsAllTime = 0; // Sum of total rewards for all-time
  let adjustedSupplyAllTime = 0; // Sum of supply * valuation * days for all-time
  let totalRewardsYTD = 0; // Total rewards for YTD
  let adjustedSupplyYTD = 0; // Supply factor for YTD

  for (const interval of mergedIntervals) {
    if (interval.tokenSupply === 0n || interval.totalRewards === 0n) {
      console.warn(`Skipping interval with invalid data:`, interval);
      continue; // Skip this interval
    }

    const days = getRangeOfDays(interval.fromDate, interval.toDate);

    // Step 1: total rewards distributed for current period
    const rewardsDistributed = parseFloat(formatUnits(interval.totalRewards.toString(), 18));

    totalRewardsAllTime += rewardsDistributed;

    // Step 2: Calculate denominator  (propertyValuation / 100_000) / 365
    const dailyValuationFactor =
      parseFloat(formatUnits(interval.propertyValuation.toString(), 18)) / 100_000 / 365;

    //tokenSupply * dailyValuationFactor * days
    const rowSupplyFactor =
      parseFloat(formatUnits(interval.tokenSupply.toString(), 18)) * dailyValuationFactor * days;

    adjustedSupplyAllTime += rowSupplyFactor;

    // Check if the interval is in the current year for YTD
    if (interval.fromDate.year() === currentYear || interval.toDate.year() === currentYear) {
      totalRewardsYTD += rewardsDistributed;
      adjustedSupplyYTD += rowSupplyFactor;
    }
  }

  // Calculate APYs
  const allTimeAPY =
    adjustedSupplyAllTime === 0
      ? 0
      : Number(((totalRewardsAllTime / adjustedSupplyAllTime) * 100).toFixed(2));
  const currentYearAPY =
    adjustedSupplyYTD === 0 ? 0 : Number(((totalRewardsYTD / adjustedSupplyYTD) * 100).toFixed(2));

  return { allTimeAPY, currentYearAPY };
};

const mergeOverlappingIntervals = (
  sortedIntervals: PropertyTokenRevenueDistributionInterval[],
): PropertyTokenRevenueDistributionInterval[] => {
  const mergedIntervals: PropertyTokenRevenueDistributionInterval[] = [];
  for (const currentInterval of sortedIntervals) {
    if (
      mergedIntervals.length === 0 ||
      !doOverlap(currentInterval, mergedIntervals[mergedIntervals.length - 1])
    ) {
      // Add new non-overlapping interval
      mergedIntervals.push(currentInterval);
    } else {
      // Merge overlapping intervals
      const lastMergedInterval = mergedIntervals[mergedIntervals.length - 1];

      lastMergedInterval.toDate = lastMergedInterval.toDate.isAfter(currentInterval.toDate)
        ? lastMergedInterval.toDate
        : currentInterval.toDate;
      lastMergedInterval.fromDate = lastMergedInterval.fromDate.isBefore(currentInterval.fromDate)
        ? lastMergedInterval.fromDate
        : currentInterval.fromDate;
      lastMergedInterval.totalRewards += currentInterval.totalRewards; // Accumulate amounts
    }
  }
  return mergedIntervals;
};

// Convert a revenue distribution item to an interval
const getInterval = (
  revenueDistribution: PropertyTokenRevenueDistribution,
): PropertyTokenRevenueDistributionInterval => {
  return {
    fromDate: convertUnixToDate(normalizeTimestampToSeconds(Number(revenueDistribution.fromTime))),
    toDate: convertUnixToDate(normalizeTimestampToSeconds(Number(revenueDistribution.toTime))),
    totalRewards: revenueDistribution.totalAmount,
    tokenSupply: revenueDistribution.totalSupply,
    propertyValuation: revenueDistribution.propertyValuation,
  };
};

// Sort intervals by fromDate
const sortIntervals = (
  intervals: PropertyTokenRevenueDistributionInterval[],
): PropertyTokenRevenueDistributionInterval[] => {
  return intervals.sort((a, b) => a.fromDate.diff(b.fromDate));
};

// Check if two intervals overlap
const doOverlap = (
  interval1: PropertyTokenRevenueDistributionInterval,
  interval2: PropertyTokenRevenueDistributionInterval,
): boolean => {
  return (
    interval1.fromDate.isBefore(interval2.toDate) && interval2.fromDate.isBefore(interval1.toDate)
  );
};
