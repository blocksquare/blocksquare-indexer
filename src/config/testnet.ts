import { getAddress } from 'ethers';
import { Config } from '../types/config';
import {PropertyStakingPoolType} from "../types/enums";

export const testnetConfig: Config = {
  chainId: 11155111, // Sepolia
  startBlock: 0,
  blockSquareTokenAddress: getAddress(
    '0x7000Ec7486d8c6f9bd9FfA930f9ACE2D9564d02b'
  ),
  certifiedPartnersAddress: getAddress(
    '0x2192d72e0648277ae50f2ce516c5fd1b90572030'
  ),
  dataStorageProxyAddress: getAddress(
    '0x846d955ebe2e79ae61e7b8e7f4568103f095d26f'
  ),
  governancePoolAddress: getAddress(
    '0x145a6db84aed0fe46e4ccb3f96930100418f00a2'
  ),
  liquidityStakingContracts: [
    // BST:ETH Liquidity Pool
    { address: getAddress('0x0a654a300eabdb763d860154bc72c4dd58c64aef') },
    // BST:POINT Liquidity Pool
    { address: getAddress('0x28736062E9659FEc652ceF0608851AB2187eb54e') },
  ],
  marketPlacePoolFactoryAddress: getAddress(
    '0x3a0ad3e022e9cc53a75ea8c4907b6e326a615504'
  ),
  propertyFactoryAddress: getAddress(
    '0x67b899af3f27072f15f22bb33e5f1df2696cafcb'
  ),
  propertyRegistryAddress: getAddress(
    '0x0be43cfd32a91cc277489b547598b6428ef9a584'
  ),
  propertyRevenueDistributionAddress: getAddress(
    '0xbc9bf93d96096F42364DBD2c2b32a317fd06C8cB'
  ),
  propertyStakingContracts: [
      // Community Staking Pool
    {
       address: getAddress('0x9CaE63f8e6b931D269A449A937F742a5d1B3A4A9'),
       valuationAddress: getAddress(
           '0x00e63d90b0481c8AC9abE68d03ec40B2d3e87E45'
       ),
       type: PropertyStakingPoolType.COMMUNITY,
    },
    // Issuer Staking Pool
    {
      address: getAddress('0x00c92c11db2e4229291398000132c3cfdd4daac1'),
      valuationAddress: getAddress(
        '0xd88f8cb694fb5684dedfb68c946749d1fae64d83'
      ),
      type: PropertyStakingPoolType.ISSUER,
    },

    // CryptoSnacks Staking Pool
    {
      address: getAddress('0xea819503da30628f862e1d9f5944ad5d3e347a96'),
      valuationAddress: getAddress(
        '0x15389b98c8050562a6b0ec6684dfd39f961d0de9'
      ),
      type: PropertyStakingPoolType.RWA,
    },
  ],
  propertyTokenOfferingAddress: getAddress(
    '0x223ad3ac5df27f8e062a805a04996f00f1feaceb'
  ),
  uniswapPoolContracts: [
    {
      assetPairId: 'BST/POINT',
      address: getAddress('0xc026cBA28A7f94C8Bc16547e979295191b2FD671'),
    },
    {
      assetPairId: 'BST/ETH',
      address: getAddress('0x0e85fb1be698e777f2185350b4a52e5ee8df51a6'),
    },
  ],
  uniswapWethDaiPoolAddress: getAddress(
    '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11'
  ),
  usersRegistryAddress: getAddress(
    '0xcd0c1845552dd0b2efcba0cf0ecd341a0b99d49a'
  ),
  zeroExAddress: getAddress('0xdef1c0ded9bec7f1a1670819833240f027b25eff'),
  zeroExStartBlock: 0,
  oneInchPostInteractionAddress: getAddress('0xC8B2029bF486c62d2086D767bA1C23b9485da29E'),
  uniswapV4PoolManagerAddress: getAddress('0xE03A1074c86CFeDd5C142C4F04F1a1536e203543'),
  uniswapV4PositionManagerAddress: getAddress('0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4'),
  uniswapV4StakingAddress: getAddress('0xfdf22B183490f005e2e51A6Caf4202E46cc11b97'),
};
