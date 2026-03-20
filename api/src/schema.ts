import { pgTable, uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  riderName: text("rider_name").notNull(),
  soulRecordFilename: text("soul_record_filename"),
  soulRecordContent: text("soul_record_content"),
  declaredUtility: text("declared_utility"),
  consent: boolean("consent").notNull().default(true),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const warActivation = pgTable("war_activation", {
  id: text("id").primaryKey().default("singleton"),
  phase: text("phase").notNull().default("pre_tribes"),
  tribeAName: text("tribe_a_name"),
  tribeAId: text("tribe_a_id"),
  tribeACaptainName: text("tribe_a_captain_name"),
  tribeBName: text("tribe_b_name"),
  tribeBId: text("tribe_b_id"),
  tribeBCaptainName: text("tribe_b_captain_name"),
  activatedAt: timestamp("activated_at"),
  bothTribesReadyAt: timestamp("both_tribes_ready_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
