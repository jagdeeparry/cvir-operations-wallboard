import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const resourceAlignments = sqliteTable("resource_alignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  activityType: text("activity_type").notNull(),
  title: text("title").notNull(),
  resources: text("resources").notNull(),
  schedule: text("schedule").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
