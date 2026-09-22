# passform

A compatibility-driven parts catalogue and ordering backend: search that
filters on what fits a vehicle before it ranks anything, an ingestion
pipeline that imports supplier catalogues without taking search down, and
order creation that stays correct under retries and races. NestJS +
PostgreSQL + Elasticsearch + BullMQ + Redis, with a thin Next.js client.

All data is synthetic. Every vehicle make, model, parts brand and supplier
is invented; any resemblance to a real one is coincidental.

## Quick start

Requires Node 22.18 or later and Docker.

```sh
git clone <this repository> passform && cd passform
npm ci
cp .env.example .env
docker compose up -d
npm run db:setup
npm run dev
```

`db:setup` applies the migrations, generates the `small` synthetic profile
(2,000 vehicle variants, 5,000 parts) into `.data/small`, seeds Postgres
from it and builds the Elasticsearch `parts` alias from the seeded rows. The
`large` profile (50,000 variants, 2,000,000 parts) is for the numbers in
[docs/numbers.md](docs/numbers.md):

```sh
npm run data:generate -- --profile large
npm run db:seed -- --from .data/large
npm run index:rebuild
```

The web app is at `http://localhost:3000` and the API at
`http://localhost:4000`. The default page reports `api: ok` once both are up.

## Scripts

| Script                         | What it does                                                 |
| ------------------------------ | ------------------------------------------------------------ |
| `npm run dev`                  | API and web app together, with the root `.env` loaded        |
| `npm run lint`                 | ESLint over every workspace                                  |
| `npm run typecheck`            | `tsc -b` over the project references                         |
| `npm test`                     | Unit tests in every workspace                                |
| `npm run test:integration`     | API integration tests against the docker-compose services    |
| `npm run build`                | Builds every workspace                                       |
| `npm run db:migrate`           | Applies the committed Drizzle migrations                     |
| `npm run data:generate`        | Generates a dataset (`--profile small\|large`, `--out DIR`)  |
| `npm run data:generate-import` | Writes a supplier import file (`--rows N --supplier s_01`)   |
| `npm run db:seed`              | Seeds the catalogue from a dataset directory (`--from DIR`)  |
| `npm run index:rebuild`        | Rebuilds the `parts` index from Postgres and swaps the alias |
| `npm run db:setup`             | migrate → generate small → seed → index rebuild              |

## Plan

The build is tiered and phased so the project is releasable at every
milestone. See [PLAN.md](PLAN.md) for the tiers and [PHASES.md](PHASES.md)
for the per-phase specs. Decisions are recorded in
[docs/decisions.md](docs/decisions.md) and the AI-assisted workflow in
[docs/ai-workflow.md](docs/ai-workflow.md).
