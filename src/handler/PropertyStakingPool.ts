import {PropertyStakingPool} from 'generated';
import {
    calculatePropertyPoolRatio,
    getNewPropertyStakingPool,
    getNewPropertyStakingPoolPosition, getNewTokenDeposit,
    getPropertyStakingPoolRecord,
    getPropertyStakingPoolDepositTransaction,
    getPropertyStakingPoolWithdrawTransaction,
    getPropertyStakingPoolRewardTransaction,
    getValuationAddressForPropertyStakingPool,
} from '../helper/PropertyStakingPool';
import {getNewWallet} from '../helper/Wallet';
import {BIGINT_100K, WEI_DECIMALS} from '../helper/constants';

PropertyStakingPool.Deposit.handler(async ({event, context}) => {
    const valuationAddress = getValuationAddressForPropertyStakingPool(
        event.srcAddress
    );

    const [loadedStakingPool, tokenInformation] = await Promise.all([
        context.PropertyStakingPool.get(`${event.chainId}-${event.srcAddress}`),
        context.OceanpointTokenInformation.getOrThrow(
            `${event.chainId}-${event.params.property}-${valuationAddress}`,
            'PropertyStakingPool.Deposit.handler: OceanpointTokenInformation not found'
        ),
    ]);

    const stakingPool =
        loadedStakingPool ??
        getNewPropertyStakingPool(event.chainId, event.srcAddress);


    const valuePerBSPT = tokenInformation.valuation / BIGINT_100K;
    // When multiplying two amounts in WEI (resulting in a value scaled by 10^36), we need to divide by 10^18 to scale it back to the original value.
    const depositTVL = (valuePerBSPT * event.params.inAmount) / WEI_DECIMALS;

    const newStakingPoolData = {
        ...stakingPool,
        currentAmount: stakingPool.currentAmount + event.params.inAmount,
        issuedAmount: stakingPool.issuedAmount + event.params.outAmount,
        ratio: calculatePropertyPoolRatio(stakingPool),
        tvl: stakingPool.tvl + depositTVL
    };


    let stakingPoolPosition = await context.PropertyStakingPoolPosition.get(
        `${event.chainId}-${event.params.owner}-${event.srcAddress}`
    );

    if (!stakingPoolPosition) {
        const wallet = await context.Wallet.get(
            `${event.chainId}-${event.params.owner}`
        );
        if (!wallet) {
            context.Wallet.set(getNewWallet(event.chainId, event.params.owner));
        }
        stakingPoolPosition = getNewPropertyStakingPoolPosition(
            event.chainId,
            event.params.owner,
            event.srcAddress,
            tokenInformation.id
        );
    }


    // When multiplying two amounts in WEI (resulting in a value scaled by 10^36), we need to divide by 10^18 to scale it back to the original value.
    const depositValue = (valuePerBSPT * event.params.inAmount) / WEI_DECIMALS;

    context.PropertyStakingPoolPosition.set({
        ...stakingPoolPosition,
        totalIssuedAmount: stakingPoolPosition.totalIssuedAmount + event.params.outAmount,
        totalStakedAmount: stakingPoolPosition.totalStakedAmount + event.params.inAmount,
        totalStakedValue: stakingPoolPosition.totalStakedValue + depositValue,
    });

    // Update staking pool
    context.PropertyStakingPool.set({
        ...newStakingPoolData,
        // TODO: The problem with this TVL calculation is that it does not update when the token valuation changes.
        // TODO: For now it's ok, but in the future we should move this calculation to the FE if otherwise not possible
        tvl: stakingPool.tvl + depositValue
    });

    // Update staking pool record
    context.PropertyStakingPoolRecord.set(
        getPropertyStakingPoolRecord(newStakingPoolData, event.block.timestamp)
    );

    // Update token deposit
    const tokenDepositId = `${stakingPoolPosition.id}-${tokenInformation.id}`;
    let tokenDeposit = await context.TokenDeposit.get(tokenDepositId);

    if (!tokenDeposit) {
        tokenDeposit = getNewTokenDeposit(
            stakingPoolPosition.id,
            tokenInformation.id
        );
    }

    tokenDeposit = {
        ...tokenDeposit,
        issuedAmount: tokenDeposit.issuedAmount + event.params.outAmount,
        stakedAmount: tokenDeposit.stakedAmount + event.params.inAmount,
        lockedUntil: Number(event.params.lockedUntil),
        valuePerBSPT,
        stakedValue: depositValue,
    };

    context.TokenDeposit.set(tokenDeposit);

    context.PropertyStakingPoolTransaction.set(
        getPropertyStakingPoolDepositTransaction(
            {
                chainId: event.chainId,
                poolId: event.srcAddress,
                transactionHash: event.transaction.hash,
                blockNumber: event.block.number,
                blockTimestamp: event.block.timestamp,
                logIndex: event.logIndex,
            },
            `${event.chainId}-${event.params.owner}`,
            event.params.inAmount,
            event.params.outAmount
        )
    );
});

PropertyStakingPool.Withdraw.handler(async ({event, context}) => {
    // Edge case: Some users attempt zero-value withdrawals without having any token balance
    // Example TX: 0x1e546e039bf5e32b0f223ffb19dcfac10d8d714b5b3fc35f0da20602d71641ea
    if (event.params.inAmount === 0n) return;

    const valuationAddress = getValuationAddressForPropertyStakingPool(
        event.srcAddress
    );

    const [stakingPool, tokenInformation, stakingPoolPosition] = await Promise.all([
        context.PropertyStakingPool.getOrThrow(
            `${event.chainId}-${event.srcAddress}`,
            'PropertyStakingPool.Withdraw.handler: PropertyStakingPool not found'
        ),
        context.OceanpointTokenInformation.getOrThrow(
            `${event.chainId}-${event.params.property}-${valuationAddress}`,
            'PropertyStakingPool.Withdraw.handler: OceanpointTokenInformation not found'
        ),
        context.PropertyStakingPoolPosition.getOrThrow(
            `${event.chainId}-${event.params.owner}-${event.srcAddress}`,
            'PropertyStakingPool.Withdraw.handler: PropertyStakingPoolPosition not found'
        )
    ]);

    const tokenDeposit = await context.TokenDeposit.getOrThrow(
        `${stakingPoolPosition.id}-${tokenInformation.id}`,
        'PropertyStakingPool.Withdraw.handler: TokenDeposit not found'
    );

    const valuePerBSPT = tokenInformation.valuation / BIGINT_100K;
    // When multiplying two amounts in WEI (resulting in a value scaled by 10^36), we need to divide by 10^18 to scale it back to the original value.
    const withdrawTVL = (valuePerBSPT * event.params.outAmount) / WEI_DECIMALS;

    const rewardsPaidOut =
        event.params.rewardToUser + event.params.rewardToFeeReciever;

    const newStakingPoolData = {
        ...stakingPool,
        currentAmount: stakingPool.currentAmount - event.params.outAmount,
        issuedAmount: stakingPool.issuedAmount - event.params.inAmount,
        totalRewardsPaid: stakingPool.totalRewardsPaid + rewardsPaidOut,
        currentRewards: stakingPool.currentRewards - rewardsPaidOut,
        ratio: calculatePropertyPoolRatio(stakingPool),
        valuePerBSPT,
        tvl: stakingPool.tvl - withdrawTVL
    };


    const withdrawValue = tokenDeposit.stakedValue;

    const newSAmount = stakingPoolPosition.totalIssuedAmount - event.params.inAmount;
    if (newSAmount === 0n) {
        context.PropertyStakingPoolPosition.deleteUnsafe(stakingPoolPosition.id);
    } else {
        // Update staking pool position
        context.PropertyStakingPoolPosition.set({
            ...stakingPoolPosition,
            totalIssuedAmount: newSAmount,
            totalStakedAmount: stakingPoolPosition.totalStakedAmount - event.params.outAmount,
            totalStakedValue: stakingPoolPosition.totalStakedValue - withdrawValue
        });
    }

    // Update staking pool
    context.PropertyStakingPool.set({...newStakingPoolData, tvl: stakingPool.tvl - withdrawValue});

    // Update staking pool record
    context.PropertyStakingPoolRecord.set(
        getPropertyStakingPoolRecord(newStakingPoolData, event.block.timestamp)
    );

    // Remove token deposit
    context.TokenDeposit.deleteUnsafe(tokenDeposit.id);

    context.PropertyStakingPoolTransaction.set(
        getPropertyStakingPoolWithdrawTransaction(
            {
                chainId: event.chainId,
                poolId: event.srcAddress,
                transactionHash: event.transaction.hash,
                blockNumber: event.block.number,
                blockTimestamp: event.block.timestamp,
                logIndex: event.logIndex,
            },
            `${event.chainId}-${event.params.owner}`,
            event.params.outAmount,
            event.params.inAmount,
            event.params.rewardToUser,
            event.params.rewardToFeeReciever
        )
    );
});

PropertyStakingPool.Reward.handler(async ({event, context}) => {
    // Unlike the withdraw, we can have a case where we have no staking pool object yet
    const stakingPool = await context.PropertyStakingPool.getOrCreate(
        getNewPropertyStakingPool(event.chainId, event.srcAddress)
    );

    const newStakingPoolData = {
        ...stakingPool,
        totalRewards: stakingPool.totalRewards + event.params.amount,
        currentRewards: stakingPool.currentRewards + event.params.amount,
    };

    const rewardWalletId = `${event.chainId}-${event.params.from}`;
    const rewardWallet = await context.Wallet.get(rewardWalletId);
    if (!rewardWallet) {
        context.Wallet.set(getNewWallet(event.chainId, event.params.from));
    }

    context.PropertyStakingPool.set(newStakingPoolData);
    context.PropertyStakingPoolRecord.set(
        getPropertyStakingPoolRecord(newStakingPoolData, event.block.timestamp)
    );

    context.PropertyStakingPoolTransaction.set(
        getPropertyStakingPoolRewardTransaction(
            {
                chainId: event.chainId,
                poolId: event.srcAddress,
                transactionHash: event.transaction.hash,
                blockNumber: event.block.number,
                blockTimestamp: event.block.timestamp,
                logIndex: event.logIndex,
            },
            rewardWalletId,
            event.params.amount
        )
    );
});
