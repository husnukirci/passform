# passform — design spec

**Date:** 2026-09-22
**Status:** approved design, pre-implementation
**Type:** standalone portfolio project. The process is a deliverable: this repo
will be read by senior engineers as evidence of how its author works.

## 1. What and why

**passform** — a compatibility-driven parts catalogue and ordering backend:
search that filters on what fits a vehicle before it ranks anything, an
ingestion pipeline that imports supplier catalogues without taking search
down, and order creation that stays correct under retries and races.

A TypeScript monorepo: a NestJS API over PostgreSQL, Elasticsearch, BullMQ and
Redis, and a thin Next.js (App Router) client that talks to the API over HTTP
like any other consumer. Everything runs locally on docker-compose. Built with
the same documented process as the author's prior projects taktboard and
klimafolio: tiered plan, self-contained phases (one phase = one session = one
PR), strict-TDD domain core, ADRs, incremental AI-workflow log.

The backend is the deliverable. The web client exists to make the backend's
behaviour visible: the two search stages, the import running, one order where
a naive system would create two.

**Non-goals:** production readiness; real vehicle or parts data; payment;
authentication; any affiliation with or reference to real vehicle makers,
parts brands, catalogue providers or retailers. The README states openly that
the dataset is synthetic and illustrative.

**Hard rule:** no real vehicle makes, models, parts brands, catalogue
providers, retailers or companies appear anywhere in the repo: code, docs,
generator, fixtures, commits. Makes, models and brands are invented; the
README carries a "synthetic; any resemblance coincidental" note. Enforced by a
grep check in the final phase.

## 2. Domain in one paragraph

A **vehicle variant** is one specific configuration of a car: invented make,
model, engine code, power in kW, fuel, a build window (`build_from`,
`build_to`, month precision), a list of **equipment** codes, and a two-part
**registration key** (four-character manufacturer key, three-character type
key) of the kind a customer copies from a registration document. One key may
resolve to several variants; that is normal and is handled by asking the
customer, never by guessing. A **part** has a SKU, an invented brand with a
**brand tier** (`oe`, `premium`, `standard`), a category in a tree, an OE
reference, attributes (axle, dimensions), a price in integer cents, stock,
and a supplier. A **fitment** links a part to a variant with optional
**restrictions**: a build window, an axle, an equipment code. A part marked
**universal** fits every vehicle and has no fitment rows. **Fit evaluation**
takes a variant and a part's fitments and returns `fits`, `no`, or `ask`
(the fitment needs an equipment code the variant record does not carry), with
a plain-language reason. **Search** is two stages: fitment as an exact filter,
then ranking over the survivors. An **import** is a supplier file processed
in idempotent chunks that upsert parts and fitments, followed by an index
rebuild swapped in behind an alias. An **order** reserves stock with a
conditional update and is idempotent on a client-supplied key. All rules are
pure functions over plain data.

## 3. Fitment rules

- **Fitment is a constraint, never a score.** A part is in the result set only
  if it fits (or is `ask`); relevance operates only inside that set. In
  Elasticsearch terms: fitment lives in filter context, ranking in query
  context. No fitment signal ever contributes to a score (ADR).
- **Restriction evaluation, in order:** variant id must match; the vehicle's
  build date (`build_from`) must fall inside the fitment's window when one is
  set; the fitment's axle, when set, is a facet the customer chooses, not a
  vehicle property; the fitment's equipment code, when set, must be in the
  variant's equipment list. If the variant's equipment list is empty and the
  fitment requires a code, the result is `ask` with the code named. If the
  variant's equipment is known and does not contain the code, the result is
  `no`.
- **Universal parts** bypass fitment entirely and are always `fits`.
- **Ranking, inside the fitted set:** default sort is availability first
  (`in_stock` boost), then brand tier (`oe` > `premium` > `standard`), then
  price ascending. Explicit sorts: `price_asc`, `price_desc`. No text
  relevance in Tier 1 sort beyond the `q` match itself.
- **Every hit carries its fit result and reason.** The customer never sees a
  part without knowing why it is on the page.

## 4. Architecture

One monorepo (npm workspaces), TypeScript strict throughout
(`"strict": true`, `"noUncheckedIndexedAccess": true`). Node 22.

```
passform/
  apps/api            NestJS: vehicles, catalog, search, import, orders, infra
  apps/web            Next.js App Router, thin HTTP client of the API
  packages/domain     pure TS, zero framework imports, strict TDD
  packages/contracts  zod schemas + inferred types shared by api and web
  docker-compose.yml  postgres 16, redis 7, elasticsearch 8 (single node)
```

Four layers, hard boundaries:

1. **`packages/domain`** — pure TypeScript with zero imports from Nest,
   Next, Drizzle, zod, or any client library: vehicle key resolution and
   disambiguation rules; fit evaluation with reasons; the search query
   builder (vehicle + filters + sort → Elasticsearch query DSL as a plain
   object); order arithmetic in integer cents, idempotency key handling and
   payload hashing; import row validation and chunking. Strict TDD. The
   query builder is the constrain-then-rank design as a unit-tested artifact:
   it is tested without Elasticsearch running.
2. **`apps/api` infra + repositories** — Drizzle schema and migrations;
   repository classes over Postgres; Elasticsearch client, index builder,
   alias management; BullMQ queues and processors; Redis connection.
3. **`apps/api` services + controllers** — one service per module; controllers
   are thin: zod-parse (via `nestjs-zod`) → service → JSON. Processors are
   thin: load → domain → persist. No business logic in either.
4. **`apps/web`** — Server Components fetch the API over HTTP; client islands
   use TanStack Query for reads and mutations; the cart draft lives in a
   Zustand store persisted to `localStorage`; filters, sort, page and the
   selected variant live in the URL. There is no server-to-service shortcut:
   the web app is deliberately an outside consumer so the REST contract is
   exercised for real.

`packages/contracts` holds the zod schemas for every request and response
body. The API validates with them; the web app infers its types from them.
One definition, no drift (ADR).

## 5. Data model (PostgreSQL, source of truth)

- **`vehicle_variants`** — id, make, model, engine_code, kw (int), fuel,
  build_from (`YYYY-MM`), build_to (`YYYY-MM`, nullable), equipment
  (`text[]`), key_manufacturer (char 4), key_type (char 3). Index on
  (key_manufacturer, key_type), **not unique**: several variants may share a
  key.
- **`categories`** — id, slug (unique), name, parent_id (nullable). Depth at
  most 3.
- **`suppliers`** — id, name (invented).
- **`parts`** — id, sku (unique), brand, brand_tier (`oe | premium |
  standard`), category_id, name, oe_ref, attributes (jsonb: axle, dimensions),
  price_cents (int), stock_qty (int ≥ 0), supplier_id, universal (bool,
  default false). Universal parts have no fitment rows.
- **`fitments`** — id, part_id, variant_id, build_from (nullable),
  build_to (nullable), axle (`front | rear`, nullable), equipment_code
  (nullable). Several rows per (part, variant) are allowed; each row is one
  restriction set. Index on (variant_id), index on (part_id).
- **`imports`** — id, supplier_id, status (`queued | running | completed |
  partial | failed`), total_rows, processed_rows, failed_rows, chunk_size,
  started_at, finished_at, error (jsonb, nullable).
- **`import_chunks`** — (import_id, seq) PK, status (`pending | done |
  failed`), attempts, row_from, row_to, error (jsonb, nullable).
- **`orders`** — id, idempotency_key (unique), payload_hash (sha256 of the
  canonical, key-sorted JSON body), status (`placed | confirmed | expired`),
  total_cents, response (jsonb: the stored response body), created_at,
  confirmed_at (nullable).
- **`order_lines`** — (order_id, part_id) PK, qty (int ≥ 1), unit_cents.
- **`stock_reservations`** — id, order_id, part_id, qty, expires_at,
  released_at (nullable).

Money is integer cents end to end; formatting to EUR happens only in the web
app. No floats stored anywhere. Local dev and tests use the repo's
docker-compose Postgres; never a cloud database.

**Synthetic data.** A deterministic generator (seeded PRNG) with two
profiles: `small` (about 5,000 parts, 2,000 variants) for tests, CI and
everyday dev; `large` (2,000,000 parts, 50,000 variants, roughly 12 fitments
per non-universal part) for the demo and the numbers in the README. The
generator streams rows and never holds the large profile in memory. It also
emits supplier import files of a requested row count for the import pipeline.
Generation and index build times for `large` are measured in P2 and P3 and
recorded in the README. All makes, models, brands and supplier names are
invented compounds (ADR).

## 6. Elasticsearch (derived, rebuildable)

One physical index `parts_v{n}` behind the alias `parts`. The API only ever
reads the alias. One document per part:

```
sku, name, brand, brand_tier, category_path[], oe_ref,
attributes { axle, ... }, price_cents, in_stock (bool), universal (bool),
fitments: nested [ { variant_id, build_from, build_to, axle, equipment_code } ]
```

`fitments` is **nested**, not flattened: a part may fit variant A from
2012-01 and variant B from 2014-06, and a flat array would let a query for
variant A match B's window (ADR).

The query emitted by the domain builder for a resolved vehicle:

- **filter context** (no score): `bool.should` with `minimum_should_match: 1`
  of (a) `nested(fitments)` requiring `variant_id` term, build window contains
  the vehicle's `build_from` when the fitment has a window, `axle` term when
  the customer chose one, and — when the vehicle's equipment is known — a
  `must_not` on equipment codes it lacks; and (b) `universal: true`. Plus the
  ordinary facet filters (category path, brand) and the `q` match when
  present.
- **query context** (score, only among survivors): `in_stock` boost, brand
  tier boost, then `price_cents` sort. Explicit sorts replace the score sort.
  `q`, when present, is a `multi_match` over `name`, `sku`, `oe_ref` and
  `brand` in filter context: it narrows, it does not rank.

Per hit, the service runs domain fit evaluation on the returned nested
fitments to produce `fit: {result, reason}`, which is how `ask` reaches the
UI: unknown equipment labels, it never excludes.

**Slow/fast paths.** Catalogue and fitment changes rebuild into `parts_v{n+1}`
from Postgres, verify the document count against the source, swap the alias
atomically, and delete the old index. Price and stock changes are partial
updates to the live alias. If verification fails, the alias stays where it is
(ADR). Document size for universal-heavy suppliers is logged during rebuild.

## 7. REST contract (Tier 1)

- `GET /vehicles/resolve?manufacturer=&type=` → `{ variants: [...],
  needsDisambiguation: boolean }`. Zero, one or many. 400 on malformed key.
- `GET /vehicles/makes`, `GET /vehicles/models?make=`,
  `GET /vehicles?make=&model=` → the dropdown fallback, one level each.
- `GET /vehicles/:id`
- `GET /categories` → tree.
- `GET /search?variantId=&q=&category=&brand=&axle=&sort=&page=` → `{ hits:
  [{ ...part, fit: { result, reason } }], stages: { fitted, shown }, page,
  pageSize }`. Page size 24. `stages.fitted` is the filtered count before
  pagination; `stages.shown` is the page length.
- `GET /parts/:sku?variantId=` → detail with fit evaluation when a variant is
  given.
- `POST /imports` (multipart file, or `{ path }` for a generated file) →
  `{ importId }`, 202. `GET /imports/:id` → status and counts.
- `POST /orders` with header `Idempotency-Key` (required, UUID) → 201 with
  the order on first receipt; 200 with the **stored** response on a replay
  with the same payload hash; 409 when the same key arrives with a different
  payload; 409 naming the SKU when stock is insufficient; 400 without the
  header.
- `POST /orders/:id/confirm` → the payment stand-in: `placed` → `confirmed`,
  reservations become permanent. 409 if the order has already `expired`.
- `GET /orders/:id`
- Bull Board mounted at `/admin/queues`.

No auth in Tier 1: the API is local and the point is the behaviour, stated
as an ADR. The contract is documented field by field in `docs/api.md`.

## 8. UI (Tier 1)

- **`/` Vehicle** — two-field registration key entry; fallback make → model
  → variant dropdowns; a disambiguation card listing variants by engine, kW
  and build window when the key resolves to several. Selecting sets the
  variant in the URL and a cookie (`pf_variant`), sticky for the session.
- **`/parts`** — results for the selected vehicle: filter rail (category,
  brand, axle), sort, pagination, all URL-mapped. A **stage strip** above the
  list: "1,284 fit your vehicle → 24 shown, in stock first, then price". Each
  row carries the fit badge (`fits` green, `ask` amber with the code named)
  and its reason, the brand, price and availability.
- **`/parts/[sku]`** — detail with the fit evaluation for the selected
  vehicle, all fitment rows shown as data, add to cart.
- **`/cart`** — lines, totals, place order. The confirmation page shows the
  order id and a **"send again"** button that replays the identical request
  with the identical key, and the page states the response status it got
  back. One order, visibly. A **"confirm"** button stands in for payment; an
  unconfirmed order shows its expiry countdown.
- **`/imports`** — trigger an import from a generated file, poll progress,
  link to Bull Board. No hand-built job UI.

Design rules: Tailwind v4 utilities and tokens only; fit colour is never the
only signal (badge always carries the word and the reason); styled
loading/empty/error states; visible focus; `aria-live` on the stage strip.

## 9. Reliability

**Import pipeline.** Two BullMQ queues, because they fail differently:

- `import.chunk` — one job per chunk of 1,000 rows. Rows are validated by the
  domain module; the chunk's parts and fitments are upserted in one Postgres
  transaction; the chunk's outcome is written to `import_chunks`. **Idempotent
  by design**: a job carries `(importId, seq)`, and re-running a `done` chunk
  is a no-op, which is what makes retries and resumption safe. Exponential
  backoff, 5 attempts, then the job moves to a dead-letter queue with the
  failing rows attached and the chunk is `failed`. The import ends `partial`
  when any chunk failed, with counts; a partial import is a normal, visible
  outcome, not an exception path. A BullMQ limiter caps chunk concurrency at
  4 so a large file cannot starve the read path's connection pool. Progress is
  written per chunk and read by `GET /imports/:id`.
- `index.rebuild` — enqueued once when every chunk of an import is terminal.
  Builds `parts_v{n+1}`, verifies counts, swaps the alias, deletes the old
  index. Zero downtime is a consequence of the design.
- `reservations.release` — a repeatable job every minute that, for orders
  still `placed` past `expires_at`, marks the order `expired`, releases its
  reservations and restores stock. Confirmed orders are never touched.

**Order creation** runs one transaction:

1. Look up the idempotency key. Found with the same `payload_hash` → return
   the stored response, 200. Found with a different hash → 409. Not found →
   continue.
2. Insert the order and its key **in the same transaction**, so a crash
   between them cannot leave one without the other.
3. Reserve stock per line with `UPDATE parts SET stock_qty = stock_qty - :qty
   WHERE id = :id AND stock_qty >= :qty` and check the affected row count.
   Zero rows means a concurrent order took the stock; the transaction rolls
   back and the response is 409 naming the SKU. No `SELECT` then `UPDATE`, no
   application-level lock.
4. Write reservations with `expires_at = now() + 15 minutes`. The order is
   `placed`. Confirmation (`POST /orders/:id/confirm`) makes it `confirmed`
   and the reservations permanent. Expiry without confirmation is the
   compensation path for an abandoned checkout: a business-level failure
   mode, handled as data, not an infrastructure failure.

Concurrency guarantees are tested directly (see §10): two identical requests
in parallel produce one order; two requests for the last unit produce one
201 and one 409.

## 10. Process

Replicates the klimafolio method, with one added test tier.

- **CLAUDE.md** working agreement: one phase per session; TDD tiers
  non-negotiable; small conventional commits; ADR before load-bearing
  choices; incremental `docs/ai-workflow.md` friction log; the no-real-names
  rule. Tech invariants: domain in `packages/domain` with zero framework
  imports; no business logic in controllers or processors; Postgres is the
  source of truth and Elasticsearch is derived and rebuildable; every BullMQ
  processor is idempotent; money in integer cents; the API is the web app's
  only data source.
- **PLAN.md**: goal, domain paragraph, tiers, build order, TDD tiers, ADR
  list, definition of done.
- **PHASES.md**: nine self-contained phase specs with global + per-phase
  review checklists and pre-specified PR titles.

| Phase | Work                                                                                                                                              | PR              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P0    | Monorepo scaffold: workspaces, NestJS + Next skeletons, TS strict, docker-compose (Postgres, Redis, Elasticsearch), vitest, commitlint, GitHub Actions CI running the compose services | chore(scaffold) |
| P1    | Domain core, strict TDD: key resolution and disambiguation, fit evaluation with reasons, search query builder, order arithmetic and idempotency hashing, import row validation and chunking | feat(domain)    |
| P2    | Drizzle schema and migrations; deterministic generator with `small` and `large` profiles and import-file output; timings recorded                | feat(schema)    |
| P3    | Elasticsearch mapping with nested fitments, index builder from Postgres, alias strategy, rebuild command with count verification; timings recorded | feat(index)     |
| P4    | Read API: vehicles, categories, search (constrain-then-rank, per-hit fit), part detail; `packages/contracts`; `docs/api.md`                       | feat(api)       |
| P5    | Import pipeline: queues, chunk processor, retries and DLQ, limiter, progress, rebuild trigger, Bull Board                                          | feat(import)    |
| P6    | Orders: transaction, idempotency key and stored response, conditional stock update, reservations and release job; concurrency tests               | feat(orders)    |
| P7    | Web: vehicle picker and disambiguation, results with stage strip and fit badges, part detail, cart, order and "send again", imports page           | feat(web)       |
| P8    | Docs, ADR audit, ai-workflow finalize, README with numbers and screenshots, name scrub, v1 tag                                                     | docs            |

**TDD tiers:**

- **strict** (red-green-refactor) = `packages/domain`. Pure unit tests, no
  mocks.
- **pragmatic** (test after, happy path + one edge) = services and
  controllers, with repositories stubbed.
- **integration** (new; test after) = repositories, processors, the index
  builder and search service, the order transaction. Run against the real
  docker-compose Postgres, Redis and Elasticsearch; each test file gets a
  fresh schema, Elasticsearch tests use a throwaway index. The concurrency
  tests live here. CI runs the same compose services.
- **untested by design** = Next.js presentational components: one smoke test
  per page and manual QA, stated so it is a decision, not a gap.

**ADRs planned (13, Nygard format):**

1. Separate NestJS API and thin Next.js client in one monorepo (reverses
   klimafolio's monolith decision; the backend is the deliverable)
2. Drizzle in NestJS over TypeORM or Prisma
3. Domain core as a pure, isomorphic TS package
4. Fitment is a filter, never a score
5. Fitments as nested documents on the part; universal-parts short-circuit
6. Postgres is the source of truth; Elasticsearch is derived and rebuilt
   behind an alias with count verification
7. Deterministic generator with size profiles; all names invented
8. Chunked, idempotent import jobs on BullMQ with a dead-letter queue
9. Idempotency keys for order creation with stored-response replay
10. Stock reservation by conditional update; expiry as compensation
11. Slow/fast index path: rebuild for fitment, partial update for price and
    stock
12. Local-first infrastructure; deployment deferred to Tier 3
13. zod via `nestjs-zod`, schemas shared through `packages/contracts`

## 11. Tiers

- **Tier 1 (v1):** everything above.
- **Tier 2:** DynamoDB append-only event log (search impressions, orders,
  returns) via LocalStack, and the return-rate feedback view that names parts
  whose fitment data to distrust; supplier price-and-stock partial-update
  endpoint exercising the fast index path; saved vehicles.
- **Tier 3:** API Gateway with keys and rate limits in front of the read
  API; infrastructure as code; AWS deployment; authentication.

Tiers 2 and 3 are follow-ups, not prerequisites, and may never ship. Tier 1
is complete without them.

## 12. Definition of done (Tier 1)

Fresh clone runs with `npm ci`, `docker compose up -d`, `npm run db:setup`
(migrations + `small` seed + index build) and `npm run dev`; CI green on
every push and PR with the compose services running; a visitor can enter a
registration key, be asked to disambiguate when it resolves to several
variants, see the stage strip and per-hit fit reasons, open a part, place an
order, replay it to get the same order back, and confirm it; a 500,000-row generated
supplier file imports to completion through the queue and swaps the index
while search keeps answering; every domain behaviour and every concurrency
guarantee has a test that fails when it is broken; the README carries the
`large` profile's generation, index build and import throughput numbers and
screenshots of the stage strip and the replayed order; docs read in under
ten minutes; the grep for real makes, brands, providers and companies comes
back empty.
