process.env.ENVIO_NETWORK = 'testnet';

import { describe, it, beforeEach } from 'vitest';
import { createTestIndexer, type TestIndexer, type TestIndexerProcessConfig } from 'envio';
import { ZeroAddress } from 'ethers';
import { CHAIN_ID, addr } from './fixtures';

type ChainSimulate = NonNullable<
  NonNullable<TestIndexerProcessConfig['chains'][typeof CHAIN_ID]>['simulate']
>;

const ZERO = ZeroAddress as `0x${string}`;
const ALICE = addr('0x6666666666666666666666666666666666666666');
const BOB = addr('0x7777777777777777777777777777777777777777');

const TOKEN_ID = 42n;
const TOKEN_ENTITY_ID = `${CHAIN_ID}-${TOKEN_ID}`;
const MINT_TX = `0x${'aa'.repeat(32)}`;

const transferEvent = (
  from: `0x${string}`,
  to: `0x${string}`,
  overrides: { txHash?: string; logIndex?: number; blockNumber?: number } = {},
): ChainSimulate[number] => ({
  contract: 'UniswapV4PositionManager',
  event: 'Transfer',
  logIndex: overrides.logIndex ?? 1,
  block: { number: overrides.blockNumber ?? 100, timestamp: 1_700_000_000 },
  transaction: { hash: overrides.txHash ?? MINT_TX },
  params: { from, to, id: TOKEN_ID },
});

const runEvents = (indexer: TestIndexer, ...events: ChainSimulate) =>
  indexer.process({ chains: { [CHAIN_ID]: { simulate: events } } });

describe('UniswapV4PositionManager Transfer', () => {
  let indexer: TestIndexer;

  beforeEach(() => {
    indexer = createTestIndexer();
  });

  it('mint creates a position token linked to its own v4 position and owner wallet', async (t) => {
    await runEvents(indexer, transferEvent(ZERO, ALICE));

    const token = await indexer.UniswapV4PositionToken.getOrThrow(TOKEN_ENTITY_ID);
    t.expect(token.tokenId).toBe(TOKEN_ID);
    t.expect(token.owner).toBe(ALICE);
    t.expect(token.isBurned).toBe(false);
    t.expect(token.mintedTransactionHash).toBe(MINT_TX);
    // The PositionManager's v4 position for an NFT has salt = bytes32(tokenId), so it is keyed by token id.
    t.expect(token.position_id).toBe(`${CHAIN_ID}-${TOKEN_ID}`);
    t.expect(token.wallet_id).toBe(`${CHAIN_ID}-${ALICE}`);

    const wallet = await indexer.Wallet.getOrThrow(`${CHAIN_ID}-${ALICE}`);
    t.expect(wallet.address).toBe(ALICE);
  });

  it('transfer re-links the token to the new owner wallet and keeps mint metadata', async (t) => {
    await runEvents(
      indexer,
      transferEvent(ZERO, ALICE, { blockNumber: 100 }),
      transferEvent(ALICE, BOB, { txHash: `0x${'bb'.repeat(32)}`, blockNumber: 101 }),
    );

    const tokens = await indexer.UniswapV4PositionToken.getAll();
    t.expect(tokens).toHaveLength(1);

    const token = tokens[0]!;
    t.expect(token.owner).toBe(BOB);
    t.expect(token.wallet_id).toBe(`${CHAIN_ID}-${BOB}`);
    t.expect(token.isBurned).toBe(false);
    t.expect(token.mintedTransactionHash).toBe(MINT_TX);
    t.expect(token.position_id).toBe(`${CHAIN_ID}-${TOKEN_ID}`);
  });

  it('burn marks the token as burned and assigns it to the zero-address wallet', async (t) => {
    await runEvents(
      indexer,
      transferEvent(ZERO, ALICE, { blockNumber: 100 }),
      transferEvent(ALICE, ZERO, { txHash: `0x${'cc'.repeat(32)}`, blockNumber: 101 }),
    );

    const token = await indexer.UniswapV4PositionToken.getOrThrow(TOKEN_ENTITY_ID);
    t.expect(token.isBurned).toBe(true);
    t.expect(token.owner).toBe(ZERO);
    t.expect(token.wallet_id).toBe(`${CHAIN_ID}-${ZERO}`);
    t.expect(token.mintedTransactionHash).toBe(MINT_TX);
  });
});
