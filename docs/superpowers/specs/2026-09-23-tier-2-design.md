# passform — Tier 2 design note

**Date:** 2026-09-23
**Status:** approved design, pre-implementation
**Extends:** `2026-09-22-passform-design.md`, section 11 (Tiers). Tier 1
shipped as `v1.0.0`; this note designs the three Tier 2 follow-ups as
Phases 9–11 of `PHASES.md`. It is the tie-breaker when a Tier 2 phase spec
is ambiguous. Everything in the Tier 1 spec still holds unless amended here.

## 1. Why these three, in this order

Tier 2 exists to answer three questions a reader of v1 is left with:

1. ADR 11 promised a fast index path for price and stock and shipped only
   the slow one. **Phase 9** delivers the fast path through a supplier
   endpoint and measures it against a rebuild.
2. The web client forgets every vehicle except the current one. **Phase
   10** adds a saved list, the smallest useful piece of state that is
   neither server state nor the URL, and says where it lives.
3. Nothing in v1 feeds back into fitment quality. **Phase 11** adds an
   append-only event log on DynamoDB and a return-rate view that names the
   parts whose fitment data to distrust, which is the reason the log exists.

Ordered by size and by dependency: Phase 11 needs orders to know their
vehicle, which touches the same contract Phase 9 leaves alone; Phase 10 is
web-only and can slot anywhere. Each phase is its own session and PR, as
before. Tier 2 remains optional: v1 is complete without it.

## 2. Phase 9 — supplier price-and-stock fast path

**Endpoint.** `PATCH /suppliers/:id/stock` with
`{ rows: [{ sku, priceCents?, stockQty? }] }`: 1–1,000 rows, unique SKUs,
each row carrying at least one of the two fields. Unknown supplier → 404.
SKUs that do not exist or belong to another supplier are reported in
`unknown`, not rejected as a batch. Response
`{ updated: number, unknown: string[], indexed: boolean }`, always `200`
once Postgres has committed.

**Domain rule (strict TDD).** A supplier reports what is on its shelf. Open
reservations on `placed` orders have already been subtracted from
`stock_qty`, and the release job will add them back if the order expires.
Storing the reported number as-is would count those units twice. The stored
value is therefore `availableStock(reported, openReservedUnits) =
max(0, reported − openReservedUnits)`, a pure function in
`packages/domain`. Confirmed orders never give stock back, so they do not
adjust anything.

**Repository.** One transaction: `SELECT ... FOR UPDATE` on the matching
parts rows so the update serialises against the order transaction (which
locks the same rows), a sum of open reservation units per part, the domain
rule in TypeScript, and one `UPDATE parts SET price_cents = $price,
stock_qty = $stock` per row with unchanged values passed back explicitly,
so the decision of what changes is unit-testable rather than buried in
SQL. Returns the ids and new values.

**Index.** One `_bulk` of partial `update` operations against the alias with
`doc: { price_cents, in_stock }`. Never touches `fitments`. `in_stock` is
derived through the existing `partToDocument` rule (`stockQty > 0`), not a
second copy of it. A bulk failure is logged and reported as
`indexed: false`; the rows stay correct in Postgres, a retry is safe because
the values are absolute, and the next rebuild repairs the index anyway.
This amends ADR 11: the fast path is the request's second step, not a queue.

**Not a queue.** The import pipeline queues because a file is large and slow;
a stock delta is small and fast, and the caller wants to know it landed.
Adding a processor, a job status and a page would be ceremony.

**Measured.** `docs/numbers.md` gains "Fast path": 1,000 rows through the
endpoint, wall-clock, next to the rebuild time it replaces.

## 3. Phase 10 — saved vehicles

**Storage.** Cookie `pf_saved`, a JSON array of at most 10 variant ids,
most recent first. Ids only: labels always come from `GET /vehicles/:id`,
so nothing in the cookie can go stale, and an id the API no longer knows
is dropped at render.

**Codec.** `apps/web/src/lib/savedVehicles.ts`: `parseSaved(raw)`,
`serializeSaved(ids)`, `addSaved(ids, id)` (moves an existing id to the
front, caps at 10), `removeSaved(ids, id)`. Junk input parses to `[]`.
Pragmatic tests.

**Actions.** `saveVehicle(id)` and `forgetVehicle(id)` next to the existing
`selectVehicle`, mutating the cookie and revalidating the current path.

**UI.** The vehicle bar gains a toggle whose text is "save this vehicle" or
"saved" (never an icon alone). The home page renders the saved list above
the picker: one button per vehicle carrying the domain label, using the
existing `selectVehicle` action, and a "remove" control. Empty list → no
section.

**State split, amended (ADR 15).** The web app's state homes become four:
TanStack Query for server state, Zustand for the cart draft, the URL for the
selected vehicle and filters, and the `pf_saved` cookie for the saved list.
The cookie is the right home because a server component needs the list at
render time and it must survive across tabs; it never selects a vehicle on
its own, the URL still does.

## 4. Phase 11 — append-only event log and return-rate feedback

**Orders learn their vehicle.** `CreateOrderBody.variantId` becomes an
optional field, stored in a new nullable `orders.variant_id` column and
echoed in `OrderResponse`. The cart already knows the vehicle. Old clients
and stored replay responses are unaffected; the payload hash covers the
field like any other.

**Returns.** `POST /orders/:id/returns` with `{ partId, qty, reason }`,
`reason ∈ { did_not_fit, damaged, other }`. Rules, in the domain
(`validateReturn`): the order must be `confirmed` (409 otherwise), the part
must be on the order (400), `qty` must be `1..line.qty` (400). One return
per order line: the return's event id is derived from `orderId` and
`partId`, so a second report of the same line is a 409 from the
conditional put, not from a lookup. Stock is not restored: reverse
logistics are out of scope, and a `did_not_fit` part should not go back on
the shelf anyway. Response `201 { id, orderId, partId, qty, reason,
variantId, recordedAt }`.

**Event log.** DynamoDB, one table, `pk` + `sk` strings. The local store is
`amazon/dynamodb-local`, chosen over LocalStack because it is the
single-purpose image, boots in seconds in CI, and supports transactions and
global secondary indexes; PLAN.md said LocalStack and is amended.

| Item              | `pk`                     | `sk`                 | Attributes                                                   |
| ----------------- | ------------------------ | -------------------- | ------------------------------------------------------------ |
| event             | `event#<type>`           | `<ISO ts>#<eventId>` | `type`, `payload` (map), `recordedAt`                        |
| part counters     | `part#<partId>`          | `counters`           | `confirmedUnits`, `didNotFitUnits`, `gsi1pk = "counters"`, `gsi1sk = <partId>` |
| part × variant    | `part#<partId>`          | `variant#<variantId>`| `confirmedUnits`, `didNotFitUnits`                           |

Types: `search.impression` (variantId, q, category, page, partIds,
fitted), `order.placed`, `order.confirmed` (orderId, variantId, lines),
`return.reported` (orderId, partId, qty, reason, variantId). Every event
put carries `ConditionExpression: attribute_not_exists(pk)`, so re-emitting
an event is a no-op; order and return events have deterministic ids
(`order.confirmed` = the order id, `return.reported` = `<orderId>#<partId>`),
impressions use a UUID. `order.confirmed` and `return.reported` are written
with `TransactWriteItems`: the conditional put plus `ADD` on the part
counters and the part × variant counters, so a duplicate emit cannot
double-count. `search.impression` and `order.placed` are plain conditional
puts with no counters. A GSI (`gsi1pk`, `gsi1sk`) with the constant
partition `counters` reads every part's counters in one query; at this
project's scale that single partition is a documented trade-off, not a
problem.

**The log never fails a request.** `EventsService.record()` catches and
logs its own errors; search and orders await it (a few milliseconds
locally) but cannot be failed by it. Integration tests assert on the table,
not on timing.

**Domain (strict TDD).** `returnRates(counters, thresholds)` takes
`{ partId, confirmedUnits, didNotFitUnits }[]` and returns rows with
`rate` (0..1, two decimals), `distrust: boolean` and a reason string, sorted
by rate desc then units desc. Defaults: `minConfirmedUnits = 3`,
`distrustAbove = 0.2`; a part below the minimum is listed but never
distrusted, and its reason says so. `RETURN_REASONS` and `validateReturn`
live beside it.

**Feedback.** `GET /feedback/return-rates?limit=` queries the counters GSI,
runs `returnRates`, joins `sku` and `name` from Postgres, and for each
returned part queries `pk = part#<id>` for its variants and labels them
with `variantLabel`. Response `{ rows: [{ partId, sku, name,
confirmedUnits, didNotFitUnits, rate, distrust, reason, variants: [{ id,
label, didNotFitUnits }] }], thresholds }`. The web page `/feedback` lists
it with the distrust flag as text, linked from the imports page as the
second operator view. The order page gains a return form for `confirmed`
orders.

**Infrastructure.** `docker-compose.yml` and the CI job gain
`amazon/dynamodb-local` on port 8000. `.env.example` gains
`DYNAMODB_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` (the last two are dummy values the local store
ignores). `npm run events:setup` creates the table and its GSI if missing
and joins `db:setup`; integration tests create a throwaway table per file.
Dependencies: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`.

**ADR 16.** The event log is a second store by design: events are facts,
not entities, nothing in Postgres derives from them, and Postgres stays the
source of truth for everything the catalogue and orders need. Consequences:
idempotent appends by condition expression, counters as the
production-shaped read path, no TTL locally (the production knob for
impressions), and one more service the local stack carries.

## 5. What Tier 2 still does not do

No authentication on the supplier endpoint or the operator pages (Tier 3).
No reverse logistics. No rate limiting. No cloud DynamoDB. The saved list is
per browser, not per person.
