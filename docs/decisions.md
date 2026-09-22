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
