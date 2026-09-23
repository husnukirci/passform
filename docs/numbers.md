# Measured numbers

Wall-clock figures for the `large` profile, measured locally and appended
phase by phase. Everything here is reproducible from a fresh clone with the
commands shown; the README quotes this file.

Machine: Apple M4 Pro, 24 GB, Postgres 16 in Docker (OrbStack, 12 CPUs,
12 GB allotted), default `postgresql.conf`. One run each; treat the figures
as ballpark, not benchmarks.

## Phase 2: generation and seeding

Dataset: `npm run data:generate -- --profile large`

| Output                    |       Rows | Size      |
| ------------------------- | ---------: | --------- |
| `variants.jsonl`          |     50,000 | 10 MB     |
| `parts.jsonl`             |  2,000,000 | 2.7 GB    |
| fitments (inside parts)   | 22,799,879 |           |
| `categories.json`         |         83 |           |
| `suppliers.json`          |          6 |           |
| **Generation wall-clock** |            | **9.3 s** |

Seeding: `npm run db:seed -- --from .data/large` (one transaction, `COPY`
with the indexes and foreign keys in place)

| Step               |       Rows |  Wall-clock |  Rows/s |
| ------------------ | ---------: | ----------: | ------: |
| categories         |         83 |       0.1 s |         |
| suppliers          |          6 |       0.0 s |         |
| `vehicle_variants` |     50,000 |       0.2 s | 250,000 |
| `parts`            |  2,000,000 |      26.0 s |  77,000 |
| `fitments`         | 22,799,879 |     310.3 s |  73,000 |
| **Total**          |            | **336.6 s** |         |

Database size after seeding: 2.9 GB (`fitments` 2.3 GB including its two
indexes, `parts` 589 MB, `vehicle_variants` 10 MB).

Notes:

- `parts.jsonl` is read twice, once for parts and once for fitments, so the
  foreign key from `fitments.part_id` always resolves. The second pass is
  cheap next to the COPY itself.
- The fitments step pays for two btree indexes and the foreign key checks
  on every row. Dropping the indexes for the load and rebuilding them after
  would be faster; not done, because seeding is a development convenience
  and the simple version is easier to read.
- Import files: `npm run data:generate-import -- --rows 500000 --from
.data/small` writes 500,000 rows (676 MB) in 3.3 s.

## Phase 3: index rebuild

Elasticsearch 8.19 in the same Docker, single node, 1 GB heap
(`ES_JAVA_OPTS=-Xms1g -Xmx1g`), one shard, no replicas, refreshes off during
the load. Command: `npm run index:rebuild` against the `large` database.

| Figure                                 |       Value |
| -------------------------------------- | ----------: |
| Documents (one per part)               |   2,000,000 |
| Nested fitment rows inside them        |  22,799,879 |
| Lucene documents (parts + nested rows) |  24,799,879 |
| Largest `fitments` array on one part   |          20 |
| Index size on disk                     |      1.6 GB |
| **Rebuild wall-clock, create to swap** | **124.8 s** |
| Parts indexed per second               |      16,000 |

Notes:

- Parts stream from Postgres in batches of 5,000 by keyset on `id`, with
  one fitments query per batch; documents go to Elasticsearch in bulk
  requests of 2,000. Nothing beyond one batch is held in memory.
- The time includes the refresh, the count verification against
  `select count(*) from parts` and the alias swap. The old index is deleted
  after the swap, so two copies exist for the length of a rebuild.
- The small profile (5,000 parts, 57,204 fitment rows) rebuilds in 0.6 s.

## Phase 5: import pipeline

The 500,000-row supplier file from Phase 2 (`.data/imports/s_01-500000.jsonl`,
676 MB, 70% of rows updating SKUs the `small` profile has and 30% new SKUs)
imported into the `small` seed through the queue: `POST /imports` with
`{ "supplierId": "s_01", "path": "imports/s_01-500000.jsonl" }` against the
built API running in one process, worker in-process with concurrency 4 and
a limiter of 4 chunk starts per second, Redis 7 in the same Docker.

| Figure                                             |                       Value |
| -------------------------------------------------- | --------------------------: |
| Rows in the file                                   |                     500,000 |
| Split into chunk files (`POST /imports` latency)   |                       1.3 s |
| Chunks of 1,000 rows                               |               500, all done |
| Rows rejected                                      |                           0 |
| **Import wall-clock, `startedAt` to `finishedAt`** |                 **125.5 s** |
| Rows per second                                    |                       3,980 |
| Parts after the import                             |                     155,000 |
| Fitment rows after the import                      |                   1,771,789 |
| Rebuild queued on completion, create to swap       |                      10.0 s |
| Rebuilt index: parts / Lucene documents / size     | 155,000 / 1,926,789 / 77 MB |
| `GET /search` polled every 200 ms during the run   |       166 requests, all 200 |

Notes:

- The observed rate sits on the limiter's ceiling of 4,000 rows per second,
  so the chunk transaction (1,000 upserts and about 3,500 fitment rows) is
  not the bound; it completes in well under a second. The throttle is a
  choice (ADR 8): an import must not starve the read path's connection
  pool, and 500,000 rows in two minutes is the intended shape, not a
  benchmark.
- The search poll ran from the 208,000-row mark to past the alias swap; an
  earlier copy of the loop had exited on a scripting error before the first
  request. Every response in the window was `200`.
- Postgres after the run: `fitments` 440 MB, `parts` 73 MB. The split
  reads the file once and writes 500 chunk files under
  `.data/imports/<importId>/`.
