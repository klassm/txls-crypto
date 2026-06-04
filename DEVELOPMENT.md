# Development Guide

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Material-UI
- **Backend**: Express, TypeScript, TypeORM
- **Database**: MySQL (default), PostgreSQL
- **Package Manager**: pnpm 10
- **Build**: Turborepo monorepo

## Project Structure

```
client/                   # React frontend
server/                   # Express backend
shared/                   # Shared code (types, database, services)
gui-tests/                # Playwright E2E tests
docker/                   # Docker configuration
hass-addon/               # Home Assistant add-on
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Run tests
pnpm test

# Build for production
pnpm run build
```

## Environment Variables

| Variable               | Required | Default                                       | Description                                              |
|------------------------|----------|-----------------------------------------------|----------------------------------------------------------|
| `JWT_SECRET`           | Yes*     | -                                             | Secret key for JWT token signing                         |
| `DB_CONNECTION_STRING` | No       | `mysql://root:root@localhost:3306/txls`       | Database connection string                               |
| `NODE_ENV`             | No       | `development`                                 | Environment mode                                         |
| `LOG_LEVEL`            | No       | `info`                                        | Logging level (fatal, error, warn, info, debug, trace)   |
| `SUPERVISOR_TOKEN`     | Auto     | -                                             | Home Assistant Supervisor API token (auto-injected)      |

*Auto-generated in Home Assistant add-on

## Database Options

### MySQL (Default)

```env
DB_CONNECTION_STRING=mysql://username:password@localhost:3306/database_name
```

```bash
pnpm add mysql2
mysql -u root -p -e "CREATE DATABASE txls;"
```

For local development with Docker:

```bash
docker compose up -d mysql
```

### PostgreSQL

```env
DB_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name
```

```bash
pnpm add pg
createdb txls
```

For local development with Docker:

```bash
docker compose up -d postgres
```

## Testing

### Unit Tests

```bash
pnpm run test:unit
```

### Integration Tests

Requires Docker for database services:

```bash
# Start database containers
docker compose -f docker-compose.integration.yml up -d

# PostgreSQL
pnpm run test:integration:postgres

# MySQL
pnpm run test:integration:mysql
```

### GUI Tests

```bash
# Local (uses local build)
pnpm run test:gui:local

# Docker (builds and tests Docker image)
pnpm run test:gui:docker

# Home Assistant (tests HASS add-on)
pnpm run test:gui:hass
```

## Code Quality

```bash
# Lint
pnpm run lint

# Fix lint issues
pnpm run lint:fix

# Format
pnpm run format
```

## Architecture

### API Routes

REST conventions in `server/src/routes/`:

- `accounts/` - Account management
- `admin/` - Admin operations
- `auth/` - Authentication
- `config/` - Configuration
- `providers/` - Provider management
- `sources/` - CSV source configuration
- `tax/` - Tax calculation

### Service Layer

Business logic in `shared/src/server/modules/`:

- `accounts/` - Account management
- `transactions/` - Transaction management
- `users/` - User management
- `tax/` - Tax calculation

### Data Access

Repositories in `shared/src/server/modules/*/repository.ts`

### Database Entities

TypeORM entities in `shared/src/server/modules/*/entity.ts`

### Validation

All API routes use Zod schemas from `shared/src/lib/validation/`

## Database Migrations

When modifying entities:

1. Update entity in `shared/src/server/modules/*/entity.ts`
2. Create migration in `shared/src/migrations/` (format: `TIMESTAMP-Description.ts`)
3. Update all references (repositories, services, routes, types, tests)
4. Run tests: `pnpm run test`

## Docker

### Build

```bash
docker build -t txls -f docker/Dockerfile .
docker build -t txls-hass -f docker/Dockerfile.hass .
```

### Run

```bash
docker run -d -p 3000:3000 \
  -e JWT_SECRET=your-secret \
  -e DB_CONNECTION_STRING=mysql://user:pass@db-host:3306/txls \
  txls
```

## Home Assistant Add-on

The add-on configuration is in `hass-addon/`:

- `config.yaml` - Add-on configuration
- `translations/` - UI translations

Build and test:

```bash
pnpm run test:gui:hass
```
