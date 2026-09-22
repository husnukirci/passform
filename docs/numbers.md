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
