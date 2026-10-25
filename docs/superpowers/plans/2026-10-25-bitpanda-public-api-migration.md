# Bitpanda Public API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Bitpanda API sync client from the deprecated legacy API (`api.bitpanda.com/v1`) to the new Public API (`api.public.bitpanda.com/v1`), gaining staking-reward transactions in the sync.

**Architecture:** Replace the two legacy calls (`/trades`, `/wallets/transactions`) with a single paginated `GET /v1/operations` stream plus one `GET /v1/assets` call to resolve asset UUIDs → symbols. Reward transactions imported with unknown EUR value are valued from stored daily prices in `ApiSyncService` after the price backfill step. The `ApiSyncClient` interface stays unchanged.

**Tech Stack:** TypeScript, Node fetch, nock (unit tests), vitest, TypeORM.

**Spec:** `research.html` (project root) — the migration table in "Recommendation & next steps" is the requirement source; the "Operations response shape" card is the data contract.

## Global Constraints

- New base URL: `https://api.public.bitpanda.com/v1`, auth header `x-api-key`.
- `ApiSyncClient` interface (`server/src/providers/types.ts`) must not change.
- Internal `TransactionType` enum must not change (rewards map to `TransactionType.reward`).
- Never invent EUR values we cannot source: trades carry `trade.rate` × `trade.to_eur_rate`; everything else starts at 0 and rewards get valued from stored prices where available.
- Unknown `transaction_type`/`operation_type` values: skip, log at debug level with the raw value (never throw, never guess).
- Code style: follow the pending reformat style already in the working tree (single quotes, no semicolons, tabs) — run the project formatter before commit.
- Commit only files touched by this change (the working tree carries an unrelated mass reformat).

## Review Focus

- **Unknown reward type strings** — live API may use `staking_reward`, `reward`, or something else; a wrong skip silently loses inventory. Test: mapping table covers `reward` and `staking_reward`; unknown values are logged, not thrown (Task 1).
- **Swap legs** — a swap is one operation with INCOMING + OUTGOING transactions; both legs must be imported or cost basis breaks. Test: two-transaction operation yields buy + sell (Task 1).
- **Stake/unstake must not create withdrawals/deposits** — they don't change holdings. Test: `transfer` type is skipped entirely in the new API (Task 1). NOTE: differs from legacy mapping (which mapped non-stake transfers to deposit/withdrawal); the new API represents wallet-internal moves as `transfer` — verification step covers confirming this against live data.
- **Reward EUR valuation** — tax report sums `reward.eurValue`; zero values underreport income. Test: reward without EUR value gets valued from stored daily price; reward with no stored price stays 0 (Task 2).
- **testConnection scope** — must probe an endpoint the sync actually uses (`/operations`), not `/assets`. Test: 401 → false, 200 → true (Task 1).

---

### Task 1: Rewrite `BitpandaApiClient` for the new Public API

**Files:**
- Modify: `server/src/providers/bitpanda/api-client.ts`
- Test: `server/src/providers/bitpanda/api-client.spec.ts`

**Interfaces:**
- Consumes: `ApiSyncClient`, `ApiSyncResult` from `server/src/providers/types.ts`; `Transaction`, `TransactionType` from `@txls/shared`.
- Produces: `BitpandaApiClient implements ApiSyncClient` — `fetchTransactions(apiKey): Promise<ApiSyncResult>`, `testConnection(apiKey): Promise<boolean>` (unchanged signatures).

- [ ] **Step 1: Rewrite the spec file for the new API**

Replace the legacy mocks (`/trades`, `/wallets/transactions`) with new-API mocks. Test cases:
1. `testConnection` — 200 on `GET /operations?page_size=1` → true; 401 → false; network error → false.
2. Buy operation: one operation, one transaction (`transaction_type: 'buy'`, `flow: 'INCOMING'`, `asset_amount.value: '0.05'`, asset_id in assets map → `BTC`, `trade: { rate: '20000', to_eur_rate: '1', fee: { value: '1.50' } }`, `credited_at`) → buy tx with eurRate 20000, eurValue 1000, eurFee 1.5.
3. Reward operations: `transaction_type: 'reward'` and `'staking_reward'` (INCOMING, no `trade`) → `TransactionType.reward`, eurValue 0, eurRate 0, quantity from `asset_amount.value`.
4. Swap: one operation with two transactions (INCOMING buy BTC, OUTGOING sell ETH) → both legs imported with correct types.
5. `transfer` type → skipped (stake/unstake semantics).
6. Transaction with `compensates` set → skipped.
7. Asset id missing from assets map → skipped with warn (no throw).
8. Unknown `transaction_type: 'mystery'` → skipped, no throw.
9. Pagination: `meta.next_cursor` → second page fetched with `cursor` query param.
10. Transactions sorted by timestamp descending.
11. `fee_amount` on the transaction (non-trade deposit with fee) does not crash; eurFee stays 0 for non-trades.

Mock shapes: `GET /assets` → `{ data: [{ id: '<uuid>', attributes: { symbol: 'BTC' } }], meta: { page_size: 100 } }`; `GET /operations` → `{ data: [{ operation_id, operation_type, transactions: [...] }], meta: { next_cursor?, page_size } }` (per the OpenAPI spec in research.html).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/src/providers/bitpanda/api-client.spec.ts`
Expected: FAIL (client still calls legacy endpoints).

- [ ] **Step 3: Implement the new client in `server/src/providers/bitpanda/api-client.ts`**

Structure:
- `const BITPANDA_API_BASE = 'https://api.public.bitpanda.com/v1'`, `DEFAULT_PAGE_SIZE = 100`, `MAX_PAGES = 200` (guard on both assets and operations pagination).
- Types per the OpenAPI spec: `BitpandaAsset { id, attributes: { symbol } }`, `BitpandaOperation { operation_id, operation_type, transactions: BitpandaOperationTransaction[] }`, `BitpandaOperationTransaction { transaction_id, asset_id, asset_amount: { value, asset_id, currency_id }, fee_amount, transaction_type, flow: 'INCOMING' | 'OUTGOING', credited_at, compensates?, trade?: { rate, to_eur_rate, fee: { value } } }`, `BitpandaOperationsResponse { data, meta: { next_cursor?, page_size } }`.
- `testConnection`: `GET /operations?page_size=1`, return `response.ok`.
- `fetchTransactions`: fetch asset map first (`fetchAllAssets`), then `fetchAllOperations`, map, sort desc by timestamp, return `{ transactions }`.
- Mapping (`mapOperationTransactionToTransaction`): skip if `compensates` set; resolve symbol (skip + warn if unknown); timestamp from `credited_at`; quantity `Math.abs(asset_amount.value)`; type per Review Focus table; EUR: if `trade` present → `eurRate = rate × to_eur_rate`, `eurValue = quantity × eurRate`, `eurFee = Math.abs(fee.value × to_eur_rate)`; else zeros.
- Keep `fetchApi` with `x-api-key` header (lowercase is fine, HTTP headers are case-insensitive) and 30s timeout.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/src/providers/bitpanda/api-client.spec.ts`
Expected: PASS.

### Task 2: Reward EUR valuation in `ApiSyncService`

**Files:**
- Modify: `server/src/modules/api-sync/api-sync.service.ts`
- Test: `server/src/modules/api-sync/api-sync.service.spec.ts`

**Interfaces:**
- Consumes: `PricesService.getPriceForDate(asset: string, date: DateTime): Promise<AssetPrice | null>`; `TransactionsRepository.saveMany(entities)`; `findManyByExternalIds`.
- Produces: no interface change; `performFullSync` gains a reward-valuation step between price backfill and holdings rebuild.

- [ ] **Step 1: Write failing tests in `api-sync.service.spec.ts`**

Add to the full-sync describe (mock `fetchTransactions` to return one buy with eurRate + one reward with eurValue 0):
1. Reward gets `eurValue = quantity × priceForDate` and `eurRate = priceForDate` when the prices service returns a price → expects `transactionsRepo.saveMany` called with updated reward.
2. Reward stays untouched when no price exists for the date.
3. Buy transactions are never touched by the valuation step.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run server/src/modules/api-sync/api-sync.service.spec.ts`
Expected: FAIL (no valuation step).

- [ ] **Step 3: Implement valuation in `api-sync.service.ts`**

Add `@inject(TYPES.PricesService) private pricesService: PricesService` to the constructor. In `performFullSync`, after `storePricesFromTransactions` and before `matchTransfersForUser`: for saved transactions with `type === reward` and `eurValue <= 0`, look up `getPriceForDate(asset, timestamp.startOf('day'))`; if found, set `eurValue = quantity × price` and `eurRate = price`; persist via `saveMany`. (Confirm `TYPES.PricesService` exists in `server/src/di/types.ts`; add the binding if missing.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run server/src/modules/api-sync/api-sync.service.spec.ts`
Expected: PASS.

### Task 3: Update provider instructions

**Files:**
- Modify: `server/src/providers/bitpanda/config.ts`

- [ ] **Step 1: Rewrite `apiSyncMarkdownInstructions`**

New copy: create key in Account Settings → API with **Balances** and **Transaction** scopes (explicitly NOT Trade, NOT Earn Write); what gets synced now includes staking rewards; no manual reward entry needed for synced accounts (manual entry remains possible for pre-API history gaps).

- [ ] **Step 2: Verify app compiles**

Run: `pnpm run build` (or project typecheck script).
Expected: no type errors.

### Task 4: Full verification and commit

- [ ] **Step 1: Run unit test suite** — `pnpm run test` (unit scope). Expected: all pass.
- [ ] **Step 2: Run formatter** — project format script; only files touched by this change should change.
- [ ] **Step 3: Update `research.html`** — mark recommendation steps 2/3/4/6 as implemented; keep spike + reconciliation as user verification items.
- [ ] **Step 4: Commit** only the files this change touched (client, spec, sync service + spec, config, research.html) — NOT the unrelated mass reformat.

```bash
git add server/src/providers/bitpanda/api-client.ts server/src/providers/bitpanda/api-client.spec.ts server/src/providers/bitpanda/config.ts server/src/modules/api-sync/api-sync.service.ts server/src/modules/api-sync/api-sync.service.spec.ts research.html
git commit -m "feat: migrate Bitpanda API sync to new Public API incl. staking rewards"
```

## User verification (live API key — documented in final response)

The one thing code + mocks cannot prove: real `transaction_type`/`operation_type` values, real `assets` response shape, and history depth. Verification: user creates an API key (Balances + Transaction), runs the documented curl sequence, triggers a sync, and compares a known recent reward + balance against the app.
