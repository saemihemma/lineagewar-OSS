CREATE TABLE "war_activation" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"phase" text DEFAULT 'pre_tribes' NOT NULL,
	"tribe_a_name" text,
	"tribe_a_id" text,
	"tribe_a_captain_name" text,
	"tribe_b_name" text,
	"tribe_b_id" text,
	"tribe_b_captain_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
