# TXLS Crypto

Cryptocurrency transaction analysis platform for Home Assistant. Import CSV data from Bitpanda/TradeRepublic, calculate taxes, and track holdings.

## Installation

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click the three dots menu (⋮) → **Repositories**
3. Add: `https://github.com/klassm/txls-crypto`
4. Find **TXLS Crypto** and click **Install**
5. Configure options and click **Start**

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `jwt_secret` | (auto-generated) | Secret key for JWT authentication (64 chars recommended) |
| `db_connection_string` | `./data/txls.db` | Database connection string |
| `log_level` | `info` | Logging level (info, debug, warn, error) |

### Database Options

- **SQLite**: `./data/txls.db` (default, no setup required)
- **PostgreSQL**: `postgresql://user:pass@host:5432/dbname`
- **MySQL**: `mysql://user:pass@host:3306/dbname`

## Access

- **Ingress**: Click "Web UI" button or find TXLS in sidebar
- **Direct**: `http://homeassistant.local:3000` (if port mapped)

## Authentication

Users are authenticated via Home Assistant. Users are automatically synced to TXLS database on first login. Admin access is determined by Home Assistant `is_owner` flag.
