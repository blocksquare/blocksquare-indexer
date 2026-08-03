// Time constants
export const SECONDS_PER_HOUR = 60 * 60;
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24;
export const TWO_DAYS_IN_SECONDS = SECONDS_PER_DAY * 2;
export const THREE_DAYS_IN_SECONDS = SECONDS_PER_DAY * 3;

// Number constants
export const BIGINT_100K = 100000n;
export const WEI_DECIMALS = 10n ** 18n; // 1 ETH = 10^18 wei

// Addresses
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Informations for the values: https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/Denominations.sol
export const CHAINLINK_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const CHAINLINK_DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
export const CHAINLINK_USD_ADDRESS = '0x0000000000000000000000000000000000000348'; // 840 decimal -> 348 hex
export const CHAINLINK_GBP_ADDRESS = '0x000000000000000000000000000000000000033a'; // 826 decimal -> 33a hex
export const CHAINLINK_EUR_ADDRESS = '0x00000000000000000000000000000000000003d2'; // 978 decimal -> 3D2 hex
export const CHAINLINK_JPY_ADDRESS = '0x0000000000000000000000000000000000000188'; // 392 decimal -> 188 hex
export const CHAINLINK_AUD_ADDRESS = '0x0000000000000000000000000000000000000024'; // 36 decimal -> 24 hex
