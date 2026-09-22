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
