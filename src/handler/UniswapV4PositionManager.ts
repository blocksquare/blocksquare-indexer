import { ZeroAddress } from "ethers";
import { getNewWallet } from "../helper/Wallet";
import { UniswapV4PositionManager } from "generated";

UniswapV4PositionManager.Transfer.handler(async ({ event, context }) => {
  /**
   * Transfer event is emitted when a position NFT is:
   * - Transferred between wallets
   * - Minted (from ZeroAddress)
   * - Burned (to ZeroAddress)
   */

  const {
    chainId,
    transaction: { hash: transactionHash },
  } = event;
  const tokenId = event.params.id;

  // Get or create wallet entity for the receiver address.
  const wallet = await context.Wallet.getOrCreate(
    getNewWallet(event.chainId, event.params.to),
  );

  // Detect burn events.
  const isBurnEvent = event.params.to === ZeroAddress;

  const tokenEntityId = `${chainId}-${tokenId}`;

  let exitsingToken = await context.UniswapV4PositionToken.get(tokenEntityId);

  if (exitsingToken) {
    const updatedToken = {
      ...exitsingToken,

      owner: wallet.address,
      isBurned: isBurnEvent,
    };

    context.UniswapV4PositionToken.set(updatedToken);
  } else {
    /**
     * When new liquidity is added, both:
     * - Transfer event (NFT mint)
     * - ModifyLiquidity event (position state update)
     * gets emitted within the same transaction.
     *
     * Since there is no direct on-chain link between:
     * - NFT Transfer event
     * - Position liquidity modification event
     *
     * The only reliable way to associate an NFT token with its position
     * lifecycle is by matching events that were emitted in the same transaction.
     */
    const uniswapPositionId = `${chainId}-${transactionHash}`;

    const newToken = {
      id: tokenEntityId,
      tokenId,
      owner: wallet.address,
      isBurned: isBurnEvent,
      mintedTransactionHash: transactionHash,
      position_id: uniswapPositionId,
    };

    context.UniswapV4PositionToken.set(newToken);
  }
});
