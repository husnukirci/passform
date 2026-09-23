# REST API

The read side of the contract (Phase 4, suppliers added in Phase 7), the
import endpoints (Phase 5), the order endpoints (Phase 6) and the supplier
stock endpoint (Phase 9). Base URL in development:
`http://localhost:4000`. Every body is JSON; every schema lives in
`packages/contracts` and is the same definition the web app parses
responses with (ADR 13). Ids are strings, money is integer cents, build
dates are `YYYY-MM`. All examples below were run against the `small`
profile; the data is synthetic and every name is invented. Long arrays in
the examples are cut to their first entries; the field tables are complete.
Every example was re-run against the running API for v1.0.0.

## Errors

Every non-2xx response is an `ErrorResponse`:

| Field        | Type                                  | Notes                                     |
| ------------ | ------------------------------------- | ----------------------------------------- |
| `statusCode` | integer                               | Same as the HTTP status                   |
| `message`    | string                                | Human-readable, names the field or the id |
| `issues`     | `{ path: string, message: string }[]` | Only on validation failures (`400`)       |

- `400` — a query parameter failed its schema (`message: "Validation
failed"`, one issue per field) or a domain rule (for example a malformed
  registration key; the message names the field).
- `404` — an unknown variant id, part SKU, part id, import or order.
- `409` — an order request that cannot be honoured: an idempotency key
  reused with a different body, insufficient stock (the body then carries
  `sku`), or confirming an expired order.
- `500` — `message: "Internal server error"`; details stay in the API log.

```sh
curl 'localhost:4000/search?variantId=v_000001&page=0'
```

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "issues": [{ "path": "page", "message": "Too small: expected number to be >=1" }]
}
```

## Vehicles

### `GET /vehicles/resolve?manufacturer=&type=`

Resolves a two-part registration key. The key is trimmed and uppercased
before validation: `manufacturer` must be exactly four digits, `type`
exactly three characters `A–Z0–9`. One key may map to several variants;
that is normal, and the client asks the customer rather than guessing.

| Field                 | Type                  | Notes                                            |
| --------------------- | --------------------- | ------------------------------------------------ |
| `variants`            | `VehicleVariantDto[]` | Oldest build first, then by power. Empty is fine |
| `needsDisambiguation` | boolean               | `true` when more than one variant matched        |

`VehicleVariantDto`:

| Field        | Type                                           | Notes                                                       |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| `id`         | string                                         | `v_000001`                                                  |
| `make`       | string                                         |                                                             |
| `model`      | string                                         |                                                             |
| `engineCode` | string                                         |                                                             |
| `kw`         | integer                                        |                                                             |
| `fuel`       | `petrol` \| `diesel` \| `hybrid` \| `electric` |                                                             |
| `buildFrom`  | `YYYY-MM`                                      |                                                             |
| `buildTo`    | `YYYY-MM` \| null                              | `null` while still in production                            |
| `equipment`  | string[]                                       | Empty means the record does not say; fit then answers `ask` |
| `key`        | `{ manufacturer, type }`                       |                                                             |
| `label`      | string                                         | The line to show when disambiguating                        |

Errors: `400` for a malformed key.

```sh
curl 'localhost:4000/vehicles/resolve?manufacturer=1103&type=003'
```

```json
{
  "variants": [
    {
      "id": "v_000003",
      "make": "Varenta",
      "model": "Ivane",
      "engineCode": "D16-170",
      "kw": 170,
      "fuel": "diesel",
      "buildFrom": "2004-09",
      "buildTo": "2012-01",
      "equipment": ["AC", "AWD"],
      "key": { "manufacturer": "1103", "type": "003" },
      "label": "D16-170 · 170 kW · diesel · 2004-09 → 2012-01"
    },
    {
      "id": "v_000004",
      "make": "Varenta",
      "model": "Ivane",
      "engineCode": "P12-110",
      "kw": 110,
      "fuel": "petrol",
      "buildFrom": "2016-08",
      "buildTo": "2023-10",
      "equipment": ["BRK-L", "SUS-S", "AC", "AWD"],
      "key": { "manufacturer": "1103", "type": "003" },
      "label": "P12-110 · 110 kW · petrol · 2016-08 → 2023-10"
    }
  ],
  "needsDisambiguation": true
}
```

```sh
curl 'localhost:4000/vehicles/resolve?manufacturer=12&type=003'
```

```json
{ "statusCode": 400, "message": "manufacturer: expected exactly 4 digits" }
```

### `GET /vehicles/makes`

The dropdown fallback, first level. No parameters.

| Field   | Type     | Notes        |
| ------- | -------- | ------------ |
| `makes` | string[] | Alphabetical |

```sh
curl 'localhost:4000/vehicles/makes'
```

```json
{
  "makes": [
    "Brindmark",
    "Caldrith",
    "Halvora",
    "Kolmberg",
    "Ludmeyer",
    "Norvane",
    "Quennard",
    "Ristello",
    "Sorvique",
    "Tessaro",
    "Varenta",
    "Wexmoor"
  ]
}
```

### `GET /vehicles/models?make=`

| Parameter | Required | Notes            |
| --------- | -------- | ---------------- |
| `make`    | yes      | Non-empty string |

| Field    | Type     | Notes                                   |
| -------- | -------- | --------------------------------------- |
| `make`   | string   | Echoed                                  |
| `models` | string[] | Alphabetical; empty for an unknown make |

Errors: `400` without `make`.

```sh
curl 'localhost:4000/vehicles/models?make=Varenta'
```

```json
{ "make": "Varenta", "models": ["Ivane", "Kestra", "Lumvaren", "Pavane", "Rilla", "Sarto"] }
```

### `GET /vehicles?make=&model=`

| Parameter | Required | Notes            |
| --------- | -------- | ---------------- |
| `make`    | yes      | Non-empty string |
| `model`   | yes      | Non-empty string |

| Field      | Type                  | Notes                             |
| ---------- | --------------------- | --------------------------------- |
| `variants` | `VehicleVariantDto[]` | Oldest build first, then by power |

Errors: `400` when either parameter is missing.

```sh
curl 'localhost:4000/vehicles?make=Varenta&model=Ivane'
```

```json
{
  "variants": [
    {
      "id": "v_000003",
      "make": "Varenta",
      "model": "Ivane",
      "engineCode": "D16-170",
      "kw": 170,
      "fuel": "diesel",
      "buildFrom": "2004-09",
      "buildTo": "2012-01",
      "equipment": ["AC", "AWD"],
      "key": { "manufacturer": "1103", "type": "003" },
      "label": "D16-170 · 170 kW · diesel · 2004-09 → 2012-01"
    }
  ]
}
```

(Trimmed to the first variant.)

### `GET /vehicles/:id`

One `VehicleVariantDto`. Errors: `404` for an unknown id.

```sh
curl 'localhost:4000/vehicles/v_000001'
```

```json
{
  "id": "v_000001",
  "make": "Varenta",
  "model": "Ivane",
  "engineCode": "P30-66",
  "kw": 66,
  "fuel": "petrol",
  "buildFrom": "2011-08",
  "buildTo": "2016-02",
  "equipment": ["BRK-L", "AWD"],
  "key": { "manufacturer": "1103", "type": "001" },
  "label": "P30-66 · 66 kW · petrol · 2011-08 → 2016-02"
}
```

```sh
curl 'localhost:4000/vehicles/v_nope'
```

```json
{ "statusCode": 404, "message": "vehicle v_nope not found" }
```

## Categories

### `GET /categories`

The whole tree. No parameters.

| Field        | Type             | Notes                       |
| ------------ | ---------------- | --------------------------- |
| `categories` | `CategoryNode[]` | Roots, alphabetical by name |

`CategoryNode`: `{ id: string, name: string, children: CategoryNode[] }`.
The `id` is the slug (`brakes/pads`) and is what `GET /search?category=`
takes.

```sh
curl 'localhost:4000/categories'
```

```json
{
  "categories": [
    {
      "id": "body",
      "name": "Body",
      "children": [
        { "id": "body/door-handles", "name": "Door handles", "children": [] },
        { "id": "body/mirrors", "name": "Mirror glass", "children": [] },
        { "id": "body/clips", "name": "Trim clips", "children": [] }
      ]
    }
  ]
}
```

(Trimmed to the first root.)

## Suppliers

### `GET /suppliers`

The suppliers an import can be filed under (the imports page offers them as
a list). No parameters.

| Field       | Type             | Notes |
| ----------- | ---------------- | ----- |
| `suppliers` | `{ id, name }[]` | By id |

```sh
curl 'localhost:4000/suppliers'
```

```json
{
  "suppliers": [
    { "id": "s_01", "name": "Brenholt Distribution" },
    { "id": "s_02", "name": "Calmere Autoparts" }
  ]
}
```

(Trimmed to the first two.)

### `PATCH /suppliers/:id/stock`

The fast index path (ADR 11): a supplier's price-and-stock delta is written
to Postgres and then patched onto the live search alias, with no rebuild.
Values are absolute, so the same body sent twice leaves the same state and
a lost response is recovered by sending it again.

JSON body `StockUpdateBody`:

| Field               | Required | Notes                                                    |
| ------------------- | -------- | -------------------------------------------------------- |
| `rows`              | yes      | 1 to 1,000 rows; `sku` unique across rows                |
| `rows[].sku`        | yes      | A SKU of this supplier                                   |
| `rows[].priceCents` | no       | Integer ≥ 0                                              |
| `rows[].stockQty`   | no       | Integer ≥ 0, what is on the supplier's shelf             |
| (per row)           |          | At least one of `priceCents` and `stockQty` must be sent |

A field a row does not carry keeps its current value. A reported
`stockQty` is stored less the units held by open reservations on `placed`
orders, which the release job would otherwise give back on top of the
report; a confirmed order's reservation does not reduce it. SKUs that do
not exist or belong to another supplier are listed in `unknown`, not
rejected.

Response: `200` with `StockUpdateResponse` once Postgres has committed,
whatever happened to the index afterwards.

| Field     | Type     | Notes                                                                                           |
| --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `updated` | integer  | Rows that matched a part of this supplier and were written                                      |
| `unknown` | string[] | SKUs that matched nothing, in request order                                                     |
| `indexed` | boolean  | `false` when the index patch failed; Postgres is correct and the next rebuild repairs the index |

Errors: `400` for a body that fails the schema (no rows, more than 1,000,
a repeated `sku`, a row with neither field); `404` for an unknown
supplier.

```sh
curl -X PATCH -H 'content-type: application/json' \
  -d '{"rows":[{"sku":"PUL-0000007","priceCents":5490,"stockQty":12},{"sku":"EBR-0000010","stockQty":0},{"sku":"ZAB-0000004","priceCents":100}]}' \
  localhost:4000/suppliers/s_01/stock
```

```json
{ "updated": 2, "unknown": ["ZAB-0000004"], "indexed": true }
```

`ZAB-0000004` belongs to `s_02`, so it was neither written nor rejected. A
search issued straight after shows the new price and availability:

```sh
curl 'localhost:4000/search?variantId=v_000113&q=PUL-0000007'
```

```json
{
  "hits": [
    {
      "id": "p_0000007",
      "sku": "PUL-0000007",
      "name": "Pulvane Starter motors C581",
      "priceCents": 5490,
      "inStock": true,
      "fit": { "result": "fits", "reason": "Fits Varenta Rilla D22-55 (2006-01 → 2010-06)" }
    }
  ],
  "stages": { "fitted": 1, "shown": 1 },
  "page": 1,
  "pageSize": 24
}
```

(Hit trimmed to the fields the patch touches.)

```sh
curl -X PATCH -H 'content-type: application/json' \
  -d '{"rows":[{"sku":"PUL-0000007"}]}' localhost:4000/suppliers/s_01/stock
```

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "issues": [{ "path": "rows.0", "message": "expected priceCents or stockQty" }]
}
```

An unknown supplier:

```json
{ "statusCode": 404, "message": "supplier s_99 not found" }
```

## Search

### `GET /search?variantId=&q=&category=&brand=&axle=&sort=&page=`

Constrain, then rank (ADR 4). Fitment is an exact filter: a part is a hit
only when one of its fitment rows matches the variant, its build month and
the chosen axle, or the part is universal. Ranking (in stock, then brand
tier) applies only to the survivors. Page size is fixed at 24.

| Parameter   | Required | Notes                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------ |
| `variantId` | yes      | From `/vehicles/resolve` or `/vehicles`                                        |
| `q`         | no       | Free text over name, SKU, OE reference and brand                               |
| `category`  | no       | A category slug; matches the category and everything below it                  |
| `brand`     | no       | Exact brand name                                                               |
| `axle`      | no       | `front` \| `rear`; drops rows restricted to the other axle                     |
| `sort`      | no       | `default` (rank, then price) \| `price_asc` \| `price_desc`; default `default` |
| `page`      | no       | Integer ≥ 1; default 1                                                         |

| Field           | Type             | Notes                                                   |
| --------------- | ---------------- | ------------------------------------------------------- |
| `hits`          | `SearchHitDto[]` | This page                                               |
| `stages.fitted` | integer          | Parts that passed the fitment filter, before pagination |
| `stages.shown`  | integer          | `hits.length`                                           |
| `page`          | integer          | Echoed                                                  |
| `pageSize`      | integer          | Always 24                                               |

`SearchHitDto` is the part as the index knows it plus a fit verdict:

| Field          | Type                             | Notes                                                         |
| -------------- | -------------------------------- | ------------------------------------------------------------- |
| `id`           | string                           | `p_0000001`                                                   |
| `sku`          | string                           |                                                               |
| `brand`        | string                           |                                                               |
| `brandTier`    | `oe` \| `premium` \| `standard`  |                                                               |
| `categorySlug` | string                           | The leaf                                                      |
| `name`         | string                           |                                                               |
| `oeRef`        | string                           |                                                               |
| `attributes`   | `Record<string, string\|number>` |                                                               |
| `priceCents`   | integer                          |                                                               |
| `inStock`      | boolean                          | The index carries the flag, not the quantity; see part detail |
| `universal`    | boolean                          |                                                               |
| `fit`          | `FitDto`                         | See below                                                     |

`FitDto` is one of:

- `{ result: "fits", reason }`
- `{ result: "ask", reason, equipmentCode }` — the row needs an equipment
  code and the variant record carries none; confirm before ordering
- `{ result: "no", reason }` — only reachable on the detail endpoint, or in
  search when `axle` is given and the part's matching rows are for the
  other axle

Every `reason` is a sentence produced by the domain's `evaluateFit`; the
badge text and its explanation come from the same place.

Errors: `400` for a missing `variantId`, a bad `axle`, `sort` or `page`;
`404` for an unknown variant.

```sh
curl 'localhost:4000/search?variantId=v_000001&sort=price_asc'
```

```json
{
  "hits": [
    {
      "id": "p_0001305",
      "sku": "REM-0001305",
      "brand": "Rembrix",
      "brandTier": "standard",
      "categorySlug": "lighting/bulbs",
      "name": "Rembrix Bulbs F385",
      "oeRef": "VAR-12190",
      "attributes": { "weightG": 4341, "lengthMm": 634 },
      "priceCents": 570,
      "universal": true,
      "inStock": true,
      "fit": { "result": "fits", "reason": "Universal part, fits every vehicle" }
    }
  ],
  "stages": { "fitted": 273, "shown": 24 },
  "page": 1,
  "pageSize": 24
}
```

(Trimmed to the first hit.)

```sh
curl 'localhost:4000/search?variantId=v_000001&category=suspension&axle=front'
```

```json
{
  "hits": [
    {
      "id": "p_0002819",
      "sku": "TRE-0002819",
      "brand": "Tremosk",
      "brandTier": "standard",
      "categorySlug": "suspension/shocks",
      "name": "Tremosk Shock absorbers J306",
      "oeRef": "LUD-88961",
      "attributes": { "axle": "front", "weightG": 10791, "lengthMm": 899 },
      "priceCents": 6530,
      "universal": false,
      "inStock": true,
      "fit": { "result": "fits", "reason": "Fits Varenta Ivane P30-66 (2011-08 → 2016-02)" }
    }
  ],
  "stages": { "fitted": 2, "shown": 2 },
  "page": 1,
  "pageSize": 24
}
```

(Trimmed to the first hit.)

## Parts

### `GET /parts/:sku?variantId=`

The part from Postgres with its fitment rows and category path. When
`variantId` is given, fit is evaluated against that variant with no axle
chosen, so an axle-restricted row can still answer `fits`.

| Parameter   | Required | Notes                           |
| ----------- | -------- | ------------------------------- |
| `variantId` | no       | When present, must be non-empty |

`PartDetailResponse` is `PartDto` plus:

| Field          | Type             | Notes                                         |
| -------------- | ---------------- | --------------------------------------------- |
| `categoryPath` | string[]         | Every ancestor slug plus the leaf, root first |
| `fit`          | `FitDto` \| null | `null` when no `variantId` was given          |
| `fitments`     | `FitmentDto[]`   | Empty for a universal part                    |

`PartDto` has the search hit's fields with `stockQty` (integer) and
`supplierId` (string) instead of `inStock`. `FitmentDto` is
`{ variantId, buildFrom, buildTo, axle, equipmentCode }`, each restriction
`null` when the row does not carry it.

Errors: `400` for an empty `variantId`; `404` for an unknown SKU or
variant.

```sh
curl 'localhost:4000/parts/COR-0000028?variantId=v_000001'
```

```json
{
  "id": "p_0000028",
  "sku": "COR-0000028",
  "brand": "Corvelth",
  "brandTier": "oe",
  "categorySlug": "lighting/bulbs",
  "name": "Corvelth Bulbs N256",
  "oeRef": "VAR-60358",
  "attributes": { "weightG": 6270, "lengthMm": 676 },
  "priceCents": 1130,
  "stockQty": 51,
  "supplierId": "s_05",
  "universal": true,
  "categoryPath": ["lighting", "lighting/bulbs"],
  "fit": { "result": "fits", "reason": "Universal part, fits every vehicle" },
  "fitments": []
}
```

```sh
curl 'localhost:4000/parts/OST-0004250?variantId=v_000001'
```

```json
{
  "id": "p_0004250",
  "sku": "OST-0004250",
  "brand": "Ostrik",
  "brandTier": "standard",
  "categorySlug": "suspension/shocks",
  "name": "Ostrik Shock absorbers U663",
  "oeRef": "VAR-38278",
  "attributes": { "axle": "front", "weightG": 2837, "lengthMm": 421 },
  "priceCents": 7730,
  "stockQty": 59,
  "supplierId": "s_06",
  "universal": false,
  "categoryPath": ["suspension", "suspension/shocks"],
  "fit": {
    "result": "fits",
    "reason": "Fits Varenta Ivane P30-66 (2011-08 → 2016-02) on the front axle"
  },
  "fitments": [
    {
      "variantId": "v_000018",
      "buildFrom": "2013-08",
      "buildTo": "2016-04",
      "axle": null,
      "equipmentCode": null
    },
    {
      "variantId": "v_000126",
      "buildFrom": null,
      "buildTo": null,
      "axle": "front",
      "equipmentCode": null
    }
  ]
}
```

(Trimmed to two of seventeen fitment rows.)

```sh
curl 'localhost:4000/parts/nope'
```

```json
{ "statusCode": 404, "message": "part nope not found" }
```

## Imports

An import runs on the queue (ADR 8): `POST` records it, splits the file
and answers `202` at once; `GET` reports progress until the status is
terminal, after which one index rebuild runs and swaps the alias. Bull
Board at `/admin/queues` shows the `import.chunk`, `index.rebuild` and
`import.chunk.dlq` queues, next to the order flow's `reservations.release`.

### `POST /imports`

JSON body `CreateImportBody`:

| Field        | Required | Notes                                                                                   |
| ------------ | -------- | --------------------------------------------------------------------------------------- |
| `supplierId` | yes      | An existing supplier                                                                    |
| `path`       | no       | A `.jsonl` file relative to `DATA_DIR`, such as one from `npm run data:generate-import` |

Or `multipart/form-data` with the fields `supplierId` and `file`; the upload
is stored under `DATA_DIR/imports/uploads/` and imported from there. One of
`path` and `file` is required.

Each line of the file is one supplier row: `{ sku, brand, brandTier,
categorySlug, name, oeRef, attributes, priceCents, stockQty, universal,
fitments: [{ variantId, buildFrom, buildTo, axle, equipmentCode }] }`. Rows
are validated by the domain rules and checked against the catalogue; a
rejected row (bad shape, unknown category or variant) counts in `failedRows`
and is reported on its chunk, and never fails the import. A SKU the
catalogue has is updated in every mutable column and its fitments are
replaced; a new SKU is inserted with the id `p_<sku>`.

Response: `202` with `CreateImportResponse` `{ importId }`.

Errors: `400` for a body that fails the schema, a `path` outside
`DATA_DIR`, or neither `path` nor `file`; `404` for an unknown supplier or a
`path` that is not there.

```sh
curl -H 'content-type: application/json' \
  -d '{"supplierId":"s_01","path":"imports/s_01-500000.jsonl"}' \
  localhost:4000/imports
```

```json
{ "importId": "imp_8a3ecd094ef9" }
```

```sh
curl -H 'content-type: application/json' \
  -d '{"supplierId":"s_01","path":"../secrets.jsonl"}' localhost:4000/imports
```

```json
{ "statusCode": 400, "message": "path must be inside DATA_DIR: ../secrets.jsonl" }
```

```sh
curl -H 'content-type: application/json' -d '{"supplierId":"s_99","path":"imports/s_01-500000.jsonl"}' localhost:4000/imports
```

```json
{ "statusCode": 404, "message": "supplier s_99 not found" }
```

### `GET /imports/:id`

`ImportStatusResponse`:

| Field           | Type                                                          | Notes                                          |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `id`            | string                                                        |                                                |
| `status`        | `queued` \| `running` \| `completed` \| `partial` \| `failed` | See below                                      |
| `totalRows`     | integer                                                       | Non-empty lines in the file                    |
| `processedRows` | integer                                                       | Rows upserted so far                           |
| `failedRows`    | integer                                                       | Rows rejected so far                           |
| `chunks`        | `{ pending, done, failed }`                                   | Counts of 1,000-row chunks by outcome          |
| `startedAt`     | ISO timestamp \| null                                         | When the first job was queued                  |
| `finishedAt`    | ISO timestamp \| null                                         | When the last chunk became terminal            |
| `error`         | `{ message }` \| null                                         | Set when the split or the index rebuild failed |

`completed` means every row is in. `partial` means some rows were
rejected, or a chunk failed after every retry: its job sits in
`import.chunk.dlq` with the error and the rejected rows attached, and the
other chunks' rows are in. `failed` means the file could not be split;
nothing was written. Both `completed` and `partial` queue a rebuild, so the
index catches up with whatever did land.

Errors: `404` for an unknown import id.

```sh
curl localhost:4000/imports/imp_8a3ecd094ef9
```

Two seconds in:

```json
{
  "id": "imp_8a3ecd094ef9",
  "status": "running",
  "totalRows": 500000,
  "processedRows": 8000,
  "failedRows": 0,
  "chunks": { "pending": 492, "done": 8, "failed": 0 },
  "startedAt": "2026-09-23T08:20:17.010Z",
  "finishedAt": null,
  "error": null
}
```

Two minutes later:

```json
{
  "id": "imp_8a3ecd094ef9",
  "status": "completed",
  "totalRows": 500000,
  "processedRows": 500000,
  "failedRows": 0,
  "chunks": { "pending": 0, "done": 500, "failed": 0 },
  "startedAt": "2026-09-23T08:20:17.010Z",
  "finishedAt": "2026-09-23T08:22:22.485Z",
  "error": null
}
```

## Orders

An order reserves stock the moment it is placed and keeps it for fifteen
minutes; confirming within that window makes the reservation permanent,
and otherwise the `reservations.release` job (every minute, visible in
Bull Board) expires the order and puts the stock back (ADR 10). Creation
is idempotent on a client-chosen key (ADR 9), so a lost response is
recovered by sending the identical request again.

### `POST /orders`

Header `Idempotency-Key`: required, a UUID the client generates per
checkout attempt and reuses for every retry of it.

JSON body `CreateOrderBody`:

| Field            | Required | Notes                                      |
| ---------------- | -------- | ------------------------------------------ |
| `lines`          | yes      | At least one; `partId` unique across lines |
| `lines[].partId` | yes      | An existing part id                        |
| `lines[].qty`    | yes      | Integer ≥ 1                                |

Unit prices are the parts' current prices at the moment of placing;
`totalCents` is their sum over the quantities. Stock is taken per line by a
conditional update, so a line for more than is in stock fails the whole
order and nothing is reserved.

Response: `201` with `OrderResponse` on first receipt; `200` with the
**stored** body of the first receipt when the same key arrives again with
the same body, byte for byte, however the order has moved on since.

| Field         | Type                                      | Notes                                        |
| ------------- | ----------------------------------------- | -------------------------------------------- |
| `id`          | string                                    | `ord_<hex>`                                  |
| `status`      | `placed` \| `confirmed` \| `expired`      |                                              |
| `totalCents`  | integer                                   |                                              |
| `lines`       | `{ partId, sku, name, qty, unitCents }[]` | In the order they were sent                  |
| `expiresAt`   | ISO timestamp                             | When the reservation lapses unless confirmed |
| `confirmedAt` | ISO timestamp \| null                     |                                              |

Errors (`OrderErrorResponse`, an `ErrorResponse` that may carry `sku`):
`400` without the header, with one that is not a UUID, or for a body that
fails the schema; `404` for a `partId` that does not exist; `409` when the
key was already used with a different body (`message: "Idempotency-Key
reused with a different payload"`); `409` with `sku` when a line's part
has too little stock.

```sh
curl -H 'content-type: application/json' \
  -H 'Idempotency-Key: 0b4f0e2a-6d3c-4f5e-9a1b-2c3d4e5f6a7b' \
  -d '{"lines":[{"partId":"p_0000001","qty":2},{"partId":"p_0000002","qty":1}]}' \
  localhost:4000/orders
```

First receipt, `201`:

```json
{
  "id": "ord_ce6b109911d8",
  "status": "placed",
  "totalCents": 16120,
  "lines": [
    {
      "partId": "p_0000001",
      "sku": "LOR-0000001",
      "name": "Lorrexa Bushings U696",
      "qty": 2,
      "unitCents": 7420
    },
    {
      "partId": "p_0000002",
      "sku": "DUN-0000002",
      "name": "Dunmoor Tail lamps F528",
      "qty": 1,
      "unitCents": 1280
    }
  ],
  "expiresAt": "2026-09-23T09:00:50.501Z",
  "confirmedAt": null
}
```

The same command again: `200` with exactly the body above. The same key
with `"qty": 3`:

```json
{ "statusCode": 409, "message": "Idempotency-Key reused with a different payload" }
```

A line for more than is in stock, under a fresh key:

```json
{ "statusCode": 409, "message": "Insufficient stock for DUN-0000002", "sku": "DUN-0000002" }
```

```sh
curl -H 'content-type: application/json' \
  -d '{"lines":[{"partId":"p_0000001","qty":1}]}' localhost:4000/orders
```

```json
{ "statusCode": 400, "message": "Idempotency-Key header is required" }
```

### `POST /orders/:id/confirm`

The payment stand-in. A `placed` order becomes `confirmed` and its stock
stays taken. Response: `200` with the current `OrderResponse`; confirming
an order that is already `confirmed` is `200` again with the same
confirmation.

Errors: `404` for an unknown order; `409` `"Order has expired"` when the
release job got there first.

```sh
curl -X POST localhost:4000/orders/ord_ce6b109911d8/confirm
```

```json
{
  "id": "ord_ce6b109911d8",
  "status": "confirmed",
  "totalCents": 16120,
  "lines": [
    {
      "partId": "p_0000001",
      "sku": "LOR-0000001",
      "name": "Lorrexa Bushings U696",
      "qty": 2,
      "unitCents": 7420
    },
    {
      "partId": "p_0000002",
      "sku": "DUN-0000002",
      "name": "Dunmoor Tail lamps F528",
      "qty": 1,
      "unitCents": 1280
    }
  ],
  "expiresAt": "2026-09-23T09:00:50.501Z",
  "confirmedAt": "2026-09-23T08:45:50.739Z"
}
```

```sh
curl -X POST localhost:4000/orders/ord_e71f82f375bc/confirm
```

An order the release job has expired:

```json
{ "statusCode": 409, "message": "Order has expired" }
```

### `GET /orders/:id`

The order as it is now, `OrderResponse`: `status` and `confirmedAt` move
with confirmation and expiry, unlike the stored body a replayed `POST`
returns.

Errors: `404` for an unknown order.

```sh
curl localhost:4000/orders/ord_nope
```

```json
{ "statusCode": 404, "message": "order ord_nope not found" }
```

## Health

### `GET /health`

`{ "ok": true }` whenever the process is up. It does not probe the
services.
