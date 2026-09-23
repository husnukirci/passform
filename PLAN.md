# passform — build plan

A standalone portfolio project: a compatibility-driven parts catalogue and
ordering backend — search that filters on what fits a vehicle before it
ranks anything, an ingestion pipeline that imports supplier catalogues
without taking search down, and order creation that stays correct under
retries and races. NestJS + PostgreSQL (Drizzle) + Elasticsearch + BullMQ +
Redis, with a thin Next.js (App Router) client, all on docker-compose, with
GitHub Actions CI.

Scope is tiered so the project is releasable at every milestone: Tier 1 is a
complete, shippable v1; Tiers 2 and 3 are follow-ups, not prerequisites.

Design spec: `docs/superpowers/specs/2026-09-22-passform-design.md`.

---

## 1. Goal

1. A credible domain core (vehicle key resolution, fit evaluation with
   reasons, the constrain-then-rank search query builder, order arithmetic
   and idempotency rules, import validation and chunking) built strictly
   test-first, framework-free and isomorphic.
2. A real backend: Postgres schema and migrations, a deterministic synthetic
   generator with `small` and `large` profiles, an Elasticsearch index with
   nested fitments rebuilt behind an alias, a chunked idempotent import
   pipeline on BullMQ with a dead-letter queue, and idempotent order
   creation with conditional stock updates and expiry as compensation, all
   behind a documented REST contract.
3. A thin web client that makes the backend's behaviour visible: vehicle
   resolution with disambiguation, a results page with a stage strip and
   per-hit fit reasons, an order page that replays itself and gets one
   order back, an imports page that shows the pipeline running.
4. The engineering process as a first-class deliverable: tiered plan, ADRs,
   CLAUDE.md working agreement, documented AI workflow, CI running the real
   infrastructure, measured numbers in the README.

Non-goals: production readiness; real vehicle or parts data; payment;
authentication; any affiliation with or reference to real vehicle makers,
parts brands, catalogue providers or retailers. The dataset is synthetic and
illustrative, and the README says so.

## 2. Domain in one paragraph

A **vehicle variant** is one specific configuration of a car: invented make,
model, engine code, power in kW, fuel, a build window (`buildFrom`,
`buildTo`, `YYYY-MM`), a list of **equipment** codes, and a two-part
**registration key** (four-digit manufacturer key, three-character type key).
One key may resolve to several variants; that is normal and is handled by
asking the customer, never by guessing. A **part** has a SKU, an invented
brand with a **brand tier** (`oe`, `premium`, `standard`), a category in a
tree, an OE reference, attributes, a price in integer cents, stock, a
supplier, and may be **universal** (fits everything, no fitment rows). A
**fitment** links a part to a variant with optional **restrictions**: a
build window, an axle, an equipment code. **Fit evaluation** takes a variant
and a part's fitments and returns `fits`, `no`, or `ask` (the fitment needs
an equipment code the variant record does not carry), with a plain-language
reason. **Search** is two stages: fitment as an exact filter, then ranking
over the survivors. An **import** is a supplier file processed in idempotent
chunks that upsert parts and fitments, followed by an index rebuild swapped
in behind an alias. An **order** reserves stock with a conditional update,
is idempotent on a client-supplied key, and expires unless confirmed. All
rules are pure functions over plain data.

## 3. Tiers

### Tier 1 — v1 release

- [x] Scaffold: npm workspaces; `apps/api` (NestJS), `apps/web` (Next.js App
      Router), `packages/domain`, `packages/contracts`; TS strict; Tailwind v4
- [x] Tooling: ESLint (flat) + Prettier + vitest (with SWC for Nest
      decorators) + lint-staged/husky + commitlint
- [x] Infra: `docker-compose.yml` with Postgres 16, Redis 7, Elasticsearch 8
      (single node, security off); `.env.example`
- [x] CI: GH Actions — lint, typecheck, unit tests, integration tests against
      the compose services, build, on every push/PR
- [x] Domain core (`packages/domain`, pure TS, strict TDD, zero framework imports):
  - [x] types: `VehicleVariant`, `Part`, `Fitment`, `RegistrationKey`, `FitResult`, `ImportRow`
  - [x] `yearMonth`: validation, comparison, window containment
  - [x] `vehicleKey`: parse + normalise a registration key; resolve candidates; disambiguation labels
  - [x] `fit`: `evaluateFit` with the restriction order and exact reason strings
  - [x] `searchQuery`: `buildSearchQuery` emitting the Elasticsearch body (nested fitment filter, universal short-circuit, facets, boosts, sorts, paging)
  - [x] `orders`: line and order totals in cents, canonical JSON, idempotency key validation, reservation expiry
  - [x] `importRows`: row validation without zod, chunk range computation
- [x] DB: Drizzle schema + migrations (`vehicle_variants`, `categories`,
      `suppliers`, `parts`, `fitments`, `imports`, `import_chunks`, `orders`,
      `order_lines`, `stock_reservations`); deterministic generator with
      `small` and `large` profiles and supplier import-file output; COPY-based
      seeding; timings recorded
- [x] Elasticsearch: mapping with nested fitments; index builder from
      Postgres; alias strategy with count verification; `index:rebuild`
      command; timings recorded
- [x] Read API: `GET /vehicles/resolve`, `/vehicles/makes`,
      `/vehicles/models`, `/vehicles`, `/vehicles/:id`, `/categories`,
      `/search`, `/parts/:sku`; `packages/contracts` zod schemas; `docs/api.md`
- [x] Import pipeline: `import.chunk` and `index.rebuild` queues; file
      splitter; idempotent chunk processor with per-chunk transaction;
      retries with backoff, DLQ, concurrency limiter; progress; rebuild
      trigger; Bull Board at `/admin/queues`; `POST /imports`, `GET /imports/:id`
- [x] Orders: `POST /orders` with `Idempotency-Key`, stored-response replay,
      409 on payload mismatch, conditional stock update, reservations with
      15-minute expiry, `POST /orders/:id/confirm`, `GET /orders/:id`,
      `reservations.release` repeatable job; concurrency tests
- [x] Web: `/` vehicle picker + disambiguation, `/parts` results with stage
      strip and fit badges, `/parts/[sku]`, `/cart`, `/orders/[id]` with
      "send again" and "confirm", `/imports`
- [x] Docs: README (arch diagram, quick start, numbers, screenshots),
      `docs/decisions.md` (ADRs), `docs/api.md`, `CLAUDE.md`,
      `docs/ai-workflow.md`; name scrub; `v1.0.0` tag

### Tier 2 — follow-ups

Designed on 2026-09-23 as Phases 9–11 (`PHASES.md`; design note
`docs/superpowers/specs/2026-09-23-tier-2-design.md`), in build order:

- [x] Supplier price-and-stock partial-update endpoint exercising the fast
      index path (partial document updates, no rebuild); the stored stock
      subtracts open reservations so the release job cannot double-count
      (P9)
- [ ] Saved vehicles (cookie-backed list of ids, no auth; labels always
      from the API) (P10)
- [ ] DynamoDB append-only event log (search impressions, orders, returns)
      on `amazon/dynamodb-local`, orders that know their vehicle, a returns
      endpoint, and the return-rate feedback view that names parts whose
      fitment data to distrust (P11)

### Tier 3 — stretch

API Gateway with keys and rate limits in front of the read API,
infrastructure as code, AWS deployment, authentication. Listed so cuts are
deliberate and discussable, not accidental. Tiers 2 and 3 may never ship;
Tier 1 is complete without them.

## 4. Build order

Detailed, self-contained phase specs live in **PHASES.md**. Workflow: one
phase = one Claude Code session = one PR. Each session reads only CLAUDE.md,
PLAN.md, and its phase spec; implements; self-reviews against the phase and
global checklists; fixes findings; opens the PR and stops. The author merges,
then starts the next phase in a fresh session.

| Phase | Work                                                                                     | PR              |
| ----- | ---------------------------------------------------------------------------------------- | --------------- |
| P0    | Monorepo scaffold, tooling, docker-compose (PG, Redis, ES), CI with services             | chore(scaffold) |
| P1    | Domain core, strict TDD (types → yearMonth → vehicleKey → fit → searchQuery → orders → importRows) | feat(domain)    |
| P2    | Drizzle schema + migrations, deterministic generator (small/large + import files), COPY seeding | feat(schema)    |
| P3    | ES mapping (nested fitments), index builder, alias swap with verification, rebuild command | feat(index)     |
| P4    | Read API: vehicles, categories, search with per-hit fit, part detail; contracts; docs/api.md | feat(api)       |
| P5    | Import pipeline: queues, splitter, chunk processor, retries/DLQ/limiter, rebuild trigger, Bull Board | feat(import)    |
| P6    | Orders: idempotent transaction, conditional stock, reservations + release job, confirm; concurrency tests | feat(orders)    |
| P7    | Web: vehicle picker, results with stage strip, detail, cart, order replay/confirm, imports page | feat(web)       |
| P8    | Docs, ADR audit, ai-workflow finalize, README numbers + screenshots, name scrub, v1 tag  | docs            |
| P9    | Tier 2: supplier price-and-stock endpoint on the fast index path, reservation-aware stock | feat(stock)     |
| P10   | Tier 2: saved vehicles in a cookie, save toggle, one-click select on the home page       | feat(web)       |
| P11   | Tier 2: DynamoDB event log, orders with vehicle, returns endpoint, return-rate feedback   | feat(events)    |

Each phase lands green (unit + integration tests, typecheck, lint, build)
before the next starts.

## 5. TDD tiers

- **Strict (red-green-refactor, no exceptions):** `packages/domain/`.
- **Pragmatic (test after, happy path + one edge):** services and
  controllers with repositories stubbed; the web URL codec; the cart store.
- **Integration (test after, against docker-compose services):**
  repositories, BullMQ processors, the index builder and search service,
  the order transaction including its concurrency guarantees. Integration
  test files run sequentially and truncate their tables in `beforeEach`;
  Elasticsearch tests use a throwaway index per file.
- **Untested by design:** presentational components — one smoke test per
  page and manual QA. Written down here so it's a decision, not a gap.

## 6. ADRs to write (short-form Nygard)

1. Separate NestJS API and thin Next.js client in one monorepo — the
   backend is the deliverable; the web app is an outside consumer so the
   REST contract is exercised for real
2. Drizzle in NestJS over TypeORM or Prisma — SQL-transparent,
   schema-as-TS, migrations as committed artifacts
3. Domain core as a pure, isomorphic TS package — testability; the query
   builder tested without Elasticsearch
4. Fitment is a filter, never a score — filter context vs query context
5. Fitments as nested documents on the part; universal-parts short-circuit;
   `_source` excludes fitments, `inner_hits` carries the matched rows
6. Postgres is the source of truth; Elasticsearch is derived and rebuilt
   behind an alias with count verification
7. Deterministic generator with size profiles; all names invented
8. Chunked, idempotent import jobs on BullMQ with a dead-letter queue —
   `(importId, seq)` identity, per-chunk transaction, re-run is a no-op
9. Idempotency keys for order creation with stored-response replay —
   advisory lock per key, unique index as backstop
10. Stock reservation by conditional update; expiry as compensation —
    `UPDATE ... WHERE stock_qty >= qty`, no application locks
11. Slow/fast index path — rebuild for catalogue and fitment changes,
    partial update for price and stock (fast path built in Tier 2)
12. Local-first infrastructure; deployment deferred to Tier 3
13. zod via `nestjs-zod`; schemas shared through `packages/contracts`

## 7. Definition of done (Tier 1)

Fresh clone → `npm ci && docker compose up -d && npm run db:setup &&
npm run dev` works; CI green with the compose services; a visitor can enter
a registration key, be asked to disambiguate when it resolves to several
variants, see the stage strip and per-hit fit reasons, open a part, place an
order, replay it to get the same order back, and confirm it; a 500,000-row
generated supplier file imports to completion through the queue and swaps
the index while search keeps answering; every domain behaviour and every
concurrency guarantee has a test that fails when it is broken; the README
carries the `large` profile's generation, index build and import throughput
numbers and screenshots of the stage strip and the replayed order; docs read
in under ten minutes; the grep for real makes, brands, providers and
companies comes back empty.
