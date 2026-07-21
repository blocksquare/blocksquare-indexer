import { PropertyTokenTradeCounts } from "envio";
import {getAddress} from "ethers";

/**
 * Converts an uint256 Address type from 1inch to a checksum hex address string.
 * In 1inch's Order struct, addresses are stored as uint256 values.
 * We need to convert them to standard checksum 0x-prefixed hex addresses.
 */
export const uint256ToAddress = (value: bigint): string => {
    // Convert bigint to hex, pad to 40 characters (20 bytes), and add 0x prefix
    const rawAddress = '0x' + value.toString(16).padStart(40, '0');
    // Return checksummed address to match how addresses are stored in the database
    return getAddress(rawAddress);
};

/**
 * 1Inch Order struct indices (from ABI):
 * [0] = salt
 * [1] = maker (Address as uint256)
 * [2] = receiver (Address as uint256)
 * [3] = makerAsset (Address as uint256)
 * [4] = takerAsset (Address as uint256)
 * [5] = makingAmount
 * [6] = takingAmount
 * [7] = makerTraits
 */
export const ORDER_STRUCT_INDEX = {
    SALT: 0,
    MAKER: 1,
    RECEIVER: 2,
    MAKER_ASSET: 3,
    TAKER_ASSET: 4,
    MAKING_AMOUNT: 5,
    TAKING_AMOUNT: 6,
    MAKER_TRAITS: 7,
} as const;

export const getNewPropertyTokenTradeCounts = (
    chainId: number,
    walletId: string
): PropertyTokenTradeCounts => {
    return {
        id: `${chainId}-${walletId}`,
        chainId,
        takerCount: 0,
        makerCount: 0
    };
};

export const updatePropertyTokenTradeCounts = async (
    context: any,
    chainId: number,
    walletId: string,
    tradeType: "makerCount" | "takerCount"
) => {
    const propertyTokenTradeCounts = await context.PropertyTokenTradeCounts.get(
        `${chainId}-${walletId}`
    );

    if (!propertyTokenTradeCounts) {
        const newTradeCounts = getNewPropertyTokenTradeCounts(chainId, walletId);
        context.PropertyTokenTradeCounts.set({
            ...newTradeCounts,
            [tradeType]: 1,
        });
    } else {
        context.PropertyTokenTradeCounts.set({
            ...propertyTokenTradeCounts,
            [tradeType]: propertyTokenTradeCounts[tradeType] + 1,
        });
    }
}