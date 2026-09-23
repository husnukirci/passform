-- Hand-edited from the generated `ADD COLUMN ... NOT NULL`: an existing
-- database may hold order lines, so the column is added nullable, backfilled
-- (in part id order, the only order those rows have) and then constrained.
ALTER TABLE "order_lines" ADD COLUMN "position" integer;--> statement-breakpoint
UPDATE "order_lines" SET "position" = numbered."position"
  FROM (
    SELECT "order_id", "part_id",
           row_number() OVER (PARTITION BY "order_id" ORDER BY "part_id") - 1 AS "position"
      FROM "order_lines"
  ) AS numbered
 WHERE "order_lines"."order_id" = numbered."order_id"
   AND "order_lines"."part_id" = numbered."part_id";--> statement-breakpoint
ALTER TABLE "order_lines" ALTER COLUMN "position" SET NOT NULL;
