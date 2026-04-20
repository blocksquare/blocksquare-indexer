export const normalizeTimestampToSeconds = (timestamp: number): number => {
  // Check if timestamp is in milliseconds (greater than seconds range)
  if (timestamp >= 1e12) {
    // Convert from milliseconds to seconds
    return Math.floor(timestamp / 1000);
  }
  // Check if timestamp is in microseconds (greater than milliseconds range)
  else if (timestamp >= 1e15) {
    // Convert from microseconds to seconds
    return Math.floor(timestamp / 1e6);
  }
  // Otherwise, assume it's already in seconds
  return timestamp;
};
