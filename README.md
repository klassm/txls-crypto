# TXLS

Track your cryptocurrency transactions, calculate taxes, and manage your holdings across multiple exchange accounts.

> **⚠️ Development State**: This project is currently in active development. Features may be incomplete.

## Features

- Import transaction data from CSV files (Bitpanda, TradeRepublic)
- Calculate taxes automatically
- Track holdings across multiple accounts
- Export tax data for WISO
- Multi-user support with data isolation
- **Home Assistant integration with automatic user sync**

## Installation

### Option 1: Home Assistant Add-on (Recommended)

Install directly in Home Assistant:

1. Go to **Settings** → **Add-ons** → **Add-on Store** (button in bottom right)
2. Click the three dots menu (⋮) in the top right → **Repositories**
3. Add the repository URL: `https://github.com/klassm/txls-crypto`
4. Click **Add**
5. Find **TXLS Crypto** in the add-on store and click it
6. Click **Install**
7. Configure options:
   - `jwt_secret`: Secret key for JWT authentication (64 chars recommended, auto-generated if empty)
   - `db_connection_string`: Database connection string (default: `/data/txls.db`, persisted across restarts)
   - `log_level`: Logging level (info, debug, warn, error)
8. Click **Start** to launch the add-on
9. Access via:
   - Home Assistant sidebar → **TXLS Crypto** (appears after first start)
   - Settings → Add-ons → TXLS Crypto → "Web UI" button (ingress)
   - Direct access at `http://your-home-assistant:3000` (if port mapped)

**Home Assistant Authentication**: When running in Home Assistant, users are authenticated via Home Assistant's built-in auth. Only Home Assistant users that exist in the TXLS database can access the app. Users are automatically synced by username on first login.

### Option 2: Standalone Installation

Install dependencies:

```bash
pnpm install
```

Create a `.env.local` file with required environment variables:

```bash
JWT_SECRET=<your-secret-key>
NODE_ENV=development
DB_CONNECTION_STRING=/data/txls.db
LOG_LEVEL=info
```

Generate a JWT secret:

```bash
openssl rand -base64 64
```

Run the development server:

```bash
pnpm run dev
```

Or build and run in production:

```bash
pnpm run build
pnpm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Options

TXLS supports multiple database types via the `DB_CONNECTION_STRING` environment variable:

### SQLite (Default, Easiest)

```env
DB_CONNECTION_STRING=/data/txls.db
```

SQLite is included with the application and requires no additional setup. 

**Docker**: Mount a volume to persist data:
```bash
docker run -v /path/to/data:/data ...
```

**Standalone**: Use any path:
```env
DB_CONNECTION_STRING=./data/txls.db
```

### PostgreSQL

```env
DB_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name
```

Setup required:
```bash
# Install PostgreSQL and pg driver (if building locally)
pnpm add pg

# Create database
createdb txls
```

### MySQL / MariaDB

```env
DB_CONNECTION_STRING=mysql://username:password@localhost:3306/database_name
```

Setup required:
```bash
# Install MySQL and mysql2 driver (if building locally)
pnpm add mysql2

# Create database
mysql -u root -p
CREATE DATABASE txls;
```

**Note for Home Assistant**: When using PostgreSQL or MySQL in Home Assistant, ensure your database server is accessible from the Home Assistant environment.

## Environment Variables

| Variable               | Required | Default                   | Description                                                              |
|------------------------|----------|---------------------------|--------------------------------------------------------------------------|
| `JWT_SECRET`           | Yes*     | -                         | Secret key for JWT token signing (auto-generated in HA add-on)          |
| `DB_CONNECTION_STRING` | No       | `/data/txls.db`        | Database connection string (see Database Options above)                  |
| `NODE_ENV`             | No       | `development`             | Environment mode (`development` or `production`)                         |
| `LOG_LEVEL`            | No       | `info`                    | Logging level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)       |
| `SUPERVISOR_TOKEN`     | Auto     | (Home Assistant provides) | Home Assistant Supervisor API token (auto-injected in HA add-on)         |

*Auto-generated in Home Assistant add-on if not provided

## Authentication

### Standalone Mode

Uses JWT-based authentication via cookies:
1. Create an admin user via the onboard page
2. Login with username and password
3. Session is maintained via httpOnly cookie

### Home Assistant Mode

Uses Home Assistant's built-in authentication:
1. Users are authenticated via Home Assistant
2. Every Home Assistant user can access the app
3. Users are automatically synced to TXLS database on first login
4. Admin access determined by Home Assistant `is_owner` flag

**Important**: Only Home Assistant users can access the app when running in Home Assistant. Manual username/password login is disabled.

## Development

Run tests:

```bash
pnpm test
```

Lint code:

```bash
pnpm run lint
pnpm run format
```

Build for production:

```bash
pnpm run build
pnpm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

TXLS is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

## Support

If you find TXLS helpful and want to support its development, consider [buying me a coffee](https://buymeacoffee.com/klassm).

## Disclaimer

This software is provided for educational purposes. Always verify tax calculations with official sources or a tax professional.