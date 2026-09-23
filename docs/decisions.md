# Architecture decision records

Short-form Nygard entries: Context, Decision, Consequences. Numbered in the
order PLAN.md lists them; an entry is written in the same commit as the
choice it records.

## ADR 1: Separate NestJS API and thin Next.js client in one monorepo

**Context.** The backend is the deliverable: fit-constrained search, an
import pipeline, idempotent orders. A web client is still needed to make
that behaviour visible, and it should exercise the REST contract the way an
outside consumer would rather than share code paths with the server.

**Decision.** One npm-workspaces monorepo with `apps/api` (NestJS) and
`apps/web` (Next.js App Router) as separate applications. The web app talks
to the API over HTTP only, through a single client module, and has no
access to the database, Redis or Elasticsearch. Shared code is limited to
two framework-free packages: `packages/domain` (rules) and
`packages/contracts` (zod schemas for every request and response body).

**Consequences.** The API contract is tested for real by its own client,
and the client can be replaced without touching the backend. Two dev
servers and two build pipelines have to be kept green, and the root scripts
fan out over workspaces. Next.js server features that would let the web app
reach the database directly are deliberately unused.

## ADR 2: Drizzle in NestJS over TypeORM or Prisma

**Context.** The order transaction relies on a conditional stock update
(`UPDATE ... WHERE stock_qty >= qty`), the import pipeline relies on
per-chunk transactions and COPY-based seeding, and schema changes must be
reviewable artifacts. The ORM must make the SQL that runs visible and easy
to reason about.

**Decision.** Drizzle ORM with the `pg` driver. The schema is TypeScript,
migrations are generated into the repository and committed, and queries
that matter are written so the emitted SQL is obvious from the code.

**Consequences.** No decorator-based entities and no query-engine binary;
transactions, `FOR UPDATE`, conditional updates and raw SQL are first-class.
Drizzle has a smaller ecosystem than TypeORM or Prisma inside NestJS, so the
database module is hand-wired rather than provided by an integration
package.

## ADR 3: Domain core as a pure, isomorphic TypeScript package

**Context.** Fit evaluation, registration-key resolution, the search query
builder, order arithmetic and import validation are the rules the project
exists to demonstrate. They must be testable in milliseconds, readable
without knowing a framework, and reusable from the API, the queue
processors and the web app alike.

**Decision.** `packages/domain` is plain TypeScript with plain-data inputs
and outputs and no imports from Nest, Next, Drizzle, zod, BullMQ, the
Elasticsearch client or Node built-ins; ESLint enforces the ban. The search
query builder emits the Elasticsearch body as a plain object and is tested
with `toEqual` against the exact body, without Elasticsearch running.
Import rows are validated by hand-written checks that collect every error,
because zod is a framework concern and the domain must not depend on it.
Every behaviour is built strict red-green-refactor; the module is the
specification.

**Consequences.** The rules run identically in the API, in a worker and in
the browser, and the whole suite runs in well under a second. The package
must stay erasable TypeScript so Node's type stripping can load it (ADR
14). Validation without zod costs a small hand-rolled collector and a
duplicated shape between `ImportRow` here and the zod schema in
`packages/contracts` once Phase 4 adds it; a contracts test will pin the two together.

## ADR 4: Fitment is a filter, never a score

**Context.** A part that does not fit the vehicle must never appear in
results, however relevant its text or however good its price. Search
engines blur this by letting every clause contribute to the score, so a
strong text match can outrank a correct fitment.

**Decision.** `buildSearchQuery` places the fitment constraint in
`query.bool.filter` (a nested query over fitment rows, or `universal:
true`) and the ranking signals (`in_stock`, brand tier) in
`query.bool.should`. No fitment field ever appears in a scoring clause; a
unit test asserts it. Ranking operates only over parts that survived the
filter. The same rule holds outside Elasticsearch: `evaluateFit` returns a
verdict with a reason, never a number.

**Consequences.** Results are explainable: every hit carries a fit result
and reason, and the stage strip on the results page can show how many
parts the filter kept. Fuzzy fitment ("probably fits") is impossible by
design; the `ask` result is the only softness, and it is a verdict with a
named equipment code, not a lower score. Filter clauses are cached by
Elasticsearch, which also makes this the cheaper shape.

## ADR 5: Fitments as nested documents on the part

**Context.** A part fits several variants, each with its own optional
build window, axle and equipment restriction. Search must match one row's
variant and window together: a part that fits variant A from 2012-01 and
variant B from 2014-06 must not match a 2013 A-variant through B's window.
A flat array of fitment fields loses that pairing. Universal parts fit
every vehicle and carry no rows at all.

**Decision.** One document per part with `fitments` mapped as `nested`; the
domain query runs a `nested` filter over the rows and `or`s it with
`universal: true`. Build dates are `date` fields with format `yyyy-MM`, the
same strings the domain emits. `_source` excludes `fitments` from hits and
`inner_hits` carries only the rows that matched, which is what per-hit fit
evaluation needs. The `_id` is the part id; the body mirrors the mapping
field for field through one `partToDocument` function.

**Consequences.** Each fitment row is a hidden Lucene document, so the
physical index is roughly ten times larger than the part count (62,204
documents for 5,000 parts in the small profile) and a part with many
fitments makes a large document; the rebuild logs the largest array seen.
Nested queries are slower than flat term filters, accepted because they are
correct. Changing a fitment means reindexing its whole part, which is why
fitment changes take the rebuild path (ADR 11).

## ADR 6: Postgres is the source of truth; Elasticsearch is derived and rebuilt behind an alias

**Context.** Search needs an inverted index; orders and imports need
transactions. Keeping two stores in step by dual-writing invites drift with
no way to tell which side is right. An index rebuild that replaces documents
in place would also leave search answering from a half-written index.

**Decision.** Postgres holds every fact. Elasticsearch is a rebuildable
projection of it: `rebuildIndex` writes a new physical index
`parts_v<unix-ms>`, refreshes it, compares its document count with `select
count(*) from parts`, and only on a match moves the `parts` alias in one
atomic `updateAliases` call and deletes the previous index. On a mismatch it
deletes the new index and throws `IndexVerificationError` with both numbers;
the alias never moves. The API reads only the alias; physical names appear
in `alias.ts` and nowhere else.

**Consequences.** Search keeps answering from the previous index for the
whole rebuild, and a broken rebuild is invisible to readers. Two copies of
the index exist briefly, so disk is sized for that. The count check catches
lost or duplicated documents but not stale field values; a per-document
checksum is a possible follow-up. Anything the index needs (category path,
stock flag) is derived at build time from Postgres, so a schema change on
the Postgres side is a rebuild, never a migration of the index.

## ADR 7: Deterministic generator with size profiles; all names invented

**Context.** The project needs a catalogue large enough to make index
builds, imports and search behaviour measurable, but it must not carry real
vehicle, brand or company data, and every number in the README has to be
reproducible by anyone from a fresh clone. Checking a dataset into git is
out: the `large` profile is gigabytes.

**Decision.** `apps/api/scripts/generate.ts` synthesises the dataset from a
seeded mulberry32 PRNG (seed `0x5eed`) at two profiles, `small` (2,000
variants, 5,000 parts) for tests, CI and everyday development, and `large`
(50,000 variants, 2,000,000 parts, about 12 fitments per non-universal
part) for the demo and the measured numbers. Output is streamed line by
line; only the variants' build windows stay in memory while parts are
generated. Ids are readable and sequential (`v_000001`, `p_0000001`), so
the same profile is byte-identical across runs and a test asserts it. Every
make, model, brand and supplier is an invented compound kept in one file,
`apps/api/scripts/names.ts`, each checked against the web before use; the
category tree is fixed in `categories.ts`. Seeding streams the files into
Postgres with `COPY` inside one transaction, so a reseed either lands
completely or not at all.

**Consequences.** Any figure in the docs can be regenerated on a laptop in
seconds (`large` generates in about ten seconds and seeds in minutes), and
a bug report can name a part id that everyone can reproduce. The
distributions are stylised (20% shared registration keys, 30% unknown
equipment, 5% universal parts, 8% out of stock) rather than realistic, and
changing any rule or name changes every id after it, which is acceptable
because nothing outside the generated files refers to them. The name file
is the single place the name scrub has to audit.

## ADR 8: Chunked, idempotent import jobs on BullMQ with a dead-letter queue

**Context.** A supplier file has hundreds of thousands of rows and must be
imported while search keeps answering. One long job fails as a whole and
retries from the start; one job per row would put hundreds of thousands of
entries into Redis and pay a transaction each. Retries and worker restarts
must never write a row twice, and a bad row must not sink the file.

**Decision.** `POST /imports` splits the file into chunk files of 1,000
rows under `DATA_DIR/imports/<importId>/` and queues one `import.chunk` job
per chunk. The job's identity and its payload are the same thing,
`(importId, seq)`, with `jobId = "<importId>:<seq>"`. The processor loads
the chunk row and returns at once when it is `done`; otherwise it validates
every line with the domain rules, rejects rows that point at a category or
variant Postgres does not have, and in one transaction upserts the surviving
parts on `sku` (`ON CONFLICT DO UPDATE` on every mutable column, a new SKU
getting the deterministic id `p_<sku>`), replaces their fitments, adds to
the import's counters and marks the chunk `done`. Row problems are data:
they count in `failed_rows` and are reported on the chunk, and the chunk
still succeeds. A thrown error counts an attempt and is retried with
exponential backoff, five times; the last failure copies the job to
`import.chunk.dlq` with the error and the rejected rows attached and marks
the chunk `failed`. When every chunk is terminal the import becomes
`completed` or `partial` and exactly one `index.rebuild` job
(`jobId = "rebuild:<importId>"`) runs the Phase 3 rebuild. The worker runs
four chunks at a time with a limiter of four starts per second.

**Consequences.** Re-running any job is a no-op or an exact repeat: the
`done` short-circuit covers a retry after the commit, the transaction
covers a crash before it, and the derived part id covers a retry that
inserts. Resumption after a worker restart costs nothing because the jobs
are in Redis and the state is in Postgres. A partial import is a normal
outcome with counts, not an exception path. The dead-letter queue is read,
never worked: replaying a chunk means re-adding its identity. The limiter
bounds the write load an import puts on the shared connection pool and so
caps throughput at about 4,000 rows per second by design; the measured
figure is in `docs/numbers.md`. Two paths can notice an import finishing,
the queue events and the dead-letter handler, and both are safe because the
terminal status is written conditionally and the rebuild's job id dedupes.
The chunk files live on local disk, so the worker must share a filesystem
with the API: true of this local-first stack (ADR 12) and the first thing
to revisit before the two are deployed apart.

## ADR 11: Slow and fast index paths

**Context.** Catalogue and fitment changes arrive as supplier files and
touch many parts at once, and a fitment change reshapes a whole nested
document (ADR 5). Price and stock change constantly, one part at a time,
and are flat fields on the document.

**Decision.** Two paths. The slow path is the full rebuild of ADR 6: it is
the only way catalogue and fitment changes reach the index, and the import
pipeline triggers it once a file has been processed. The fast path is a
partial document update to the live alias for `price_cents` and `in_stock`
only; it never touches `fitments`. Tier 1 ships the slow path; the fast
path is a Tier 2 follow-up and until then price and stock changes also wait
for the next rebuild.

**Consequences.** Fitment correctness never depends on an incremental
update getting the nested array right. Search shows stale prices and stock
for the length of a rebuild until the fast path lands, which the order flow
tolerates because stock is reserved in Postgres, not in the index. The
rebuild's cost, measured in `docs/numbers.md`, bounds how often the slow
path can run.

## ADR 12: Local-first infrastructure; deployment deferred to Tier 3

**Context.** The project must run from a fresh clone and in CI with no
accounts, secrets or cloud costs, and CI must exercise the real Postgres,
Redis and Elasticsearch rather than mocks.

**Decision.** `docker-compose.yml` defines Postgres 16, Redis 7 and a
single-node Elasticsearch 8 with security disabled. Local development,
integration tests and CI all target these services; CI runs them as GitHub
Actions service containers with the same environment. Deployment,
infrastructure as code and managed services are Tier 3 in PLAN.md.

**Consequences.** Anyone can reproduce every number in the README on a
laptop. Elasticsearch with a 1 GB heap makes the compose stack heavier than
a typical local setup, and the CI integration job spends its first minute
waiting for it to become healthy. Nothing in the codebase depends on a
cloud service, which keeps a later deployment a packaging problem rather
than a rewrite.

## ADR 13: zod via nestjs-zod, with the schemas shared through `packages/contracts`

**Context.** The API validates every request and the web app types every
response. Two definitions of the same body, one per side, drift the moment
one of them changes, and the drift shows up as a runtime surprise in the
client rather than a failing build.

**Decision.** `packages/contracts` holds one zod schema per request and
response body, one file per resource, and exports the inferred type under
the same name. The API validates query parameters through
`ZodValidationPipe` on thin `createZodDto` classes that live next to the
controllers (nestjs-zod keys on the class), and serializes every response
through `ZodSerializerDto` with the response schema, so a handler that
returns something outside the contract fails at the API as a 500 rather
than at the client. A global `ErrorFilter` turns a failed parse, a
`DomainError` and Nest's HTTP exceptions into the one `ErrorResponse`
shape. The web app parses each response with the same schema
(`apps/web/src/lib/api.ts`).

**Consequences.** One definition, no drift, and the contract is readable
in one place. The domain stays zod-free (ADR 3), so the contracts mirror
its value types by hand (`FitDto`, `YearMonth`, `VehicleVariantDto`); the
mapping code in the API spreads domain values into contract types, which
is where the type checker catches a mismatch. `packages/contracts` depends
on zod alone; the DTO classes are the only nestjs-zod surface and hold no
logic.

## ADR 14: Workspace packages are consumed as TypeScript source

**Context.** `packages/domain` and `packages/contracts` are imported by
both apps. Publishing compiled output would add a build step before every
test run and a second copy of every type to keep in sync.

**Decision.** Each package's `exports` points at `src/index.ts`. Next.js
compiles them through `transpilePackages`; vitest compiles them through its
own transform; the built API runs them through Node 22's native type
stripping, which is why the packages contain only erasable TypeScript syntax
(no enums, no parameter properties, no decorators).

**Consequences.** No package build step and no stale `dist` to debug.
Node's type stripping is the load-bearing runtime feature, so the Node
version floor is 22.18 and the packages are restricted to plain
TypeScript. Root `tsc -b` still emits declarations, into gitignored
directories, only because project references require an emit.

_Amended in Phase 4._ Node strips types but does not rewrite specifiers,
so a `./types.js` import inside a package fails at runtime because no
`types.js` exists. Relative imports inside the packages therefore use the
`.ts` extension, and `rewriteRelativeImportExtensions` in
`tsconfig.base.json` lets TypeScript accept them and rewrite them in any
emitted output. This was found when the running API first imported the
domain package; the Phase 2 scripts had sidestepped it by running under
`tsx`.
