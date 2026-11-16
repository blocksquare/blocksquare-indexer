import { createEffect, S } from 'envio';

const RPC_URL_ENV_BY_CHAIN: Record<number, string> = {
  1: 'MAINNET_RPC_URL',
  11155111: 'SEPOLIA_RPC_URL',
};

/**
 * Timestamp of a block, read with `eth_getBlockByNumber`.
 *
 * Block handlers (`indexer.onBlock`) only receive the block number: envio generates their items
 * from block numbers and never fetches the block, so `block.timestamp` can't be selected for them.
 * Estimating it from the block number drifts, so it is read from the chain instead. Results are
 * cached, so each block is fetched once.
 */
export const getBlockTimestamp = createEffect(
  {
    name: 'getBlockTimestamp',
    input: { chainId: S.number, blockNumber: S.number },
    output: S.number,
    rateLimit: { calls: 5, per: 'second' },
    cache: true,
  },
  async ({ input: { chainId, blockNumber } }) => {
    const envName = RPC_URL_ENV_BY_CHAIN[chainId];
    const url = envName ? process.env[envName] : undefined;
    if (!url) {
      throw new Error(
        `getBlockTimestamp: no RPC URL for chain ${chainId}. Set ${envName ?? 'an RPC URL env var for this chain'}.`,
      );
    }

    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchBlockTimestamp(url, chainId, blockNumber);
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
      }
    }
  },
);

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

const fetchBlockTimestamp = async (url: string, chainId: number, blockNumber: number) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBlockByNumber',
      params: [`0x${blockNumber.toString(16)}`, false],
    }),
  });
  if (!response.ok) {
    throw new Error(`getBlockTimestamp: RPC returned HTTP ${response.status} for block ${blockNumber}`);
  }

  const { result, error } = (await response.json()) as {
    result?: { timestamp: string } | null;
    error?: { message: string };
  };
  if (!result) {
    throw new Error(
      `getBlockTimestamp: block ${blockNumber} not found on chain ${chainId}${error ? `: ${error.message}` : ''}`,
    );
  }
  return Number(result.timestamp);
};
