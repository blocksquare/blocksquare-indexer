import { ZeroAddress } from "ethers";
import { indexer } from "envio";
import { getNewWallet } from "../helper/Wallet";
import { getUniswapV4PoolPositionId } from "../helper/UniswapV4Staking";

indexer.onEvent({ contract: "UniswapV4PositionManager", event: "Transfer" }, async ({ event, context }) => {
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
      wallet_id: wallet.id
    };

    context.UniswapV4PositionToken.set(updatedToken);
  } else {
    /**
     * The PositionManager keeps each NFT's liquidity in a v4 position with salt = bytes32(tokenId),
     * so the ModifyLiquidity handler keys that position by token id: the link is known here
     * whatever else the minting transaction does.
     */
    const uniswapPositionId = getUniswapV4PoolPositionId(chainId, tokenId);

    const newToken = {
      id: tokenEntityId,
      tokenId,
      owner: wallet.address,
      isBurned: isBurnEvent,
      mintedTransactionHash: transactionHash,
      position_id: uniswapPositionId,
      wallet_id: wallet.id
    };

    context.UniswapV4PositionToken.set(newToken);
  }
});
