# OpenCode Agents for TXLS

## Project Overview

TXLS is a cryptocurrency transaction analysis platform built with React, Express, TypeScript, TypeORM, and Material-UI. The application supports multi-tenant user data isolation and allows users to import CSV transaction data from cryptocurrency exchanges (Bitpanda, TradeRepublic), calculate taxes, and track holdings across accounts.

## Tech Stack

- **Frontend**: React 19 with Vite
- **Backend**: Express 5
- **Language**: TypeScript (strict mode)
- **Database**: SQLite, PostgreSQL, MySQL with TypeORM
- **UI Library**: Material-UI (MUI) v7
- **State Management**: TanStack Query (React Query)
- **Styling**: Emotion + MUI styled components
- **Validation**: Zod for input validation, Biome for linting/formatting
- **Security**: bcrypt (password hashing), JWT (authentication), cookie library (session management)
- **Testing**: Vitest (unit + integration tests), Playwright (e2e tests)
- **Build**: Turborepo for monorepo management

## Architecture

### Directory Structure

```
client/                   # React frontend (Vite)
├── src/
│   ├── components/       # React components
│   ├── contexts/         # React contexts (Auth, Snackbar)
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Client-side utilities
│   │   └── client/       # API client functions
│   └── pages/            # Page components

server/                   # Express backend
├── src/
│   ├── index.ts          # Server entry point
│   ├── routes/           # Express route handlers
│   │   ├── accounts/     # Account management API
│   │   ├── admin/        # Admin API
│   │   ├── auth/         # Authentication API
│   │   ├── config/       # Config/onboarding API
│   │   ├── providers/    # Provider management API
│   │   ├── sources/      # CSV source configuration
│   │   └── tax/          # Tax calculation API
│   └── utils/            # Server utilities
└── data/                 # SQLite database files

shared/                   # Shared code between client and server
├── src/
│   ├── database.ts       # Database connection and migrations
│   ├── migrations/       # TypeORM migration files
│   ├── server/           # Shared server code
│   │   ├── config/       # Configuration (env, database-config)
│   │   ├── modules/      # Business logic modules
│   │   │   ├── accounts/     # Account management
│   │   │   ├── transactions/ # Transaction management
│   │   │   ├── users/        # User management
│   │   │   └── tax/          # Tax calculation
│   │   └── sources/      # CSV import sources and deduplication
│   ├── lib/              # Shared utilities
│   │   ├── types/        # TypeScript type definitions
│   │   ├── utils/        # Utility functions (password, date, session)
│   │   └── validation/   # Zod validation schemas
│   └── client/           # Client-specific shared code

gui-tests/                # Playwright e2e tests
├── src/
│   └── flow.spec.ts      # User flow tests

test/                     # Integration tests
docker/                   # Docker configuration
hass-addon/               # Home Assistant addon
```

### Key Patterns

1. **API Routes**: Follow REST conventions in `server/src/routes/`
2. **Services**: Business logic in `shared/src/server/modules/*/service.ts`
3. **Repositories**: Data access in `shared/src/server/modules/*/repository.ts`
4. **Entities**: TypeORM entities in `shared/src/server/modules/*/entity.ts`
5. **Styling**: Use MUI styled components (`.styles.ts` files)
6. **Hooks**: Custom hooks in `client/src/hooks/` for API calls
7. **Validation**: All API routes use Zod schemas for input validation

## Security Implementation

### Authentication & Authorization

- **JWT-based authentication**: Tokens stored in httpOnly, secure, sameSite=strict cookies
- **Password hashing**: bcrypt with 12 rounds (industry standard)
- **User isolation**: All data queries are scoped by `userId`
- **Admin privileges**: Protected routes check user isAdmin flag
- **Session management**: Cookie-based sessions using proper cookie parsing library

### Input Validation

All API routes use Zod schemas defined in `shared/src/validation/schemas.ts`:

- `userSchema` - User creation (name, username 3-50 chars, password 15-255 chars, email)
- `onboardingUserSchema` - Initial admin user creation
- `loginSchema` - Login credentials validation
- `updateUserSchema` - User update (partial, optional fields)
- `resetPasswordSchema` - Password reset validation
- `accountSchema` - Account creation (source 1-50 chars)

### Security Best Practices

1. **File Upload Security** (`/api/accounts/[id]/transactions/import`):
   - Max file size: 10MB
   - Allowed MIME types: text/csv, application/vnd.ms-excel
   - Empty file validation
   - Account ID validation

2. **Parameter Validation**:
   - Year parameters validated (must be between 2000 and current year)
   - Numeric IDs properly validated with parseInt
   - String inputs have length constraints

3. **Access Control**:
   - All API routes check authentication via `getUserIdFromCookie`
   - Admin routes verify isAdmin flag
   - Users cannot delete/update themselves if last admin
   - Data deduplication includes userId filtering

4. **Database Security**:
   - TypeORM parameterized queries (SQL injection prevention)
   - All queries scoped by userId (data isolation)
   - Proper transaction handling

5. **Cookie Security**:
   - `httpOnly: true` - Prevents XSS cookie theft
   - `secure: true` in production - HTTPS only
   - `sameSite: "strict"` - CSRF protection
   - Max age: 30 days
   - Proper parsing using `cookie` library (not fragile string splitting)

## Development Guidelines

### Component Development

- Use TypeScript with strict typing
- Client components must have `"use client"` directive
- Split large components into smaller, reusable parts
- Use MUI styled components for custom styling
- Follow existing naming conventions (PascalCase for components)

### Bug Fixes

- When fixing bugs, always reproduce the issue on the closest possible test level
- For backend, this is usually about unit or integration tests.
- For frontend, this is usually react-testing-library or Playwright tests
- After fixing a bug, always check and run the test again, so to verify that we actually fixed the bug

### Database Schema Changes

When modifying database entities (e.g., AccountEntity, UserEntity):

1. **Update the Entity**: Modify the entity class fields in `shared/src/server/modules/*/entity.ts`
2. **Create Migration**: Create a new migration file in `shared/src/migrations/` with format `TIMESTAMP-Description.ts`
3. **Update All References**: Search and update all references to changed fields across:
   - Repositories (`*.repository.ts`)
   - Services (`*.service.ts`)
   - API routes (`server/src/routes/**/index.ts`)
   - Types (`shared/src/lib/types/index.ts`)
   - Validation schemas (`shared/src/validation/schemas.ts`)
   - Integration tests (`test/integration/*.spec.ts`)
   - Unit tests (`shared/src/**/*.spec.ts`)
4. **Run Tests**: Verify all tests pass with `pnpm run test`

**Important**: Database column names should use snake_case (e.g., `provider_account_id`, `created_at`) in migrations, while TypeScript properties use camelCase (e.g., `providerAccountId`, `createdAt`) in entities with `name` decorator mapping.

### API Development

- API routes should be in `server/src/routes/` directory
- Always initialize the database connection before queries
- Use the service layer pattern for business logic
- Return proper HTTP status codes
- Handle errors gracefully with try-catch blocks
- **ALWAYS** validate input with Zod schemas
- Verify authentication/authorization before processing requests

### Validation Patterns

```typescript
import { schemaName } from "@txls/shared/validation";

const validationResult = schemaName.safeParse(body);
if (!validationResult.success) {
  return res
    .status(400)
    .json({ error: validationResult.error.errors[0].message });
}
```

### Styling

- Create separate `.styles.ts` files for styled components
- Use MUI's `styled()` utility
- Follow the existing color scheme and spacing
- Keep styles simple and maintainable

### Testing

- Use Vitest for unit and integration tests
- Use Playwright for e2e tests
- Test files should be co-located or in `test/` directory
- Write tests for services and repositories
- Mock database connections in tests
- Update tests when schemas change (e.g., bcrypt migration)

## Common Commands

```bash
pnpm run dev                      # Start all dev servers (client + server)
pnpm run build                    # Build all packages for production
pnpm run lint                     # Check code with Biome
pnpm run lint:fix                 # Fix linting issues
pnpm run format                   # Format code with Biome
pnpm run check                    # Run all checks (lint + format)
pnpm run test                     # Run all tests (unit + integration)
pnpm run test:unit                # Run unit tests only
pnpm run test:integration         # Run integration tests only
pnpm run test:e2e                 # Run Playwright e2e tests
```

## Database Support

The application supports three database types:

1. **SQLite** (default) - File-based database, no setup required
2. **PostgreSQL** - Production-ready relational database
3. **MySQL** - Popular open-source relational database

### Database Selection

Set the `DB_CONNECTION_STRING` environment variable:

```bash
# SQLite (default)
DB_CONNECTION_STRING=./data/txls.db

# PostgreSQL
DB_CONNECTION_STRING=postgresql://user:pass@host:5432/dbname

# MySQL
DB_CONNECTION_STRING=mysql://user:pass@host:3306/dbname
```

### Docker Compose

Use the provided `docker-compose.yml` to start PostgreSQL and MySQL containers:

```bash
docker-compose up -d    # Start both databases
docker-compose down      # Stop both databases
```

### Test Coverage

- **201 total tests**
- **137 unit tests** - Service, repository, and utility tests
- **64 integration tests** - Database tests for SQLite, PostgreSQL, MySQL
- **1 e2e test** - Playwright user flow test

## Important Notes

- Database supports SQLite, PostgreSQL, and MySQL (configured via `DB_CONNECTION_STRING` environment variable)
- Default database is SQLite at `./server/data/txls.db`
- Frontend runs on port 3000, backend on port 3001
- All financial values should be in EUR
- Transaction types are defined in `shared/src/lib/types/index.ts`
- Use TypeORM decorators for database entities
- Always use the `useAccounts` hook for fetching accounts data
- All environment variables are centralized in `shared/src/server/config/env.ts`
- Never commit `.env` files or database files

## Code Style

- Use Biome for consistent formatting
- No comments unless explicitly requested
- Keep functions small and focused
- Use TypeScript interfaces for all data shapes
- Follow existing naming conventions (camelCase for variables, PascalCase for types)
- Security is priority - validate all inputs and check permissions

## Environment Variables

All server configuration is centralized in `shared/src/server/config/env.ts`.

```env
# JWT configuration (required)
JWT_SECRET=<random-64-char-string>

# Environment mode (optional, default: development)
NODE_ENV=development

# Database connection string (optional, default: ./server/data/txls.db)
# SQLite: ./data/txls.db or sqlite:///path/to/file.db
# PostgreSQL: postgresql://username:password@localhost:5432/database
# MySQL: mysql://username:password@localhost:3306/database
DB_CONNECTION_STRING=./server/data/txls.db

# Logging level (optional, default: info, options: fatal, error, warn, info, debug, trace)
LOG_LEVEL=info
```

## Common Pitfalls

1. **Forgot to validate input**: Always use Zod schemas for API routes
2. **Missing userId in queries**: All user data queries must include userId
3. **Changing authentication without updating tests**: When changing password hashing (e.g., bcrypt), update test mocks
4. **SQL injection**: Use TypeORM parameterized queries, never string interpolation
5. **Insecure cookie handling**: Use the cookie library, not string manipulation
6. **File upload vulnerabilities**: Validate file size, type, and content
7. **Missing error handling**: All async operations need try-catch blocks
