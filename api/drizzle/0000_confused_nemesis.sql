CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_name" text NOT NULL,
	"soul_record_filename" text NOT NULL,
	"soul_record_content" text NOT NULL,
	"declared_utility" text,
	"consent" boolean DEFAULT true NOT NULL,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
