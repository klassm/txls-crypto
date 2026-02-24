# OpenCode Agents for TXLS

## Project Overview

TXLS is a cryptocurrency transaction analysis platform built with Next.js, TypeScript, TypeORM, and Material-UI. The application supports multi-tenant user data isolation and allows users to import CSV transaction data from cryptocurrency exchanges (Bitpanda, TradeRepublic), calculate taxes, and track holdings across accounts.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Database**: SQLite, PostgreSQL, MySQL with TypeORM
- **UI Library**: Material-UI (MUI) v7
- **State Management**: TanStack Query (React Query)
- **Styling**: Emotion + MUI styled components
- **Validation**: Zod for input validation, Biome for linting/formatting
- **Security**: bcrypt (password hashing), JWT (authentication), cookie library (session management)
- **Testing**: Vitest (unit + integration tests for all databases)

## Architecture

### Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── accounts/          # Account pages and API routes
│   ├── admin/             # Admin pages and API routes
│   ├── api/               # API routes
│   │   ├── accounts/      # Account management API
│   │   ├── admin/users/   # User management API (admin only)
│   │   ├── auth/          # Authentication API
│   │   ├── settings/      # Settings API
│   │   ├── sources/       # CSV source configuration
│   │   ├── tax/           # Tax calculation API
│   │   └── users/         # User onboarding API
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   └── hooks/             # Custom React hooks
├── lib/                   # Shared utilities and types
│   ├── database/          # Database connection initialization
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions (password, date, session)
│   └── validation/        # Zod validation schemas
├── server/                # Server-side code
│   ├── modules/          # Business logic modules
│   │   ├── accounts/      # Account management
│   │   ├── transactions/  # Transaction management
│   │   ├── users/         # User management
│   │   └── tax/           # Tax calculation
│   └── sources/          # CSV import sources and deduplication
└── data/                 # Data files and SQLite database
test/                     # Integration tests
```

### Key Patterns

1. **API Routes**: Follow REST conventions in `app/api/`
2. **Services**: Business logic in `server/modules/*/service.ts`
3. **Repositories**: Data access in `server/modules/*/repository.ts`
4. **Entities**: TypeORM entities in `server/modules/*/entity.ts`
5. **Styling**: Use MUI styled components (`.styles.ts` files)
6. **Hooks**: Custom hooks in `app/hooks/` for API calls
7. **Validation**: All API routes use Zod schemas for input validation

## Security Implementation

### Authentication & Authorization

- **JWT-based authentication**: Tokens stored in httpOnly, secure, sameSite=strict cookies
- **Password hashing**: bcrypt with 12 rounds (industry standard)
- **User isolation**: All data queries are scoped by `userId`
- **Admin privileges**: Protected routes check user isAdmin flag
- **Session management**: Cookie-based sessions using proper cookie parsing library

### Input Validation

All API routes use Zod schemas defined in `src/lib/validation/schemas.ts`:
- `userSchema` - User creation (name, username 3-50 chars, password 8-255 chars, email)
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

### Remaining Security Enhancements (Optional)

1. **Rate Limiting**:
   - Implement rate limiting on `/api/auth/login` (5 attempts per 15 minutes)
   - Add general API rate limiting (100 requests per minute per user)

2. **XSS Protection**:
   - Sanitize user input displayed in UI components
   - Use DOMPurify or similar for rendering user-generated content
   - Content Security Policy (CSP) headers

3. **Additional Hardening**:
   - Add password complexity requirements (uppercase, number, special char)
   - Implement password expiration (optional for personal use)
   - Add audit logging for admin actions
   - Monitor failed login attempts

## Development Guidelines

### Component Development
- Use TypeScript with strict typing
- Client components must have `"use client"` directive
- Split large components into smaller, reusable parts
- Use MUI styled components for custom styling
- Follow existing naming conventions (PascalCase for components)

### Database Schema Changes

When modifying database entities (e.g., AccountEntity, UserEntity):

1. **Update the Entity**: Modify the entity class fields in `src/server/modules/*/entity.ts`
2. **Create Migration**: Create a new migration file in `src/migrations/` with format `TIMESTAMP-Description.ts`
3. **Update All References**: Search and update all references to changed fields across:
   - Repositories (`*.repository.ts`)
   - Services (`*.service.ts`)
   - API routes (`src/app/api/**/route.ts`)
   - Types (`src/lib/types/index.ts`)
   - Validation schemas (`src/lib/validation/schemas.ts`)
   - Integration tests (`test/integration/*.spec.ts`)
   - Unit tests (`test/unit/*.spec.ts`)
4. **Run Tests**: Verify all tests pass with `npm run test`
5. **Test All Databases**: Run `npm run test:integration:all` to verify SQLite, PostgreSQL, and MySQL compatibility

**Important**: Database column names should use snake_case (e.g., `provider_account_id`, `created_at`) in migrations, while TypeScript properties use camelCase (e.g., `providerAccountId`, `createdAt`) in entities with `name` decorator mapping.

### API Development
- API routes should be in `app/api/` directory
- Always initialize the database connection before queries
- Use the service layer pattern for business logic
- Return proper HTTP status codes
- Handle errors gracefully with try-catch blocks
- **ALWAYS** validate input with Zod schemas
- Verify authentication/authorization before processing requests

### Validation Patterns

```typescript
import { schemaName } from "@/lib/validation/schemas";

const validationResult = schemaName.safeParse(body);
if (!validationResult.success) {
  return NextResponse.json(
    { error: validationResult.error.errors[0].message },
    { status: 400 },
  );
}
```

### Styling
- Create separate `.styles.ts` files for styled components
- Use MUI's `styled()` utility
- Follow the existing color scheme and spacing
- Keep styles simple and maintainable

### Testing
- Use Vitest for unit and integration tests
- Test files should be co-located or in `test/` directory
- Write tests for services and repositories
- Mock database connections in tests
- Update tests when schemas change (e.g., bcrypt migration)

## Common Commands

```bash
npm run dev                      # Start development server
npm run build                    # Build for production
npm run start                    # Start production server
npm run lint                     # Check code with Biome
npm run lint:fix                 # Fix linting issues
npm run format                   # Format code with Biome
npm run check                    # Run all checks (lint + format)
npm run test                     # Run all tests (unit + integration)
npm run test:unit                # Run unit tests only
npm run test:integration         # Run integration tests only
npm run test:integration:all     # Run integration tests for all databases
npm run test:integration:sqlite  # Run SQLite integration tests
npm run test:integration:postgres # Run PostgreSQL integration tests
npm run test:integration:mysql   # Run MySQL integration tests
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

### Testing

All integration tests run against SQLite, PostgreSQL, and MySQL to verify database compatibility. See `TESTING.md` for detailed testing instructions.

### Test Coverage

- **196 total tests** (11 test files)
- **188 unit tests** - Service, repository, and utility tests
- **9 integration tests** - Database initialization and migration tests
- All tests pass on SQLite, PostgreSQL, and MySQL

## Important Notes

- Database supports SQLite, PostgreSQL, and MySQL (configured via `DB_CONNECTION_STRING` environment variable)
- Default database is SQLite at `./data/txls.db`
- The app uses SSR with hydration - be careful with client-only code
- All financial values should be in EUR
- Transaction types are defined in `lib/types/index.ts`
- Use TypeORM decorators for database entities
- Always use the `useAccounts` hook for fetching accounts data
- All environment variables are centralized in `src/server/config/env.ts`
- Never commit `.env` files or database files

## Code Style

- Use Biome for consistent formatting
- No comments unless explicitly requested
- Keep functions small and focused
- Use TypeScript interfaces for all data shapes
- Follow existing naming conventions (camelCase for variables, PascalCase for types)
- Security is priority - validate all inputs and check permissions

## Security Audit Recovery Process

If security issues are discovered:

1. **Immediate**: Fix critical vulnerabilities (authentication, authorization, SQL injection, XSS)
2. **Input Validation**: Add Zod schemas for all API endpoints
3. **Testing**: Update and run full test suite (177 tests must pass)
4. **Build**: Verify production build succeeds
5. **Lint/Format**: Run `npm run lint && npm run format`
6. **Documentation**: Update AGENTS.md with lessons learned

## Environment Variables

All server configuration is centralized in `src/server/config/env.ts`.

```env
# JWT configuration (required)
JWT_SECRET=<random-64-char-string>

# Environment mode (optional, default: development)
NODE_ENV=development

# Database connection string (optional, default: ./data/txls.db)
# SQLite: ./data/txls.db or sqlite:///path/to/file.db
# PostgreSQL: postgresql://username:password@localhost:5432/database
# MySQL: mysql://username:password@localhost:3306/database
DB_CONNECTION_STRING=./data/txls.db

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