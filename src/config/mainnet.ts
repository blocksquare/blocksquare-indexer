import { getAddress } from 'ethers';
import { Config } from '../types/config';
import { PropertyStakingPoolType } from '../types/enums';

export const mainnetConfig: Config = {
  chainId: 1,
  startBlock: 0,
  blockSquareTokenAddress: getAddress(
    '0x509a38b7a1cc0dcd83aa9d06214663d9ec7c7f4a'
  ),
  certifiedPartnersAddress: getAddress(
    '0x8dbb99cc3721f5c9cc7c9e92db260813cf78cdd3'
  ),
  dataStorageProxyAddress: getAddress(
    '0x8c2a858fe7b2bf155247c7f528c6ca7b186197b5'
  ),
  governancePoolAddress: getAddress(
    '0x6f1e92fb8a685aaa0710bad194d7b1aa839f7f8a'
  ),
  liquidityStakingContracts: [
    // BST:ETH Liquidity Pool
    { address: getAddress('0x1802f66868d0649687a7a6bc9b8a4292e148daec') },
  ],
  marketPlacePoolFactoryAddress: getAddress(
    '0x17887106a14f38bf10512565bdbb5bd7ac12f001'
  ),
  propertyFactoryAddress: getAddress(
    '0x1ae91a263a690bf2129cf0b3acac92bbb67e6685'
  ),
  propertyRegistryAddress: getAddress(
    '0x05325c1ab1440df7214db38f676f95999729267b'
  ),
  propertyRevenueDistributionAddress: getAddress(
    '0xBcb1757cDAdeC25B6cAdC1A83953A70eDa2Da8cb'
  ),
  propertyStakingContracts: [
    // Community Staking Pool
    {
      address: getAddress('0x13299657e662894b933bb3ee73f7f8da94b55451'),
      valuationAddress: getAddress(
        '0xaeea40bb8393174459c4016bce2625076fe4deff'
      ),
      type: PropertyStakingPoolType.COMMUNITY,
    },
    // Issuer Staking Pool
    {
      address: getAddress('0x57ba886442d248c2e7a3a5826f2b183a22ecc73e'),
      valuationAddress: getAddress(
        '0x14db5b377d13ec9f9e7747f42d71634b5ef5a335'
      ),
      type: PropertyStakingPoolType.ISSUER,
    },
    //RWA Technology Pool
    {
      address: getAddress('0x6f5eCF8a8DADAAC3c8440A080c9271f845f34b07'),
      valuationAddress: getAddress(
        '0x05F5b75d80291910a54b65AEa9B45F549CDd0AcC'
      ),
      type: PropertyStakingPoolType.RWA,
    },
    // Landhive
    {
      address: getAddress('0xFC7cd245913691Fb2d305a0fc60A1DadD1eCdeBF'),
      valuationAddress: getAddress(
      '0x3C18b35E8E919224eA4099acC0d280Eda76A71C0'
      ),
      type: PropertyStakingPoolType.LANDHIVE,
    },
  ],
  propertyTokenOfferingAddress: getAddress(
    '0x25862c4fb4ce9d6ff9b463488e0ec656fa08de78'
  ),
  uniswapPoolContracts: [
    {
      assetPairId: 'BST/ETH',
      address: getAddress('0x0e85fb1be698e777f2185350b4a52e5ee8df51a6'),
    },
  ],
  uniswapWethDaiPoolAddress: getAddress(
    '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11'
  ),
  usersRegistryAddress: getAddress(
    '0x13344d0cb96b17df81c4171ce47e14ff6c1975f7'
  ),
  zeroExAddress: getAddress('0xdef1c0ded9bec7f1a1670819833240f027b25eff'),
  zeroExStartBlock: 17337444,
  oneInchPostInteractionAddress: getAddress('0xC8B2029bF486c62d2086D767bA1C23b9485da29E')
};
