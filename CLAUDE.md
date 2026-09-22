# CLAUDE.md — working agreement for passform

You are pair-building a standalone portfolio project. The process is a
deliverable: this repo will be read by senior engineers as evidence of how
its author works. Optimize for legibility over cleverness.

## Ground rules

1. **Follow PLAN.md and PHASES.md.** One phase per session: read CLAUDE.md,
   PLAN.md, and the current phase spec only. Work the phase's "In scope"
   list in order, self-review against its checklists, fix findings, open the
   phase's PR, and stop. Never start the next phase in the same session.
   Never silently expand scope; propose Tier 2/3 items, don't build them.
2. **TDD tiers are non-negotiable.** Everything in `packages/domain/` is
   strict red-green-refactor: write the failing test first, show it fail,
   make it pass, refactor. Services and controllers get unit tests after
   (happy path + one edge, repositories stubbed). Repositories, processors,
   the index builder, the search service and the order transaction get
   integration tests after, against the docker-compose services. Web
   presentational components are covered by one smoke test per page and
   manual QA.
3. **Small conventional commits.** One logical change per commit,
   `type(scope): subject` (commitlint style). The git history is an artifact.
4. **ADR before load-bearing choice.** Any decision that would be expensive
   to reverse gets a short entry in `docs/decisions.md` (Nygard format:
   Context / Decision / Consequences) in the same commit.
5. **Log AI friction.** When a suggestion is wrong, when tests catch a
   generated bug, when a prompt had to be reworded — append one line to
   `docs/ai-workflow.md`. Written incrementally, never reconstructed.
6. **No real vehicle makes, models, parts brands, catalogue providers,
   retailers or companies, anywhere.** Not in code, generator, fixtures,
   docs, comments, or commit messages. Every make, model, brand and supplier
   is an invented compound, and the README carries a "synthetic; any
   resemblance coincidental" note. The parts market is described
   generically. Never describe this project as related to any employer.

## Tech invariants

- Monorepo with npm workspaces: `apps/api` (NestJS), `apps/web` (Next.js
  App Router), `packages/domain`, `packages/contracts`. Node 22.
  TypeScript strict everywhere (`"strict": true`,
  `"noUncheckedIndexedAccess": true`). No `any`, no non-null assertions
  without a comment.
- Business logic lives in `packages/domain/` as pure TS with **zero imports
  from Nest, Next, Drizzle, zod, BullMQ, the Elasticsearch client, or Node
  built-ins**. Inputs and outputs are plain data. The search query builder
  emits the Elasticsearch body as a plain object and is tested without
  Elasticsearch running.
- Controllers stay thin: zod-parse (via `nestjs-zod`) → service → JSON.
  Processors stay thin: load → domain → persist. No business logic in
  either.
- `packages/contracts` holds the zod schemas for every request and response
  body. The API validates with them; the web app infers types from them.
  One definition, no drift.
- Postgres (via Drizzle) is the source of truth. Elasticsearch is a derived,
  rebuildable index read only through the `parts` alias; a rebuild that
  fails count verification never moves the alias. Schema and migrations are
  committed artifacts.
- Every BullMQ processor is idempotent: re-running a completed job is a
  no-op. Job payloads carry identities, never data that could go stale.
- Money is integer cents end to end (`priceCents`, `unitCents`,
  `totalCents`). Formatting to EUR happens only in `apps/web`. No floats
  stored in the DB. Build dates are `YYYY-MM` strings.
- The web app talks to the API over HTTP only, through `apps/web/src/lib/api.ts`.
  No database, Redis or Elasticsearch access from `apps/web`. No
  server-to-service shortcut.
- State split in the web app is fixed: TanStack Query owns server state, the
  Zustand cart store owns the cart draft (persisted to `localStorage`), the
  URL owns the selected variant, filters, sort and page.
- Local dev, tests and CI use the repo's docker-compose Postgres, Redis and
  Elasticsearch; never a cloud service.
- Styling: Tailwind v4 utilities + design tokens only. No component CSS
  files, no inline style objects except computed geometry.
- Colour is never the only signal: every fit badge carries the word and
  its reason; every job status carries text.

## Definition of done for any task

Tests pass (unit and integration), typecheck passes, lint passes,
`npm run build` succeeds, the relevant PLAN.md checkbox can honestly be
ticked, and — if the change is user-visible or touches a queue — it works in
the running dev stack against the local docker-compose services, verified
before moving on.
