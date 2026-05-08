import { pgTable, text, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const milestonesTable = pgTable("milestones", {
  guildId: text("guild_id").notNull(),
  id: integer("id").notNull(),
  xpRequired: integer("xp_required").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rewardType: text("reward_type").notNull(),
  rewardConfig: jsonb("reward_config").notNull(),
  unlocked: boolean("unlocked").notNull().default(false),
  unlockedAt: timestamp("unlocked_at"),
}, (table) => [
  primaryKey({ columns: [table.guildId, table.id] }),
]);

export const insertMilestoneSchema = createInsertSchema(milestonesTable);
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;
