import { formatUnits, parseUnits } from 'ethers';
import { BigDecimal } from "envio";

// We want to cut it to the same precision as the chainlink oracles to be consistent
// parseUnits handles decimals correctly. Therefore we use it.
export const formatTo8Decimals = (
  valuePrecise: BigDecimal,
): { formattedBI: bigint; formatted: number } => {
  const formattedBI = parseUnits(valuePrecise.toFixed(8), 8);
  const formatted = parseFloat(formatUnits(formattedBI, 8));

  return { formattedBI, formatted };
};
