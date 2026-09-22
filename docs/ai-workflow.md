# AI workflow log

How this project is built with Claude Code, and where that went wrong.
One line per friction event, appended as it happens and never
reconstructed after the fact. The working agreement is in `CLAUDE.md`.

Format: `- <phase> | <what happened> | <what changed as a result>`.

## Friction log

- P0 | Phase spec named the latest Nest CLI; its template is Nest 12, which `nestjs-zod` does not yet accept as a peer. | Pinned `@nestjs/*` to 11 and wrote the app files by hand instead of moving the template.
- P0 | Phase spec's API dependency list omitted `reflect-metadata` and `rxjs`, both required peers of Nest. | Added them; noted so later specs list peers.
- P0 | `npm install` crashed with `Cannot read properties of null (reading 'edgesOut')`. Isolated to vitest 4.1 plus npm 10.9's peer resolver with a one-package experiment. | Moved to vitest 5.
- P0 | Phase spec assumed `unplugin-swc` was needed for decorator metadata under vitest. A throwaway constructor-injection test passed without it on vitest 5. | Dropped the plugin and the native `@swc/core` binary; recorded the experiment in the vitest config comment.
- P0 | First lint run flagged the empty `AppModule` class under `no-extraneous-class`, a rule that does not know Nest modules exist for their decorator. | Rule set to `allowWithDecorator` for `apps/api`.
- P0 | Spec said "root `.env`", but neither Nest nor Next reads one from the repo root. | Root `dev` script wraps `concurrently` in `dotenv-cli`; each app still falls back to the documented defaults when run alone.
- P0 | The default page fetches `/health` in a Server Component; a first draft would have been prerendered at `next build` and failed whenever the API was down. | Marked the page `force-dynamic` and render an explicit unreachable state instead of throwing.
- P0 | First `git status` after the typecheck showed `.tsout/` and `next-env.d.ts` untracked. Project references need an emit even for a pure typecheck. | Emit declarations to a gitignored `.tsout/`; documented in ADR 14.
- P0 | First CI run failed in the integration job: the "verify services" step called `redis-cli`, which the runner image does not ship. The spec only asked for `pg_isready` and a curl; the Redis check was an unverified addition. | Replaced with a raw `PING` over bash's `/dev/tcp`, tested locally against the compose Redis first.
- P1 | Spec typed `SearchBody.query` as `unknown`; the test that proves no fitment field reaches the scoring clauses needed to reach inside it. | Kept the public type opaque as specified and narrowed once in the test with a comment saying why.
- P1 | First green `validateImportRow` ended in an eleven-way `undefined` check to satisfy strict types without zod. | Refactored to a `Problems` collector that returns a typed fallback so the row is one literal; suite stayed green through the refactor.
- P1 | Spec's `chunkRanges(totalRows, chunkSize?)` had no rule for `chunkSize < 1`, which would loop forever. | Added a failing test and a `DomainError` guard for the size and for negative or fractional row counts.
- P1 | Test fixtures were first written with a make and a brand that turned out to sit close to real company names. | Renamed both to clearly synthetic compounds before commit and rechecked with grep.
- P2 | A probe before writing any script showed Node's type stripping cannot resolve the domain package's `./types.js` specifiers, so the runtime path ADR 14 describes does not work for scripts that import the domain. | Scripts run through `tsx`; the built API's own runtime import of the domain is left to Phase 4, the first phase whose running app needs it.
- P2 | Model names were first drafted as dictionary words, first names and place names; the web check found 25 of 72 collided with real vehicle models or marques, while all 12 invented-compound makes were clean. | Every model is now an invented compound like the makes; the brand check likewise replaced 14 of 46 brand and supplier names.
- P2 | Two verification subagents exhausted the session's web search budget before the last 19 replacement names were checked. | Checked them against Wikipedia's search API from the shell, with a known real model name as the control that had to return hits.
- P2 | Drizzle's insert types carry `| undefined` on optional columns, so `Required<>` did not make the mapper output explicit and the round-trip test would not typecheck. | Added an `Explicit<T>` mapped type in `mappers.ts` that strips both the `?` and the `undefined`.
- P2 | First `large` seed failed with ENOENT: `npm run -w apps/api` runs scripts from the workspace directory, so `--from .data/large` typed at the repo root pointed at the wrong place. | CLI paths resolve against npm's `INIT_CWD`; the default data directory resolves against the repo root from the script's own location.
- P2 | The root `test:integration` script did not load `.env`, unlike `dev`, so the new database-backed test failed with `DATABASE_URL is not set`. | Wrapped it in `dotenv-cli`; verified `db:migrate` still works with no `.env` present, as in CI.
- P2 | Constraint tests asserted on the error message, but Drizzle wraps the pg error as `cause` and its own message is the failed query. | Assert on `cause.constraint` instead, which names the constraint exactly.
- P2 | Sampling the first seeded rows showed fitment windows on open-ended variants running to 2033. | Capped the placement window at the dataset's last month; the small profile shows zero windows past it.
- P2 | The distribution check found a part with three fitments: a duplicate variant draw was skipped instead of redrawn. | Redraw until the target count is met, with a cap; min is now four as specified.
