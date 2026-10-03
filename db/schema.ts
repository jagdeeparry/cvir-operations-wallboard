import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const resourceAlignments = sqliteTable("resource_alignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  activityType: text("activity_type").notNull(),
  title: text("title").notNull(),
  resources: text("resources").notNull(),
  schedule: text("schedule").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => [
  index("idx_resource_alignments_completed_at").on(table.completedAt),
]);

export const employeeOfMonth = sqliteTable("employee_of_month", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  employeeName: text("employee_name").notNull().default(""),
  slackImageUrl: text("slack_image_url").notNull().default(""),
  recognition: text("recognition").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
