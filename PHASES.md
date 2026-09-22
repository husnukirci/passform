# passform — phase specs

Nine phases. **One phase = one Claude Code session = one PR.** Each spec is
self-contained: a fresh session reading only `CLAUDE.md`, `PLAN.md`, and its
own phase section has everything it needs. No phase depends on chat history.

## How a phase runs

1. **Start a fresh Claude Code session** in the repo. First instruction: read
   `CLAUDE.md`, `PLAN.md`, and the current phase in `PHASES.md`. Nothing
   else. The design spec under `docs/superpowers/specs/` is the tie-breaker
   when a phase spec is ambiguous; read the relevant section only.
2. **Implement** the "In scope" list in order. Respect the TDD tier stated
   per item. Small conventional commits on a branch named
   `phase/<n>-<slug>`.
3. **Self-review** against the phase's review checklist _and_ the global
   checklist below. Fix findings in follow-up commits (do not amend history).
4. **Open the PR** with the title given in the phase spec. PR description:
   what shipped, what was deliberately not done, review findings that were
   fixed, and anything punted (with a PLAN.md tier reference).
5. **Stop.** The author merges. The next phase starts in a new session.

### Global self-review checklist (every phase)

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` all green
- [ ] `npm run test:integration` green against a freshly started `docker compose up -d` (phases 2 onward)
- [ ] Every "In scope" item done or explicitly listed as punted in the PR
- [ ] No scope creep: nothing from a later phase or higher tier snuck in
- [ ] New load-bearing decisions have an ADR in `docs/decisions.md`
- [ ] `docs/ai-workflow.md` has at least the friction log entries from this session
- [ ] No real vehicle makes, models, parts brands, catalogue providers, retailers or companies anywhere in the diff
- [ ] `packages/domain` still has zero imports from Nest, Next, Drizzle, zod, BullMQ, the ES client or Node built-ins (grep `from "` in `packages/domain/src` and check every line)
- [ ] Dead code, commented-out blocks, and stray `console.log` removed
- [ ] Re-read the diff top to bottom as a reviewer would; note and fix anything
      you would flag on a teammate's PR

### Shared conventions (every phase)

- Ports: web `3000`, api `4000`, Postgres `5432`, Redis `6379`,
  Elasticsearch `9200`.
- `.env.example`:
  ```
  DATABASE_URL=postgres://passform:passform@localhost:5432/passform
  REDIS_URL=redis://localhost:6379
  ELASTICSEARCH_URL=http://localhost:9200
  API_PORT=4000
  NEXT_PUBLIC_API_URL=http://localhost:4000
  DATA_DIR=./.data
  ```
- Root npm scripts (added as phases need them): `dev` (api + web
  concurrently), `lint`, `typecheck`, `test` (unit, all workspaces),
  `test:integration` (api only, sequential), `build`, `db:migrate`,
  `data:generate` (generator, `--profile small` by default), `db:seed`,
  `db:setup` (migrate → generate small → seed → index rebuild),
  `index:rebuild`.
- Ids are strings. Generator-assigned ids are deterministic and readable:
  variants `v_000001`, parts `p_0000001`, categories are their slug,
  suppliers `s_01`.
- Build dates are `YYYY-MM` strings everywhere, including the database
  (`char(7)`), and `date` with format `yyyy-MM` in Elasticsearch.

---

## Phase 0 — Monorepo scaffold, tooling, infrastructure, CI

**Context for a fresh session:** repository contains only planning docs.
This phase creates the workspace skeleton and proves the pipeline end to
end: two apps boot, three infrastructure services run, CI is green with
those services attached. No product code.

**Objective:** a running empty API and web app, a local stack, and a CI
pipeline that exercises the same stack.

**In scope**

1. Root `package.json` with `"workspaces": ["apps/*", "packages/*"]`,
   `"engines": { "node": ">=22" }`, `.nvmrc` = `22`. Root scripts `lint`,
   `typecheck`, `test`, `build` fan out with `npm run <script> --workspaces
   --if-present`; `dev` runs `apps/api` and `apps/web` with `concurrently`.
2. `packages/domain`: `package.json` (`"name": "@passform/domain"`, `"type":
   "module"`, `"exports": "./src/index.ts"`), `tsconfig.json` with
   `"strict": true`, `"noUncheckedIndexedAccess": true`, `src/index.ts`
   exporting a single `export const DOMAIN_VERSION = "0.0.0";` placeholder
   that Phase 1 replaces, and a vitest config. One passing test.
3. `packages/contracts`: same shape, `"name": "@passform/contracts"`,
   depends on `zod`. `src/index.ts` exports one schema,
   `HealthResponse = z.object({ ok: z.literal(true) })`, and its inferred
   type.
4. `apps/api`: NestJS via `npx @nestjs/cli new api --package-manager npm
   --skip-git` moved into place, then trimmed: TS strict flags, ESM-compatible
   config, `src/main.ts` listening on `API_PORT` with a global
   `ZodValidationPipe` from `nestjs-zod`, `src/app.module.ts`, and one
   controller `GET /health` returning `{ ok: true }` validated against
   `HealthResponse`. Dependencies now: `@nestjs/common`, `@nestjs/core`,
   `@nestjs/platform-express`, `nestjs-zod`, `zod`, `@passform/domain`,
   `@passform/contracts`. Testing: vitest with `unplugin-swc` and
   `@swc/core` so decorators and `emitDecoratorMetadata` work; one e2e-style
   test booting the Nest app with `Test.createTestingModule` and asserting
   `GET /health` → 200 `{ ok: true }` via `supertest`. Separate vitest
   configs: `vitest.config.ts` (unit, `src/**/*.test.ts`) and
   `vitest.integration.config.ts` (`test/**/*.int.test.ts`,
   `fileParallelism: false`); script `test:integration`.
5. `apps/web`: `npx create-next-app@latest web --ts --eslint --app --src-dir
   --tailwind --no-import-alias` moved into place; TS strict flags; Tailwind
   v4 confirmed; `src/app/globals.css` with design tokens as CSS custom
   properties: `--fit-ok` (emerald family), `--fit-ask` (amber family),
   `--fit-no` (red family), `--job-ok`, `--job-warn`, `--job-fail`.
   Placeholder values fine; final in Phase 7. `src/lib/api.ts` with a typed
   `apiFetch<T>(path: string, schema: ZodType<T>, init?: RequestInit):
   Promise<T>` that prefixes `NEXT_PUBLIC_API_URL`, throws `ApiError` with
   status and body on non-2xx, and parses the JSON with the given schema.
   The default page calls `apiFetch("/health", HealthResponse)` in a Server
   Component and renders "api: ok". Dependencies now:
   `@tanstack/react-query`, `zustand`, `zod`, `@passform/contracts`. No
   chart, table, or component libraries.
6. `docker-compose.yml`: `postgres:16` (port 5432, volume, credentials from
   `.env.example`), `redis:7` (port 6379), `elasticsearch:8.x` single node
   (`discovery.type=single-node`, `xpack.security.enabled=false`,
   `ES_JAVA_OPTS=-Xms1g -Xmx1g`, port 9200, volume) with healthchecks on all
   three. `.env.example` as in the shared conventions; `.env` gitignored.
7. Lint/format: ESLint flat config at root covering all workspaces
   (typescript-eslint, react hooks for web), Prettier, `.prettierignore`;
   scripts `lint`, `format`, `typecheck` (`tsc -b` over a root
   `tsconfig.json` with project references to all four workspaces).
8. Git hygiene: husky + lint-staged (prettier + eslint on staged files),
   commitlint with conventional config.
9. CI: `.github/workflows/ci.yml` — on push and PR: Node 22, `npm ci`,
   `lint`, `typecheck`, `test`, `build`; a second job starts the three
   services as GitHub service containers (Postgres, Redis, Elasticsearch
   with the same env as compose) and runs `test:integration`. The
   integration job passes trivially this phase (no integration tests yet)
   but proves the containers come up healthy: it curls `localhost:9200`
   and `pg_isready` before running.
10. `README.md` stub: one-liner, quick start (clone → `npm ci` → `cp
    .env.example .env` → `docker compose up -d` → `npm run dev`), link to
    PLAN.md and PHASES.md, and the synthetic-data disclaimer sentence.
11. `docs/decisions.md` with ADRs 1, 2, 12 drafted; `docs/ai-workflow.md`
    created with its header and the first friction entries from this
    session.

**Out of scope:** any domain code, any schema, any queue, any UI beyond the
default page.

**Acceptance:** fresh clone runs with the README quick start and
`http://localhost:3000` shows "api: ok"; pushing the branch runs both CI
jobs green; `docker compose ps` shows all three services healthy.

**Phase review checklist:** CI failed at least once during setup and you saw
why (proves the gates gate); no Nest CLI or create-next-app template
leftovers (default controllers, sample tests, favicon boilerplate);
lockfile committed; `.env.example` present, `.env` gitignored; the
Elasticsearch container starts within its healthcheck window on a cold
machine.

**PR:** `chore(scaffold): monorepo, nest + next skeletons, compose stack, CI with services`

---

## Phase 1 — Domain core (strict TDD)

**Context for a fresh session:** scaffold exists (Phase 0). This phase builds
the entire business logic as a pure TypeScript package. **Zero imports from
Nest, Next, Drizzle, zod, BullMQ, the Elasticsearch client, or Node built-ins
anywhere under `packages/domain/src`. No DB. No HTTP.** Strict
red-green-refactor: every behaviour gets a failing test first.

**Objective:** a fully tested fit, search-query, order and import-rule engine
another program could use, including a query builder that emits the exact
Elasticsearch body later phases send.

**Domain rules (authoritative):**

- A registration key is `manufacturer` (exactly 4 digits) + `type` (exactly
  3 characters `[A-Z0-9]`), compared case-insensitively after trimming.
- A fitment applies to a variant when: `variantId` matches; the variant's
  `buildFrom` lies inside the fitment window (`buildFrom ≤ v.buildFrom` when
  set, `buildTo ≥ v.buildFrom` when set); the fitment's `axle`, when set,
  equals the customer's chosen axle or no axle was chosen; the fitment's
  `equipmentCode`, when set, is in the variant's `equipment` — or the
  variant's `equipment` is empty, in which case the result is `ask`.
- Fit result over several fitment rows: any `fits` → `fits`; else any `ask`
  → `ask`; else `no`. Universal parts are always `fits`.
- Default ranking: `in_stock` boost 3, brand tier boost `oe` 2 / `premium`
  1 / `standard` 0, then `price_cents` ascending. Page size 24.
- Money is integer cents; totals never round. Reservation TTL is 15
  minutes.
- Chunk size is 1,000 rows.

**In scope**

1. `packages/domain/src/types.ts`
   ```ts
   export type Fuel = "petrol" | "diesel" | "hybrid" | "electric";
   export type Axle = "front" | "rear";
   export type BrandTier = "oe" | "premium" | "standard";
   export type YearMonth = string; // "YYYY-MM", validated by yearMonth.ts
   export interface RegistrationKey {
     manufacturer: string; // 4 digits
     type: string; // 3 chars [A-Z0-9], uppercased
   }
   export interface VehicleVariant {
     id: string;
     make: string;
     model: string;
     engineCode: string;
     kw: number;
     fuel: Fuel;
     buildFrom: YearMonth;
     buildTo: YearMonth | null;
     equipment: string[]; // empty = unknown
     key: RegistrationKey;
   }
   export interface Fitment {
     variantId: string;
     buildFrom: YearMonth | null;
     buildTo: YearMonth | null;
     axle: Axle | null;
     equipmentCode: string | null;
   }
   export interface Part {
     id: string;
     sku: string;
     brand: string;
     brandTier: BrandTier;
     categorySlug: string;
     name: string;
     oeRef: string;
     attributes: Record<string, string | number>;
     priceCents: number;
     stockQty: number;
     supplierId: string;
     universal: boolean;
   }
   export type FitResult =
     | { result: "fits"; reason: string }
     | { result: "no"; reason: string }
     | { result: "ask"; reason: string; equipmentCode: string };
   export interface OrderLineInput {
     partId: string;
     qty: number; // >= 1
     unitCents: number;
   }
   export class DomainError extends Error {
     constructor(message: string) {
       super(message);
       this.name = "DomainError";
     }
   }
   ```
2. `packages/domain/src/yearMonth.ts` — `isYearMonth(s: string): boolean`
   (`^\d{4}-(0[1-9]|1[0-2])$`); `compareYearMonth(a: YearMonth, b:
   YearMonth): -1 | 0 | 1` (lexical is correct for zero-padded values, and
   the test proves it with `"2012-08"` vs `"2012-12"` vs `"2013-01"`);
   `withinWindow(date: YearMonth, from: YearMonth | null, to: YearMonth |
   null): boolean`. Tests: boundaries inclusive on both ends; null sides
   open; invalid strings throw `DomainError` from `withinWindow`.
3. `packages/domain/src/vehicleKey.ts` —
   `parseRegistrationKey(input: { manufacturer: string; type: string }):
   RegistrationKey` (trim, uppercase, validate; throws `DomainError`
   naming the offending field); `resolveVariants(key: RegistrationKey,
   candidates: VehicleVariant[]): { variants: VehicleVariant[];
   needsDisambiguation: boolean }` — pure filter, `needsDisambiguation`
   is `variants.length > 1`, result sorted by `buildFrom` then `kw`;
   `variantLabel(v: VehicleVariant): string` →
   `"<engineCode> · <kw> kW · <fuel> · <buildFrom> → <buildTo ?? 'today'>"`
   (exact format asserted). Tests: lowercase/whitespace normalisation;
   `"12345"` rejected; zero, one, many candidates; sort order; label
   string.
4. `packages/domain/src/fit.ts` — `evaluateFit(variant: VehicleVariant,
   part: Pick<Part, "sku" | "universal">, fitments: Fitment[], chosenAxle:
   Axle | null): FitResult`. Exact reason strings:
   - universal: `"Universal part, fits every vehicle"`
   - fits: `"Fits <make> <model> <engineCode> (<buildFrom> → <buildTo|today>)"`,
     with ` on the <axle> axle` appended when the winning row has an axle
   - ask: `"Fits if the vehicle has equipment <code>; confirm before ordering"`
   - no, wrong build window: `"Not for vehicles built <buildFrom>; this part covers <from|any> → <to|any>"`
   - no, equipment contradicts: `"Requires equipment <code>, which this vehicle does not have"`
   - no, no row for the variant: `"No fitment for this vehicle"`
   - no, axle mismatch only: `"Only for the <axle> axle"`
   Precedence when several `no` rows exist: report the reason of the row
   that got furthest (variant match > window > axle > equipment). Tests: one
   fixture per reason; multi-row precedence (`fits` beats `ask` beats `no`);
   universal ignores rows; `chosenAxle` null shows both axles; input not
   mutated (deep-freeze in test).
5. `packages/domain/src/searchQuery.ts` —
   ```ts
   export type SearchSort = "default" | "price_asc" | "price_desc";
   export interface SearchInput {
     variant: VehicleVariant;
     q?: string;
     categorySlug?: string;
     brand?: string;
     axle?: Axle | null;
     sort: SearchSort;
     page: number; // >= 1
   }
   export const PAGE_SIZE = 24;
   export const BOOSTS = { inStock: 3, oe: 2, premium: 1 } as const;
   export function buildSearchQuery(input: SearchInput): SearchBody;
   export interface SearchBody {
     query: unknown;
     sort: unknown[];
     from: number;
     size: number;
     track_total_hits: true;
     _source: { excludes: ["fitments"] };
   }
   ```
   The emitted body, exactly:
   - `query.bool.filter[0]` = `{ bool: { should: [ { nested: { path:
     "fitments", query: <fitmentQuery>, inner_hits: { size: 10 } } }, {
     term: { universal: true } } ], minimum_should_match: 1 } }`
   - `<fitmentQuery>` = `{ bool: { filter: [ { term: { "fitments.variant_id":
     v.id } }, <fromClause>, <toClause>, <axleClause?>, <equipmentClause?> ] } }`
     where `<fromClause>` = `{ bool: { should: [ { bool: { must_not: {
     exists: { field: "fitments.build_from" } } } }, { range: {
     "fitments.build_from": { lte: v.buildFrom } } } ], minimum_should_match:
     1 } }`, `<toClause>` mirrors it with `build_to` and `gte`,
     `<axleClause>` (only when `input.axle` is set) = the same shape over
     `fitments.axle` with a `term`, `<equipmentClause>` (only when
     `v.equipment.length > 0`) = the same shape over
     `fitments.equipment_code` with `terms: { "fitments.equipment_code":
     v.equipment }`.
   - further `filter` entries, in order and only when present: `{ term: {
     category_path: categorySlug } }`, `{ term: { brand } }`, `{ multi_match:
     { query: q, fields: ["name", "sku", "oe_ref", "brand"] } }`.
   - `query.bool.should` = `[ { term: { in_stock: { value: true, boost: 3 }
     } }, { term: { brand_tier: { value: "oe", boost: 2 } } }, { term: {
     brand_tier: { value: "premium", boost: 1 } } } ]`.
   - `sort`: `default` → `["_score", { price_cents: "asc" }]`; `price_asc`
     → `[{ price_cents: "asc" }]`; `price_desc` → `[{ price_cents: "desc" }]`.
   - `from = (page - 1) * 24`, `size = 24`; `page < 1` throws `DomainError`.
   Tests assert the full body with `toEqual` for: minimal input; every
   optional facet; known vs unknown equipment; each sort; page 3; the
   universal short-circuit is present in every body. This module is the
   constrain-then-rank design as a unit-tested artifact.
6. `packages/domain/src/orders.ts` — `lineTotalCents(line: OrderLineInput):
   number`; `orderTotalCents(lines: OrderLineInput[]): number` (throws
   `DomainError` on empty lines, `qty < 1`, or non-integer cents);
   `canonicalJson(value: unknown): string` (recursively key-sorted, no
   whitespace, `undefined` dropped, arrays preserved; the API hashes this
   string); `isIdempotencyKey(s: string): boolean` (UUID, any version,
   case-insensitive); `RESERVATION_TTL_MINUTES = 15`;
   `reservationExpiresAt(placedAt: Date): Date`. Tests: hand-computed
   totals; canonical JSON is order-independent (`{b:1,a:2}` ≡ `{a:2,b:1}`)
   and nested; UUID accept/reject fixtures; expiry is exactly +15 min.
7. `packages/domain/src/importRows.ts` —
   ```ts
   export interface ImportRow {
     sku: string;
     brand: string;
     brandTier: BrandTier;
     categorySlug: string;
     name: string;
     oeRef: string;
     attributes: Record<string, string | number>;
     priceCents: number;
     stockQty: number;
     universal: boolean;
     fitments: Fitment[];
   }
   export type RowValidation =
     | { ok: true; row: ImportRow }
     | { ok: false; errors: string[] };
   export function validateImportRow(raw: unknown): RowValidation;
   export const CHUNK_SIZE = 1000;
   export interface ChunkRange { seq: number; rowFrom: number; rowTo: number } // 0-based, rowTo exclusive
   export function chunkRanges(totalRows: number, chunkSize?: number): ChunkRange[];
   ```
   Hand-written validation (no zod in the domain): every field type and
   range checked, `fitments` entries validated with `isYearMonth` and the
   `Axle` union, a universal row must have zero fitments, errors are
   `"<field>: <problem>"` strings and all are collected, not just the first.
   Tests: a valid row round-trips; each field's failure produces its named
   error; multiple errors collected; `chunkRanges(2500)` → three ranges
   `[0,1000) [1000,2000) [2000,2500)`; `chunkRanges(0)` → `[]`.
8. `packages/domain/src/index.ts` — public re-exports only; remove the
   Phase 0 placeholder.

**Out of scope:** Drizzle, zod, any Nest module, any fetch, any component.

**Acceptance:** `npx vitest run` in `packages/domain` green; every behaviour
above has a test that fails when the behaviour is broken; ADRs 3 and 4
written.

**Phase review checklist:** mutate a rule on purpose (flip the `buildTo`
comparison to `>`) and confirm at least one test fails, then revert; no
`any` in the package; every reason string appears in exactly one place;
`BOOSTS` and `PAGE_SIZE` referenced from tests, not duplicated; the grep
for framework imports returns nothing.

**PR:** `feat(domain): vehicle keys, fit evaluation, search query builder, order and import rules`

---

## Phase 2 — Schema, migrations, generator, seeding

**Context for a fresh session:** domain core exists (Phase 1) and is the only
source of business logic. This phase adds the Postgres schema and a
deterministic synthetic dataset at two sizes. Repositories are not built
yet; this phase ships the tables, the generator, and a seeding path fast
enough for millions of rows. Integration tests run against the
docker-compose database.

**Objective:** `npm run db:setup` produces a populated database from
nothing, reproducibly, and the `large` profile's numbers are known.

**In scope**

1. `apps/api/src/infra/db/schema.ts` (Drizzle, `pg-core`), matching the
   spec §5 exactly:
   - `vehicle_variants`: `id text pk`, `make`, `model`, `engine_code`, `kw
     int`, `fuel text`, `build_from char(7)`, `build_to char(7) null`,
     `equipment text[] not null default '{}'`, `key_manufacturer char(4)`,
     `key_type char(3)`; index `(key_manufacturer, key_type)`; index
     `(make, model)`.
   - `categories`: `id text pk` (the slug), `name`, `parent_id text null
     references categories`.
   - `suppliers`: `id text pk`, `name`.
   - `parts`: `id text pk`, `sku text unique`, `brand`, `brand_tier text`,
     `category_id text references categories`, `name`, `oe_ref`,
     `attributes jsonb not null default '{}'`, `price_cents int`,
     `stock_qty int not null default 0` with `check (stock_qty >= 0)`,
     `supplier_id text references suppliers`, `universal boolean not null
     default false`; indexes `(brand)`, `(category_id)`, `(supplier_id)`.
   - `fitments`: `id bigserial pk`, `part_id text references parts on
     delete cascade`, `variant_id text references vehicle_variants`,
     `build_from char(7) null`, `build_to char(7) null`, `axle text null`,
     `equipment_code text null`; indexes `(variant_id)`, `(part_id)`.
   - `imports`: `id text pk`, `supplier_id text references suppliers`,
     `status text` (`queued | running | completed | partial | failed`),
     `file_path text`, `total_rows int`, `processed_rows int default 0`,
     `failed_rows int default 0`, `chunk_size int`, `started_at
     timestamptz null`, `finished_at timestamptz null`, `error jsonb null`,
     `created_at timestamptz default now()`.
   - `import_chunks`: `(import_id text references imports on delete cascade,
     seq int) pk`, `status text` (`pending | done | failed`), `attempts int
     default 0`, `row_from int`, `row_to int`, `error jsonb null`.
   - `orders`: `id text pk`, `idempotency_key text unique`, `payload_hash
     text`, `status text` (`placed | confirmed | expired`), `total_cents
     int`, `response jsonb null`, `created_at timestamptz default now()`,
     `confirmed_at timestamptz null`.
   - `order_lines`: `(order_id text references orders on delete cascade,
     part_id text references parts) pk`, `qty int check (qty >= 1)`,
     `unit_cents int`.
   - `stock_reservations`: `id bigserial pk`, `order_id text references
     orders on delete cascade`, `part_id text references parts`, `qty int`,
     `expires_at timestamptz`, `released_at timestamptz null`; index
     `(expires_at) where released_at is null`.
   Migration generated with `drizzle-kit generate --name init` and
   committed under `apps/api/drizzle/`. `drizzle.config.ts` at
   `apps/api/`. `apps/api/src/infra/db/client.ts` exports a lazily
   created `pg.Pool` + `drizzle(pool, { schema })` from `DATABASE_URL`.
2. Row mappers `apps/api/src/infra/db/mappers.ts`: `rowToVariant`,
   `rowToPart`, `rowToFitment` (and the inverses used by seeding) so the
   domain never sees column names. Pragmatic unit tests: round-trip each.
3. Generator `apps/api/scripts/generate.ts` (`npm run data:generate --
   --profile small|large --out $DATA_DIR/<profile>`), deterministic PRNG
   (mulberry32, fixed seed constant `0x5eed`), streaming writes, never
   holding the `large` profile in memory:
   - **Names, all invented compounds**, kept in one constants file
     `apps/api/scripts/names.ts`: 12 makes (e.g. `"Varenta"`, `"Kolmberg"`,
     `"Ostrava Motors"` — invent; verify each by web search that it is not
     a real vehicle maker, and do not record real names anywhere), 5–7
     models per make, engine codes like `"D16-77"`, 40 brands with tiers
     assigned 5 `oe` / 12 `premium` / 23 `standard`, 6 suppliers,
     equipment codes `["BRK-L", "SUS-S", "AC", "TOW", "LED", "AWD"]`.
   - **Categories**: a fixed tree, depth ≤ 3, about 60 leaves (brakes/pads,
     brakes/discs, filters/oil, filters/air, lighting/bulbs, wipers/blades,
     fluids/oil, suspension/shocks, …). `universal`-eligible leaves:
     `lighting/bulbs`, `wipers/blades`, `fluids/*`.
   - **Profiles**: `small` = 2,000 variants, 5,000 parts; `large` = 50,000
     variants, 2,000,000 parts. Variants: each model gets a run of
     variants with distinct `(engineCode, kw, fuel, buildFrom)`; 20% of
     registration keys are shared by 2–3 variants of the same model (the
     disambiguation case); 30% of variants have empty `equipment`
     (unknown). Parts: 5% universal (from eligible leaves, no fitments);
     the rest get 4–20 fitments (mean ≈ 12) to variants, biased toward
     variants of one make; per fitment 20% carry a build window inside the
     variant's own window, 30% carry an axle when the category is
     brakes/* or suspension/*, 10% carry an equipment code. Prices
     correlated with category and tier; `stock_qty` 0 for 8% of parts.
   - **Outputs** in `--out`: `variants.jsonl`, `categories.json`,
     `suppliers.json`, `parts.jsonl` (each line an `ImportRow` plus `id`).
   - `apps/api/scripts/generate-import.ts` (`--rows N --supplier s_01
     --from $DATA_DIR/small --out file.jsonl`): emits `N` `ImportRow`
     lines, 70% updates to existing SKUs (price ±10%, stock changed, one
     fitment added or window changed) and 30% new SKUs, valid against
     `validateImportRow`. The DoD's 500,000-row file comes from here.
4. Seeding `apps/api/scripts/seed.ts` (`npm run db:seed -- --from
   $DATA_DIR/small`): truncates the catalogue tables, then streams each
   file into Postgres with `COPY ... FROM STDIN` via `pg-copy-streams`
   (categories and suppliers as plain inserts). `npm run db:setup` =
   `db:migrate` → `data:generate` (small) → `db:seed` → `index:rebuild`
   (the last exists from Phase 3; until then `db:setup` stops after seed
   and says so).
5. Integration tests (`apps/api/test/schema.int.test.ts`): migrations apply
   on an empty database; a `small` generate → seed round-trips the row
   counts; the `(key_manufacturer, key_type)` index is not unique (insert
   two variants with the same key succeeds); `stock_qty` check rejects
   negatives; `orders.idempotency_key` is unique.
6. Determinism test: run the `small` generator twice into temp dirs and
   `diff` byte-identical.
7. Timings: run `large` generate + seed once locally, record wall-clock
   and row counts in `docs/numbers.md` (created now; the README quotes it
   in Phase 8).
8. CI: the integration job runs `db:migrate` then `test:integration`.
9. ADR 7 written.

**Out of scope:** any repository beyond what seeding needs; any endpoint;
Elasticsearch; queues.

**Acceptance:** `npm run db:setup` on a fresh `docker compose up -d`
completes; `psql -c 'select count(*) from parts'` → 5000; integration tests
green locally and in CI; `docs/numbers.md` has the `large` figures.

**Phase review checklist:** domain package still has zero db/zod imports
(grep); every table and index in spec §5 exists in `schema.ts` (tick them
off by name); generator output for `small` is byte-identical across runs;
no real make, model, brand or company name in `names.ts` (each checked).

**PR:** `feat(schema): drizzle schema and migrations, deterministic generator, COPY seeding`

---

## Phase 3 — Elasticsearch index, builder, alias swap

**Context for a fresh session:** schema and seed exist (Phase 2); the
domain's `buildSearchQuery` emits the exact query body (Phase 1). This
phase creates the index that body is written against, builds it from
Postgres, and makes rebuilds atomic. No HTTP endpoint yet. Integration
tests use a throwaway index name per file.

**Objective:** `npm run index:rebuild` produces a searchable `parts` alias
whose count matches Postgres, and a failed rebuild leaves the old alias
untouched.

**In scope**

1. `apps/api/src/search/mapping.ts` — the mapping, exported as a constant:
   ```
   sku keyword · name text (+ keyword subfield) · brand keyword ·
   brand_tier keyword · category_path keyword (array: every ancestor slug
   plus the leaf) · oe_ref keyword · attributes object (dynamic true, with
   attributes.axle keyword declared) · price_cents integer · in_stock
   boolean · universal boolean ·
   fitments nested { variant_id keyword, build_from date (format yyyy-MM),
   build_to date (format yyyy-MM), axle keyword, equipment_code keyword }
   ```
   Settings: 1 shard, 0 replicas, refresh_interval `-1` during bulk load,
   restored to `1s` after.
2. `apps/api/src/search/documents.ts` — `partToDocument(part: Part,
   categoryPath: string[], fitments: Fitment[]): PartDocument` with the
   `PartDocument` interface mirroring the mapping. Pragmatic unit tests:
   a universal part has an empty `fitments` array; `in_stock` derives from
   `stockQty > 0`; `category_path` includes ancestors.
3. `apps/api/src/search/es.client.ts` — `@elastic/elasticsearch` client
   from `ELASTICSEARCH_URL`, provided by a Nest `SearchInfraModule`.
4. `apps/api/src/search/alias.ts` — `ALIAS = "parts"`; `nextIndexName():
   string` (`parts_v<unix-ms>`); `currentIndexName(): Promise<string |
   null>`; `swapAlias(to: string): Promise<{ from: string | null }>` as a
   single `updateAliases` call with `remove` + `add` actions; `deleteIndex`.
5. `apps/api/src/search/index-builder.ts` — `rebuildIndex(): Promise<{
   index: string; count: number; seconds: number }>`: create `parts_v<n>`
   with the mapping; stream parts from Postgres with their category path
   and fitments (one query per 5,000 parts, fitments fetched per batch,
   grouped in memory per batch only); `helpers.bulk` with 2,000-document
   chunks; refresh; **verify** `count(index) === select count(*) from
   parts`; on mismatch delete the new index and throw
   `IndexVerificationError` with both numbers; on success `swapAlias`,
   then delete the previous index if any. Logs document count and the
   largest `fitments` array length seen.
6. Command `apps/api/scripts/index-rebuild.ts` (`npm run index:rebuild`)
   calling `rebuildIndex()` and printing the result; wire it into
   `db:setup`.
7. Integration tests (`apps/api/test/index.int.test.ts`, throwaway alias
   name via env override so the test never touches `parts`): rebuild from
   a seeded `small` database → alias exists, count 5000; a second rebuild
   swaps to a new index name and the old one is gone; simulate a
   verification failure (delete 10 parts from Postgres between the count
   and the swap by stubbing the count query) → alias still points at the
   previous index and the new index is deleted; a `buildSearchQuery` body
   for a known variant returns only parts with a matching nested fitment
   or `universal: true` (assert against the seed by computing the expected
   set in SQL).
8. Timings: run `large` rebuild once locally, record seconds, document
   count and the largest fitments array in `docs/numbers.md`.
9. ADRs 5, 6 and 11 written.

**Out of scope:** the search endpoint, per-hit fit evaluation, partial
updates (Tier 2), queues.

**Acceptance:** `npm run db:setup` ends with a populated alias; `curl
localhost:9200/parts/_count` → 5000; the verification-failure test passes;
`docs/numbers.md` has the `large` index figures.

**Phase review checklist:** the alias is the only name the API will ever
read (grep for `parts_v` outside `alias.ts`); the bulk loader never holds
more than one batch in memory (check the loop); the mapping's `date`
format matches the `YYYY-MM` strings the domain emits (an integration test
with `"2012-08"` proves it).

**PR:** `feat(index): nested-fitment mapping, index builder, verified alias swap`

---

## Phase 4 — Read API, contracts, API docs

**Context for a fresh session:** schema, seed and index exist (Phases 2–3).
This phase exposes the read path over documented REST endpoints, with the
zod contracts shared to the web app. Services and controllers are
pragmatic TDD (repositories stubbed); repositories and the search service
get integration tests.

**Objective:** every read endpoint in the contract answers correctly
against the seeded stack, and `docs/api.md` describes each one.

**In scope**

1. `packages/contracts/src/` — zod schemas + inferred types, one file per
   resource: `vehicles.ts` (`ResolveVehicleQuery` = `{ manufacturer: string,
   type: string }`, `VehicleVariantDto`, `ResolveVehicleResponse` = `{
   variants: VehicleVariantDto[], needsDisambiguation: boolean }`,
   `MakesResponse`, `ModelsQuery`, `ModelsResponse`, `VariantsQuery`),
   `categories.ts` (`CategoryNode` recursive), `search.ts` (`SearchQuery`
   with `variantId` required, `q`, `category`, `brand`, `axle`, `sort`
   defaulting to `"default"`, `page` coerced to int ≥ 1 default 1;
   `FitDto` = the domain `FitResult` shape; `SearchHitDto` = part fields +
   `fit`; `SearchResponse` = `{ hits, stages: { fitted, shown }, page,
   pageSize }`), `parts.ts` (`PartDetailQuery` = `{ variantId?: string }`,
   `PartDetailResponse` = part + `fit | null` + `fitments: FitmentDto[]`),
   `errors.ts` (`ErrorResponse` = `{ statusCode, message, issues? }`).
2. `apps/api/src/vehicles/` — `VehiclesRepository` (`findByKey(key):
   Promise<VehicleVariant[]>`, `findById`, `listMakes`, `listModels(make)`,
   `listVariants(make, model)`), `VehiclesService` (`resolve(input)` =
   `parseRegistrationKey` → repository → domain `resolveVariants`; 400 on
   `DomainError`), `VehiclesController` for `GET /vehicles/resolve`,
   `/vehicles/makes`, `/vehicles/models`, `/vehicles`, `/vehicles/:id`
   (404 when unknown). A global exception filter maps `DomainError` → 400
   and zod issues → 400 `ErrorResponse`.
3. `apps/api/src/catalog/` — `CategoriesRepository.tree()` (one query,
   assembled in memory), `PartsRepository.findBySku(sku)` with its
   fitments and category path, `CatalogController` for `GET /categories`
   and `GET /parts/:sku?variantId=` (fit evaluated via domain
   `evaluateFit` with `chosenAxle: null` when `variantId` is given; 404
   for unknown sku or variant).
4. `apps/api/src/search/search.service.ts` — `search(input: SearchQuery):
   Promise<SearchResponse>`: load the variant (404 if unknown), call
   `buildSearchQuery`, run it against the alias, map hits to
   `SearchHitDto` with `fit` computed by `evaluateFit(variant, part,
   innerHitFitments, input.axle ?? null)` where `innerHitFitments` are the
   nested `inner_hits` rows (universal parts get the universal reason),
   `stages.fitted = hits.total.value`, `stages.shown = hits.length`.
   `SearchController` for `GET /search`.
5. Pragmatic unit tests: `VehiclesService.resolve` with a stubbed
   repository (one / many / malformed key); `SearchService.search` with a
   stubbed ES client returning two hits (one nested match, one universal)
   asserts the fit results and stages; one 400 test per controller via
   `supertest`.
6. Integration tests (`apps/api/test/api.int.test.ts`) against the seeded
   stack: resolve a key the generator shares between variants →
   `needsDisambiguation: true`; `GET /search?variantId=v_000001` returns
   only parts that fit or are universal (cross-check one page against
   SQL); `sort=price_asc` is monotonic; `axle=front` removes rear-only
   rows; a variant with empty equipment yields at least one `ask` hit in
   the seed (the generator guarantees one; assert it); `GET /parts/:sku`
   for a universal part reports the universal reason.
7. `docs/api.md`: every endpoint, parameter, response field and error
   documented, with one curl example each.
8. ADR 13 written (zod via `nestjs-zod`, contracts shared).

**Out of scope:** imports, orders, any web page, Bull Board.

**Acceptance:** `curl "localhost:4000/search?variantId=v_000001&sort=price_asc"`
returns hits each carrying `fit.result` and `fit.reason`, plus `stages`;
all unit and integration tests green locally and in CI.

**Phase review checklist:** controllers contain no logic beyond parse →
service → JSON (each body ≤ ~15 lines); no SQL outside `*Repository`
files; `evaluateFit` is the only place a fit reason is produced (grep for
reason strings); `docs/api.md` examples were actually run.

**PR:** `feat(api): vehicle resolution, categories, constrain-then-rank search with per-hit fit, part detail`

---

## Phase 5 — Import pipeline

**Context for a fresh session:** the read API works over a seeded index
(Phase 4). This phase adds ingestion: supplier files processed in
idempotent chunks on BullMQ, an index rebuild triggered when the import is
terminal, visibility via the API and Bull Board. Processors are integration
tested against the compose Redis and Postgres.

**Objective:** a 500,000-row generated file imports to completion through
the queue, partial failures are visible and resumable, and the alias swaps
while search keeps answering.

**In scope**

1. Queue infrastructure `apps/api/src/infra/queues.ts` — `@nestjs/bullmq`
   root connection from `REDIS_URL`; queue names as constants:
   `IMPORT_CHUNK = "import.chunk"`, `INDEX_REBUILD = "index.rebuild"`,
   `IMPORT_CHUNK_DLQ = "import.chunk.dlq"`. Default job options for
   `import.chunk`: `attempts: 5`, `backoff: { type: "exponential", delay:
   2000 }`, `removeOnComplete: 1000`, `removeOnFail: false`. Worker
   options: `concurrency: 4`, `limiter: { max: 4, duration: 1000 }`.
2. Splitter `apps/api/src/imports/splitter.ts` — `splitFile(importId,
   filePath, chunkSize): Promise<{ totalRows: number; chunks: ChunkRange[]
   }>`: streams the `.jsonl` file line by line, writes
   `$DATA_DIR/imports/<importId>/chunk-<seq>.jsonl`, returns the ranges
   from domain `chunkRanges`. Pragmatic unit test with a 2,500-line temp
   file → three chunk files, sizes 1000/1000/500.
3. `ImportsService.create({ supplierId, filePath })` — inserts `imports`
   (`queued`), runs the splitter, inserts one `import_chunks` row per
   range (`pending`), enqueues one `import.chunk` job per chunk with
   `jobId = "<importId>:<seq>"` and payload `{ importId, seq }` only,
   sets status `running`. `ImportsService.get(id)` returns status and
   counts plus the chunk summary.
4. Chunk processor `apps/api/src/imports/chunk.processor.ts` — for `{
   importId, seq }`: load the chunk row; **if status is `done`, return
   immediately (idempotent re-run)**; read its file; validate each line
   with domain `validateImportRow`, collecting invalid rows with their
   errors; in one transaction upsert valid parts on `sku` (`ON CONFLICT
   DO UPDATE` all mutable columns), delete existing `fitments` for those
   part ids and insert the row's fitments, mark the chunk `done`, add to
   `processed_rows` and `failed_rows`; on any thrown error mark `attempts
   += 1` and rethrow so BullMQ retries. After the final attempt fails,
   BullMQ's `failed` event handler moves the job to `import.chunk.dlq`
   with the error and the invalid-row report attached, and marks the
   chunk `failed`. Unknown `categorySlug` or `variantId` in a row is a
   row error, not a chunk failure.
5. Completion `apps/api/src/imports/completion.ts` — after every chunk
   reaches `done` or `failed`, a `QueueEvents` listener checks whether all
   chunks of that import are terminal; if so, sets `imports.status` to
   `completed` (no failed chunks) or `partial`, `finished_at`, and enqueues
   one `index.rebuild` job with `jobId = "rebuild:<importId>"`.
6. Rebuild processor `apps/api/src/imports/rebuild.processor.ts` — calls
   `rebuildIndex()` from Phase 3; on `IndexVerificationError` marks the
   import's `error` and leaves the alias where it was.
7. `POST /imports` (`CreateImportBody` = `{ supplierId, path }` for a file
   under `DATA_DIR`, or multipart `file`) → 202 `{ importId }`; `GET
   /imports/:id` → `ImportStatusResponse` = `{ id, status, totalRows,
   processedRows, failedRows, chunks: { pending, done, failed }, startedAt,
   finishedAt, error }`. Contracts added to `packages/contracts/src/imports.ts`.
8. Bull Board mounted at `/admin/queues` (`@bull-board/api`,
   `@bull-board/express`) showing all three queues.
9. Integration tests (`apps/api/test/imports.int.test.ts`, worker started
   in-process, Redis flushed per test): a 2,500-row valid file → `completed`,
   `processed_rows` 2500, parts upserted, an `index.rebuild` job enqueued;
   **idempotency**: re-add the job for a `done` chunk → processor returns
   without touching Postgres (assert row counts unchanged and `attempts`
   unchanged); **resumption**: kill the worker after chunk 0, restart,
   remaining chunks complete; **partial**: a file whose second chunk has
   an unknown category on every row → import `partial`, `failed_rows` 1000,
   chunk 1 `done` (row errors are not chunk failures), other chunks `done`;
   **DLQ**: make the chunk file unreadable → after 5 attempts the job is
   in `import.chunk.dlq`, the chunk is `failed`, the import is `partial`.
   Use `attempts: 2, delay: 10` in tests via an env override to keep them
   fast.
10. Throughput: run the 500,000-row generated file locally against the
    `small` seed, record rows/second and total time in `docs/numbers.md`,
    and confirm with a loop of `curl /search` during the run that search
    never errors.
11. ADR 8 written.

**Out of scope:** orders, the web imports page, partial document updates
(Tier 2), authentication on `/admin/queues`.

**Acceptance:** the integration tests above green locally and in CI; the
500,000-row run completes with the alias swapped and `docs/numbers.md`
updated; Bull Board shows the queues.

**Phase review checklist:** a job payload contains only `{ importId, seq
}` (grep the `add(` calls); the processor's first statement after loading
the chunk is the `done` short-circuit; the per-chunk transaction includes
the chunk status update (a crash cannot leave rows written and the chunk
`pending`); the completion listener is safe to fire twice (the rebuild
`jobId` dedupes).

**PR:** `feat(import): chunked idempotent import pipeline with retries, DLQ and verified rebuild`

---

## Phase 6 — Orders

**Context for a fresh session:** catalogue, search and imports work
(Phases 2–5). This phase adds order creation that is idempotent on a
client key and correct under concurrent stock contention, with expiry as
the compensation path. The transaction and its concurrency guarantees are
integration tested against the compose Postgres.

**Objective:** the same request sent twice yields one order; two buyers
racing for the last unit yield one 201 and one 409; unconfirmed orders
expire and give the stock back.

**In scope**

1. Contracts `packages/contracts/src/orders.ts`: `CreateOrderBody` = `{
   lines: [{ partId: string, qty: int ≥ 1 }] }` (non-empty, unique
   `partId`s); `OrderResponse` = `{ id, status, totalCents, lines: [{
   partId, sku, name, qty, unitCents }], expiresAt, confirmedAt }`;
   `OrderErrorResponse` extends `ErrorResponse` with `sku?: string`.
2. `OrdersRepository` with one method that owns the transaction,
   `createOrder(input: { key: string; payloadHash: string; lines:
   OrderLineInput[] }): Promise<CreateOrderOutcome>` where
   `CreateOrderOutcome = { kind: "created"; order } | { kind: "replayed";
   response } | { kind: "conflict" } | { kind: "out_of_stock"; sku }`:
   1. `BEGIN`; `SELECT pg_advisory_xact_lock(hashtext($key))` so
      concurrent requests with the same key serialise.
   2. `SELECT payload_hash, response FROM orders WHERE idempotency_key =
      $key`: same hash → `replayed` with the stored response; different
      hash → `conflict`; none → continue.
   3. Insert the order (`placed`, `total_cents` from domain
      `orderTotalCents` over the current unit prices) and its lines.
   4. Per line: `UPDATE parts SET stock_qty = stock_qty - $qty WHERE id =
      $id AND stock_qty >= $qty RETURNING sku`; zero rows → `ROLLBACK`,
      return `out_of_stock` with the sku. No `SELECT` then `UPDATE`.
   5. Insert `stock_reservations` with `expires_at =
      reservationExpiresAt(now)`.
   6. Build the response DTO, `UPDATE orders SET response = $json`,
      `COMMIT`, return `created`.
   The unique index on `idempotency_key` is the backstop; a unique
   violation is treated as `replayed` after re-reading.
3. `OrdersService.create(key, body)`: validates the key with domain
   `isIdempotencyKey` (400 otherwise), loads unit prices for the lines
   (404 for an unknown part), computes `payloadHash = sha256(canonicalJson(
   body))` (Node `crypto`, in the service, not the domain), calls the
   repository, maps outcomes: `created` → 201, `replayed` → 200 with the
   stored body, `conflict` → 409 `"Idempotency-Key reused with a different
   payload"`, `out_of_stock` → 409 with `sku`.
   `OrdersService.confirm(id)`: `UPDATE orders SET status = 'confirmed',
   confirmed_at = now() WHERE id = $id AND status = 'placed'` → 0 rows: 404
   if unknown, 409 `"Order has expired"` if `expired`, 200 if already
   `confirmed`. `OrdersService.get(id)`.
4. `OrdersController`: `POST /orders` (header `Idempotency-Key` required,
   400 without), `POST /orders/:id/confirm`, `GET /orders/:id`.
5. Release job `apps/api/src/orders/release.processor.ts` on a queue
   `reservations.release`, repeatable every 60 s (`jobId:
   "reservations.release"` so only one schedule exists): in one
   transaction, select `placed` orders with an unreleased reservation past
   `expires_at`, set them `expired`, `UPDATE parts SET stock_qty =
   stock_qty + qty` per reservation, set `released_at`. Confirmed orders
   are never selected.
6. Pragmatic unit tests: `OrdersService.create` with a stubbed repository
   for each outcome → status mapping; missing header → 400; bad UUID →
   400.
7. Integration tests (`apps/api/test/orders.int.test.ts`):
   - create → 201, stock decremented, reservation row present, `GET`
     returns it;
   - **replay**: same key + same body → 200 with a byte-identical body,
     stock decremented once;
   - **mismatch**: same key + different body → 409;
   - **race on the key**: `Promise.all` of 10 identical requests → one 201,
     nine 200, one order row;
   - **race on stock**: a part with `stock_qty = 1`, 10 requests with
     distinct keys → one 201, nine 409 naming the sku, `stock_qty` 0;
   - **expiry**: create, set `expires_at` to the past via SQL, run the
     release processor once → order `expired`, stock restored,
     `released_at` set; confirm → 409;
   - **confirm**: create, confirm → 200 `confirmed`; run the release
     processor with `expires_at` in the past → untouched.
8. Contracts and `docs/api.md` updated for the three endpoints.
9. ADRs 9 and 10 written.

**Out of scope:** payment, cart persistence server-side, the web pages,
DynamoDB events (Tier 2).

**Acceptance:** all seven integration scenarios green locally and in CI;
`curl -X POST -H 'Idempotency-Key: <uuid>' ...` twice returns 201 then 200
with the same body.

**Phase review checklist:** the advisory lock is the first statement after
`BEGIN`; the stock update has `stock_qty >= $qty` in its `WHERE` and the
code checks `rowCount`; the stored `response` is what replay returns
(never recomputed); the release job's selection excludes `confirmed`
orders in SQL, not in TypeScript.

**PR:** `feat(orders): idempotent order creation, conditional stock reservation, expiry release, confirm`

---

## Phase 7 — Web client

**Context for a fresh session:** the API is complete for Tier 1 (Phases
4–6). This phase builds the thin Next.js client that makes the backend's
behaviour visible. Presentational components are untested-by-design except
one smoke test per page; the URL codec and the cart store get pragmatic
tests. All data comes through `apps/web/src/lib/api.ts`; the web app never
touches Postgres, Redis or Elasticsearch.

**Objective:** a visitor can resolve a vehicle, see the two search stages,
open a part, place an order, replay it and get one order back, confirm it,
and watch an import run.

**In scope**

1. `apps/web/src/lib/searchParams.ts` — codec between `URLSearchParams`
   and `{ variantId, q, category, brand, axle, sort, page }` (URL param names `variant`, `q`, `category`, `brand`, `axle`, `sort`, `page`; defaults:
   sort `default`, page 1); invalid values fall back to defaults, never
   throw. Pragmatic tests: round-trip, junk input, default elision.
2. `apps/web/src/state/cartStore.ts` (Zustand, persisted to `localStorage`
   under `pf_cart`, pragmatic tests): `{ variantId: string | null; lines:
   Record<partId, { sku, name, unitCents, qty }> }`; actions `setVariant`,
   `add(part)` (qty 1, increments if present), `setQty(partId, qty)`
   (clamps to `1..stockQty`), `remove`, `clear`. Tests: add/increment/
   clamp/remove/clear.
3. Vehicle context: the selected `variantId` lives in the URL (`?variant=`)
   and is mirrored to a cookie `pf_variant` by a small server action so
   `/parts` without a query param still knows the vehicle. A `VehicleBar`
   at the top of every page shows the current vehicle (via `GET
   /vehicles/:id`) with a "change" link.
4. `/` page (RSC + one client island): two-field registration key form;
   on submit calls `GET /vehicles/resolve`; zero → inline "no vehicle for
   this key" with the fallback below; one → sets the vehicle and routes to
   `/parts`; many → **disambiguation card** listing each variant with the
   domain-style label (engine, kW, fuel, build window) as buttons.
   Fallback: make → model → variant selects from `/vehicles/makes`,
   `/vehicles/models`, `/vehicles`.
5. `/parts` page (RSC): parses `searchParams` via the codec, calls `GET
   /search`, renders `StageStrip`, `FilterRail` (category tree from `GET
   /categories`, brand text filter, axle radio, sort select, all writing
   the URL via `router.replace`), `ResultsList` and `Pagination`.
   `StageStrip` text, exactly: `"<fitted> fit your vehicle → <shown>
   shown, <sort description>"` with sort descriptions `"in stock first,
   then price"`, `"price ascending"`, `"price descending"`; wrapped in an
   `aria-live="polite"` region. Each result row: brand, name, price (EUR
   from cents), availability text, and a `FitBadge` (`fits` in
   `--fit-ok`, `ask` in `--fit-ask` with the equipment code, always with
   the word and the reason as visible text).
6. `/parts/[sku]` page (RSC): `GET /parts/:sku?variantId=`; fit
   evaluation block; fitment rows as a plain table; attributes; "add to
   cart" client button; 404 page for unknown sku.
7. `/cart` page (client): lines with qty inputs, totals from the domain
   (`orderTotalCents` via the domain package, imported into the web app
   — the domain is isomorphic), "place order" button that generates a UUID
   once per cart (`crypto.randomUUID()`, stored in the cart store as
   `pendingKey`) and POSTs with `Idempotency-Key`; on 201 or 200, routes to
   `/orders/[id]` and clears the cart.
8. `/orders/[id]` page (RSC + island): order lines and totals; status
   badge; expiry countdown for `placed`; **"send again"** button that
   re-POSTs the identical body with the identical key (kept in
   `sessionStorage` under `pf_last_order`) and shows the HTTP status it got
   back next to the original (`"201 created"` then `"200 replayed, same
   order"`); **"confirm"** button calling `POST /orders/:id/confirm`;
   `expired` orders show why and a link back to the cart.
9. `/imports` page (client): supplier select, a path input defaulting to
   the last generated file name, "start import" → `POST /imports`; a
   status card polling `GET /imports/:id` every 2 s with the counts and a
   progress bar sized by `processedRows / totalRows`; a link to
   `/admin/queues` on the API.
10. QueryClient provider at the layout level; styled loading (skeleton
    rows), empty ("no parts fit this vehicle with these filters — clear
    filters") and error states; styled 404 and error pages; favicon and
    page titles.
11. Finalize the design-token values from Phase 0 with AA contrast.
12. Smoke tests: `/parts` page component with a mocked `apiFetch`
    returning two hits (one `fits`, one `ask`) asserts the stage strip
    text and both badges; `/orders/[id]` with a mocked `placed` order
    asserts the confirm and send-again controls render.
13. Manual QA script executed and pasted into the PR: resolve a shared key
    → disambiguate → results show the strip → filter by axle → open a part
    → add two parts → place order → send again shows `200 replayed` → confirm
    → start an import of the 2,500-row file → progress reaches 100% →
    search still answers during it; keyboard-only pass over the picker,
    filters and order buttons.

**Out of scope:** auth, saved vehicles (Tier 2), any server-side cart,
any direct infrastructure access from the web app.

**Acceptance:** the manual QA script passes end to end against `npm run
dev`; Lighthouse a11y ≥ 95 on `/`, `/parts`, `/orders/[id]`; the network
tab shows only calls to `NEXT_PUBLIC_API_URL`.

**Phase review checklist:** zero business logic in components beyond
formatting (fit results and totals arrive from the API or the domain
package); filter state lives only in the URL (no `useState` mirroring
it); the idempotency key is generated once per cart and reused by "send
again" (assert in the store test); every fit badge has visible text.

**PR:** `feat(web): vehicle picker with disambiguation, staged results, part detail, cart, order replay and confirm, imports page`

---

## Phase 8 — Docs, ADR audit, numbers, v1 release

**Context for a fresh session:** the product is feature-complete for Tier 1
(Phases 0–7 merged). This phase ships the documentation as a first-class
deliverable and cuts v1. Mostly writing; code changes only if the docs pass
uncovers something small.

**Objective:** a stranger understands the project, its decisions, its
numbers and its process in ten minutes, from the repo alone.

**In scope**

1. `README.md` full version: what/why paragraph with the synthetic-data
   disclaimer; two screenshots (`docs/screenshots/stage-strip.png`,
   `docs/screenshots/order-replay.png`) with descriptive alt text; quick
   start; architecture section with a mermaid flowchart (browser →
   Next.js → HTTP → NestJS controllers → services → `packages/domain`;
   repositories → Postgres; search service → Elasticsearch alias; import
   and release processors → BullMQ/Redis; index builder → alias swap);
   a "numbers" table quoting `docs/numbers.md` (large-profile generation
   and seed time, index build time and document count, import throughput,
   largest fitments array); tech-choices table with ADR links; repo
   orientation tree; Tier 2/3 roadmap from PLAN.md.
2. `docs/decisions.md` audit: ADRs 1–13 present in Context / Decision /
   Consequences form, statuses set; add any decision made mid-build that
   lacks one (check PR descriptions for the word "decided").
3. `docs/ai-workflow.md` finalized: per-phase narrative from the
   incremental log — where AI output was wrong and how review/tests
   caught it, prompts that had to be reworded, an honest closing
   reflection.
4. `docs/api.md` verified against the implementation (every endpoint
   exercised via curl while reading).
5. `docs/numbers.md` re-run once on the final code so the README's numbers
   match the tagged commit; record machine specs alongside.
6. Housekeeping: LICENSE (MIT), repo description and topics, final
   Lighthouse numbers in the README.
7. **Name scrub:** grep the entire repo (including generated fixtures
   under `apps/api/test/fixtures`, `names.ts`, and commit messages via
   `git log -p`) against a private blocklist of real vehicle makers, parts
   brands, catalogue providers and retailers — the blocklist itself stays
   outside the repo. Expected result: zero hits. Also grep for the words
   "interview", "employer" and any company the author has applied to;
   expected zero.
8. Tag `v1.0.0`.

**Out of scope:** new features of any kind. If the docs pass reveals a
bug, file an issue; fix only if trivial (< 15 min) and note it in the PR.

**Acceptance:** PLAN.md §7 definition of done is satisfiable by a stranger
following only the README; every Tier 1 checkbox ticked.

**Phase review checklist:** click every link in every doc; run the README
quick start verbatim in a fresh clone; read ai-workflow.md asking "would I
believe this if a candidate showed it to me" and cut anything performative;
the numbers table cites the commit it was measured on.

**PR:** `docs: v1 documentation, ADR audit, numbers, name scrub, release`
