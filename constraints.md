# Ingress Path Handling Constraints

## Deployment Modes

1. **Plain Docker** (direct access)
   - Base URL: `/`
   - API: `/api/...`
   - Assets: `/assets/...`

2. **Home Assistant Addon** (ingress)
   - Base URL: `/api/hassio_ingress/<session_id>/`
   - API: `/api/hassio_ingress/<session_id>/api/...`
   - Assets: `/api/hassio_ingress/<session_id>/assets/...`

3. **Development** (local)
   - Base URL: `/`
   - API: `/api/...` (proxied via Vite)
   - Assets: `/assets/...`

## Solution Implemented

### Runtime Base Path Detection

Created `client/src/lib/api-base.ts` with:
- `getBasePath()`: Detects ingress path from `window.location.pathname`
- `apiUrl(path)`: Prefixes API paths with base path
- `assetUrl(path)`: Prefixes asset paths with base path

### Files Updated

1. **React Router** - `client/src/main.tsx`
   - Uses `getBasePath()` for `BrowserRouter` basename

2. **API Clients**:
   - `client/src/lib/client/accounts-api.ts` - Uses `apiUrl()`
   - `client/src/lib/client/admin-users-api.ts` - Uses `apiUrl()`
   - `client/src/lib/client/sources-api.ts` - Uses `apiUrl()`
   - `client/src/contexts/AuthContext.tsx` - Uses `apiUrl()`
   - `client/src/hooks/useCombinedTaxCalculations.ts` - Uses `apiUrl()`

3. **Asset URLs**:
   - `client/src/components/common/PageLayout.tsx` - Uses `assetUrl()`
   - `client/src/pages/LoginPage.tsx` - Uses `assetUrl()`
   - `client/src/pages/OnboardPage.tsx` - Uses `assetUrl()`

4. **nginx Configuration** - `docker/nginx.conf`
   - Already handles ingress path stripping correctly

### Test Setup

Three Playwright configurations for different scenarios:

1. **Local Dev** (`playwright.config.ts`)
   - baseURL: `http://localhost:3000`
   - Runs against Vite dev server + Express backend

2. **Docker** (`playwright.docker.config.ts`)
   - baseURL: `http://localhost:3002`
   - Builds and runs Docker container

3. **Home Assistant Ingress** (`playwright.hass.config.ts`)
   - baseURL: `http://localhost:3002/api/hassio_ingress/<session>`
   - Tests ingress path handling with random session ID

### NPM Scripts

- `npm run test:gui:local` - Local dev server tests
- `npm run test:gui:docker` - Docker container tests
- `npm run test:gui:hass` - Home Assistant ingress tests

### GitHub Actions

All three test suites run in CI via `.github/workflows/e2e-tests.yml`
