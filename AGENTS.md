# OpenCode Agents for TXLS

## Project Overview

TXLS is a cryptocurrency transaction analysis platform built with React, Express, TypeScript, TypeORM, and Material-UI. The application supports multi-tenant user data isolation and allows users to import CSV transaction data from cryptocurrency exchanges (Bitpanda, TradeRepublic), calculate taxes, and track holdings across accounts.

## Tech Stack

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

## Important Notes

- Database supports MySQL and PostgreSQL (configured via `DB_CONNECTION_STRING` environment variable)
- Default database is MySQL at `mysql://root:root@localhost:3306/txls`
- Frontend runs on port 3000, backend on port 3001
- All financial values should be in EUR
- Transaction types are defined in `shared/src/lib/types/index.ts`
- Use TypeORM decorators for database entities
- Always use the `useAccounts` hook for fetching accounts data
- All environment variables are centralized in `shared/src/server/config/env.ts`
- Never commit `.env` files
- Integration tests require a running database container (MySQL or PostgreSQL)

## Development Flow

### Implementation

- Implement the change request in a minimal possible way, do not try to foresee future requirements
- Keep the code clean, according to `Clean Code` best practices
- Prefer map-reduce like functions over for loops
- Split arrow functions into separate functions, to keep things readable
- Make sure every single change is properly tested.
  - For backend this usually means writing unit and integration tests.
  - For frontend code this probably means extracting logic to testable files and writing unit tests. Maybe this also involves gui tests.
- Before comitting any change:
  - Run all tests - this includes all GUI tests (all three variants!), integration tests (start the respective Docker containers for databases first), and unit tests
  - Review your implementation
  - Only if ALL of those requirements match, you may commit. If you do a change in between, start the checks over.

### Review

- Does the code fulfill the given requirements? Are you sure it does?
- Does the code build? Run the build!
- Is the code properly formatted? Run the formatter!
- Is the code properly tested? Do we really have everything covered? Do we have the right test level? Are we missing tests - think twice! Make sure those tests pass!
- Is the code fine from security perspective? Is the input properly validated? Are database queries properly restricted to the given user? ...
- Is the code fine from architecture perspective?
