# Blocksquare Ecosystem Indexer

A high-performance blockchain indexer for the Blocksquare ecosystem, built with [Envio](https://envio.dev). Tracks and aggregates real-time on-chain data for property tokenization, DeFi operations, and marketplace activities on Ethereum and Sepolia networks.

## 🎯 What It Does

- **Real Estate Tokenization**: Indexes tokenized properties with valuations, ownership, and revenue distribution
- **DeFi Tracking**: Monitors BST staking, liquidity pools, and governance participation
- **Marketplace Analytics**: Tracks property offerings, certified partners, and secondary market trades
- **Price Aggregation**: Real-time BST and asset price feeds from Chainlink and Uniswap

## 🚀 Quick Start

1. Clone the repository:

```bash
git clone https://github.com/blocksquare/blocksquare-indexer.git
cd blocksquare-indexer
```

2. Install dependencies:

```bash
pnpm install
```

3. Configure environment:

```bash
cp .env.example .env
# Defaults to mainnet, change to testnet if needed
```

4. Generate configuration:

```bash
pnpm run config
```

5. Generate types and start indexing:

```bash
pnpm run codegen
pnpm run dev
```

## 🏃 Running the Indexer

### Development Mode

Run the indexer in development mode with hot reload:

```bash
pnpm run dev
```

### Production Mode

Build and start the indexer:

```bash
pnpm run build
pnpm run start
```

### Testing

Run the test suite:

```bash
pnpm run test
```

## 📊 GraphQL API

Query indexed data through the GraphQL endpoint:

- **PropertyToken**: Token details, valuations, holders, trades
- **PropertyTokenOffering**: Investment rounds and claims
- **AssetPair**: Real-time BST and asset prices
- **Staking & Revenue**: Pool activities, rewards, and distributions
- **CertifiedPartner**: Marketplace operators and properties

## 🔧 Configuration

### Networks

- **Mainnet**: Full ecosystem with price feeds
- **Sepolia Testnet**: Development and testing

### Environment Variables

See `.env.example` for all configuration options including custom RPC endpoints and API keys.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Resources

- [Envio Documentation](https://docs.envio.dev)
- [Blocksquare Website](https://blocksquare.io)
- [Oceanpoint Website](https://oceanpoint.fi)
- [BSTScan Explorer](https://bstscan.io)
