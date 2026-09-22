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
