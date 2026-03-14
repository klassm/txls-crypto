# TXLS - Crypto Tax Analysis

Track your cryptocurrency transactions, calculate taxes, and manage your holdings across multiple exchange accounts.

> **Development State**: This project is in active development. Features may be incomplete.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20development-orange?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/klassm)

## Features

### Transaction Management
- **CSV Import** - Import transactions from Bitpanda and TradeRepublic
- **Multi-Account Support** - Track holdings across multiple exchange accounts
- **Automatic Deduplication** - Prevents duplicate transactions on re-import
- **Transfer Matching** - Automatically matches internal transfers between accounts

### Tax Calculation
- **FIFO Cost Basis** - Calculate capital gains using FIFO method
- **Realized/Unrealized Gains** - Track both realized and unrealized profits
- **Tax Year Export** - Export tax-relevant data for your tax return
- **WISO Export** - Direct export format for WISO tax software

### Portfolio Tracking
- **Holdings Overview** - Current holdings with cost basis and current value
- **Price History** - Historical price data via CoinGecko integration
- **Portfolio Snapshots** - Daily portfolio value snapshots

### Home Assistant Integration
- **One-Click Install** - Install directly as a Home Assistant add-on
- **Automatic User Sync** - Users authenticated via Home Assistant
- **Sidebar Integration** - Appears in Home Assistant sidebar
- **API Sync** - Automatic transaction sync from connected exchanges

### Security & Privacy
- **Multi-User Support** - Complete data isolation between users
- **Local Data Storage** - Your financial data stays on your server
- **No External Services** - No data sent to third parties (except price APIs)

## Quick Start

### Home Assistant (Recommended)

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click ⋮ → **Repositories** → Add: `https://github.com/klassm/txls-crypto`
3. Find **TXLS Crypto** → **Install**
4. Configure `jwt_secret` and click **Start**
5. Access via Home Assistant sidebar

### Docker

```bash
docker run -d \
  -p 3000:3000 \
  -v /path/to/data:/data \
  -e JWT_SECRET=$(openssl rand -base64 64) \
  ghcr.io/klassm/txls-crypto:latest
```

### Standalone

```bash
pnpm install
pnpm run build
JWT_SECRET=$(openssl rand -base64 64) pnpm run start
```

Open [http://localhost:3000](http://localhost:3000)

## Documentation

- [Development Guide](DEVELOPMENT.md) - Setup, testing, and architecture

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE)

## Disclaimer

This software is for educational purposes. Always verify tax calculations with official sources or a tax professional.
