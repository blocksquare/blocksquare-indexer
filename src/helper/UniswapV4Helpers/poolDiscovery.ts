import { id as topicHash, zeroPadValue } from 'ethers';

const INITIALIZE_TOPIC = topicHash(
  'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)',
);

/**
 * Queries HyperSync for every PoolManager Initialize event with BST as
 * currency1 and returns their poolIds (topic1). Runs once at indexer startup
 * so the Swap/ModifyLiquidity where-filters cover all ETH/BST pools that
 * exist at deploy time, including custom fees, tick spacings and hooks.
 * Returns [] when no API token / pool manager is configured or the query
 * fails — the statically derived standard-tier ids still apply then.
 */
export const discoverEthBstPoolIds = async (
  chainId: number,
  poolManagerAddress: string,
  bstTokenAddress: string,
): Promise<string[]> => {
  const token = process.env.ENVIO_API_TOKEN;
  if (!token || !poolManagerAddress) return [];

  const url = `https://${chainId}.hypersync.xyz/query`;
  const poolIds: string[] = [];
  let fromBlock = 0;

  try {
    for (let page = 0; page < 50; page++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from_block: fromBlock,
          logs: [
            {
              address: [poolManagerAddress],
              topics: [[INITIALIZE_TOPIC], [], [], [zeroPadValue(bstTokenAddress, 32)]],
            },
          ],
          field_selection: { log: ['topic1'] },
        }),
      });
      if (!res.ok) break;
      const data = (await res.json()) as {
        data?: Array<{ logs?: Array<{ topic1?: string }> }>;
        next_block: number;
        archive_height: number;
      };
      for (const block of data.data ?? []) {
        for (const log of block.logs ?? []) {
          if (log.topic1) poolIds.push(log.topic1);
        }
      }
      if (data.next_block >= data.archive_height) break;
      fromBlock = data.next_block;
    }
  } catch {
    // Fall through with whatever was collected; static ids still cover standard tiers.
  }

  return poolIds;
};
