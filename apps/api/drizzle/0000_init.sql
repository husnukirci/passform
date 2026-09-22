CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text
);
--> statement-breakpoint
CREATE TABLE "fitments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"part_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"build_from" char(7),
	"build_to" char(7),
	"axle" text,
	"equipment_code" text
);
--> statement-breakpoint
CREATE TABLE "import_chunks" (
	"import_id" text NOT NULL,
	"seq" integer NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"row_from" integer NOT NULL,
	"row_to" integer NOT NULL,
	"error" jsonb,
	CONSTRAINT "import_chunks_import_id_seq_pk" PRIMARY KEY("import_id","seq")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"status" text NOT NULL,
	"file_path" text NOT NULL,
	"total_rows" integer NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"chunk_size" integer NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"order_id" text NOT NULL,
	"part_id" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_cents" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_part_id_pk" PRIMARY KEY("order_id","part_id"),
	CONSTRAINT "order_lines_qty_check" CHECK ("order_lines"."qty" >= 1)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text NOT NULL,
	"total_cents" integer NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"brand" text NOT NULL,
	"brand_tier" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"oe_ref" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_cents" integer NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"supplier_id" text NOT NULL,
	"universal" boolean DEFAULT false NOT NULL,
	CONSTRAINT "parts_sku_unique" UNIQUE("sku"),
	CONSTRAINT "parts_stock_qty_check" CHECK ("parts"."stock_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"part_id" text NOT NULL,
	"qty" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"engine_code" text NOT NULL,
	"kw" integer NOT NULL,
	"fuel" text NOT NULL,
	"build_from" char(7) NOT NULL,
	"build_to" char(7),
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"key_manufacturer" char(4) NOT NULL,
	"key_type" char(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_variant_id_vehicle_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."vehicle_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_chunks" ADD CONSTRAINT "import_chunks_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fitments_variant_id_idx" ON "fitments" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "fitments_part_id_idx" ON "fitments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "parts_brand_idx" ON "parts" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "parts_category_id_idx" ON "parts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "parts_supplier_id_idx" ON "parts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_open_expires_at_idx" ON "stock_reservations" USING btree ("expires_at") WHERE "stock_reservations"."released_at" is null;--> statement-breakpoint
CREATE INDEX "vehicle_variants_key_idx" ON "vehicle_variants" USING btree ("key_manufacturer","key_type");--> statement-breakpoint
CREATE INDEX "vehicle_variants_make_model_idx" ON "vehicle_variants" USING btree ("make","model");