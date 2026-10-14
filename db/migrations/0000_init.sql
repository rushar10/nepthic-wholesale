CREATE TYPE "public"."business_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_status" AS ENUM('UNFULFILLED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('AWAITING_PAYMENT', 'DEPOSIT_PAID', 'BALANCE_REQUESTED', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('FULL', 'DEPOSIT', 'BALANCE', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('FULL', 'DEPOSIT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('REQUESTED', 'QUOTED', 'ANSWERED', 'DECLINED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."quote_type" AS ENUM('QUOTE', 'ENQUIRY');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('BUSINESS', 'STAFF', 'ADMIN');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text NOT NULL,
	"abn" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postcode" text NOT NULL,
	"status" "business_status" DEFAULT 'PENDING' NOT NULL,
	"payment_mode_override" "payment_mode",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_abn_unique" UNIQUE("abn")
);
--> statement-breakpoint
CREATE TABLE "catalogue_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trigger" text NOT NULL,
	"status" "import_status" DEFAULT 'RUNNING' NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"variant_id" text,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"business_id" text,
	"user_id" text NOT NULL,
	"status" "order_status" DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"fulfilment" "fulfilment_status" DEFAULT 'UNFULFILLED' NOT NULL,
	"payment_mode" "payment_mode" NOT NULL,
	"deposit_pct" integer DEFAULT 0 NOT NULL,
	"tier_discount_pct" integer DEFAULT 0 NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"gst_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"balance_due_at" timestamp with time zone,
	"stock_deducted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"order_id" text,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"refund_of_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "price_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"min_units" integer NOT NULL,
	"max_units" integer,
	"discount_pct" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"hue" integer DEFAULT 250 NOT NULL,
	"image_url" text,
	"wholesale_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"type" "quote_type" NOT NULL,
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"items_text" text NOT NULL,
	"estimated_units" integer DEFAULT 0 NOT NULL,
	"needed_by" timestamp with time zone,
	"message" text DEFAULT '' NOT NULL,
	"status" "quote_status" DEFAULT 'REQUESTED' NOT NULL,
	"amount_cents" integer,
	"payment_mode" "payment_mode",
	"reply" text,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_number_unique" UNIQUE("number"),
	CONSTRAINT "quotes_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text NOT NULL,
	"units" integer NOT NULL,
	"photo_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "return_status" DEFAULT 'PENDING' NOT NULL,
	"decision_note" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"moq_per_style" integer DEFAULT 24 NOT NULL,
	"payment_mode" "payment_mode" DEFAULT 'DEPOSIT' NOT NULL,
	"deposit_pct" integer DEFAULT 30 NOT NULL,
	"balance_due_days" integer DEFAULT 14 NOT NULL,
	"quote_valid_days" integer DEFAULT 14 NOT NULL,
	"proximity_radius" integer DEFAULT 150 NOT NULL,
	"proximity_intensity" real DEFAULT 0.85 NOT NULL,
	"proximity_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'BUSINESS' NOT NULL,
	"business_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text NOT NULL,
	"sku" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_product_size" ON "variants" USING btree ("product_id","size");