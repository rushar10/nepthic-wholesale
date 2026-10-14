CREATE TABLE "admin_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Staff and admin logins move to the separate Nepthic Admin Portal. Remove them from this
-- site, then make sure only trade buyers can ever have an account here.
DELETE FROM "users" WHERE "role" <> 'BUSINESS';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_buyers_only" CHECK (role = 'BUSINESS');