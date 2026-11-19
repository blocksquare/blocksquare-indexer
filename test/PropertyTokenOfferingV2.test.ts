process.env.ENVIO_NETWORK = 'testnet';

import { describe, it } from 'vitest';
import { createTestIndexer } from 'envio';
import { CHAIN_ID, addr } from './fixtures';

const OFFERING_ADDRESS = addr('0xD7C0593cfF0221E0Aae4E466D79C9AC4f5a160fa');
const PROPERTY = addr('0x5555555555555555555555555555555555555555');
const ALICE = addr('0x6666666666666666666666666666666666666666');
const TOKEN = addr('0x7777777777777777777777777777777777777777');
const MAIN_SALE_ID = `${CHAIN_ID}-${PROPERTY}-1`;

describe('PropertyTokenOfferingV2 UserClaimedMainSaleRefund', () => {
  it('marks the main sale refunded', async (t) => {
    const indexer = createTestIndexer();
    indexer.MainSaleOffering.set({
      id: MAIN_SALE_ID,
      chainId: CHAIN_ID,
      offering_id: `${CHAIN_ID}-${PROPERTY}`,
      startDateTimestamp: 0,
      endDateTimestamp: 1,
      maxInvestment: 0n,
      minInvestment: 0n,
      mintedAmount: 0n,
      pricePerToken: 1n,
      assetPriceIdentifier: 'USD',
      softCap: 100n,
      hardCap: 200n,
      collector: ALICE,
      feeCollector: ALICE,
      fee: 0n,
      investmentTokens: [TOKEN],
      status: 'active',
    });

    await indexer.process({
      chains: {
        [CHAIN_ID]: {
          simulate: [
            {
              contract: 'PropertyTokenOfferingV2',
              event: 'UserClaimedMainSaleRefund',
              srcAddress: OFFERING_ADDRESS,
              logIndex: 1,
              block: { number: 100, timestamp: 1_700_000_000 },
              transaction: { hash: `0x${'ab'.repeat(32)}` },
              params: { property: PROPERTY, mainSaleId: 1n, wallet: ALICE, investmentToken: TOKEN },
            },
          ],
        },
      },
    });

    const mainSale = await indexer.MainSaleOffering.getOrThrow(MAIN_SALE_ID);
    t.expect(mainSale.status).toBe('refunded');
  });
});
