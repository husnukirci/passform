# Measured numbers

Wall-clock figures for the `large` profile and the 500,000-row import,
re-measured once on the final code for v1.0.0 (commit `1e69c59`, the last
code change before the release; the commits after it touch documentation
only). Everything here is reproducible from a fresh clone with the commands
shown; the README quotes this file. One run each: treat the figures as
ballpark, not benchmarks.

Machine: Apple M4 Pro (12 cores), 24 GB, macOS 26.2, Node 22.22.0. Docker
via OrbStack 29.4 with 12 CPUs and 12 GB allotted, running the repo's
compose services: Postgres 16 with the default `postgresql.conf`, Redis 7,
Elasticsearch 8.19 single node with a 1 GB heap (`-Xms1g -Xmx1g`). The
Phase 2, 3 and 5 sessions measured the same things on the same machine
while the code was being built; those earlier figures were within a few
percent of the ones below and have been replaced.

## Generation

`npm run data:generate -- --profile large`

| Output                    |       Rows | Size      |
| ------------------------- | ---------: | --------- |
| `variants.jsonl`          |     50,000 | 10 MB     |
| `parts.jsonl`             |  2,000,000 | 2.7 GB    |
| fitments (inside parts)   | 22,799,879 |           |
| `categories.json`         |         83 |           |
| `suppliers.json`          |          6 |           |
| **Generation wall-clock** |            | **9.7 s** |

Byte-identical across runs (seeded PRNG, ADR 7); a unit test asserts it on
the small profile. The supplier import file,
`npm run data:generate-import -- --rows 500000 --from .data/small`, writes
500,000 rows (676 MB; 350,000 updates to existing SKUs, 150,000 new) in
3.8 s.

## Seeding

`npm run db:seed -- --from .data/large` (one transaction, `COPY` with the
indexes and foreign keys in place)

| Step               |       Rows |  Wall-clock |  Rows/s |
| ------------------ | ---------: | ----------: | ------: |
| categories         |         83 |       0.1 s |         |
| suppliers          |          6 |       0.0 s |         |
| `vehicle_variants` |     50,000 |       0.2 s | 250,000 |
| `parts`            |  2,000,000 |      24.9 s |  80,000 |
| `fitments`         | 22,799,879 |     320.2 s |  71,000 |
| **Total**          |            | **345.5 s** |         |

Database size after seeding: 2.9 GB (`fitments` 2.3 GB including its two
indexes, `parts` 589 MB, `vehicle_variants` 10 MB). The small profile seeds
in 0.7 s.

Notes:

- `parts.jsonl` is read twice, once for parts and once for fitments, so the
  foreign key from `fitments.part_id` always resolves. The second pass is
  cheap next to the COPY itself.
- The fitments step pays for two btree indexes and the foreign key checks
  on every row. Dropping the indexes for the load and rebuilding them after
  would be faster; not done, because seeding is a development convenience
  and the simple version is easier to read.

## Index rebuild

`npm run index:rebuild` against the `large` database: one shard, no
replicas, refreshes off during the load, then refresh, count verification
against `select count(*) from parts`, alias swap, old index deleted (ADR 6).

| Figure                                 |       Value |
| -------------------------------------- | ----------: |
| Documents (one per part)               |   2,000,000 |
| Nested fitment rows inside them        |  22,799,879 |
| Lucene documents (parts + nested rows) |  24,799,879 |
| Largest `fitments` array on one part   |          20 |
| Index size on disk                     |      1.3 GB |
| **Rebuild wall-clock, create to swap** | **124.0 s** |
| Parts indexed per second               |      16,100 |

Notes:

- Parts stream from Postgres in batches of 5,000 by keyset on `id`, with
  one fitments query per batch; documents go to Elasticsearch in bulk
  requests of 2,000. Nothing beyond one batch is held in memory.
- Two copies of the index exist for the length of a rebuild, so disk is
  sized for that. The small profile (5,000 parts, 57,204 fitment rows)
  rebuilds in 0.6 s.

## Import throughput

The 500,000-row supplier file imported into a fresh `small` seed through
the queue: `POST /imports` with
`{ "supplierId": "s_01", "path": "imports/s_01-500000.jsonl" }` against the
built API (`node apps/api/dist/main.js`) in one process, worker in-process
with concurrency 4 and a limiter of 4 chunk starts per second (ADR 8). A
shell loop requested `GET /search?variantId=v_000001&sort=price_asc` every
200 ms from before the `POST` until after the alias swap, and was checked
to be alive before the import started.

| Figure                                             |                       Value |
| -------------------------------------------------- | --------------------------: |
| Rows in the file                                   |                     500,000 |
| Split into chunk files (`POST /imports` latency)   |                      0.95 s |
| Chunks of 1,000 rows                               |               500, all done |
| Rows rejected                                      |                           0 |
| **Import wall-clock, `startedAt` to `finishedAt`** |                 **125.2 s** |
| Rows per second                                    |                       3,995 |
| Parts after the import                             |                     155,000 |
| Fitment rows after the import                      |                   1,771,789 |
| Rebuild queued on completion, create to swap       |                      10.1 s |
| Alias swapped, measured from the `POST`            |                       138 s |
| Rebuilt index: parts / Lucene documents / size     | 155,000 / 1,926,789 / 77 MB |
| `GET /search` polled every 200 ms throughout       |       328 requests, all 200 |

Notes:

- The observed rate sits on the limiter's ceiling of 4,000 rows per second,
  so the chunk transaction (1,000 upserts and about 3,500 fitment rows) is
  not the bound; it completes in well under a second. The throttle is a
  choice: an import must not starve the read path's connection pool, and
  500,000 rows in about two minutes is the intended shape, not a benchmark.
- Postgres after the run: `fitments` 468 MB, `parts` 69 MB. The split
  reads the file once and writes 500 chunk files under
  `.data/imports/<importId>/`.

## Lighthouse

Production build (`next build` + `next start`) against the small profile,
Lighthouse 12 in headless Chrome with its default mobile emulation, one
run per page.

| Page                             | Performance | Accessibility | Best practices | SEO |
| -------------------------------- | ----------: | ------------: | -------------: | --: |
| `/` (vehicle picker)             |          97 |           100 |            100 | 100 |
| `/parts?variant=v_000003`        |          96 |           100 |            100 | 100 |
| `/parts/HES-0002453?variant=...` |          96 |           100 |            100 | 100 |
| `/orders/<id>`                   |          98 |           100 |            100 | 100 |
