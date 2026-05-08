import { pgTable, text, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventConfigTable = pgTable("event_config", {
  guildId: text("guild_id").primaryKey(),
  startsAt: timestamp("starts_at"),
  started: boolean("started").notNull().default(false),
  announcementChannelId: text("announcement_channel_id"),
  signupMessageId: text("signup_message_id"),
  signupChannelId: text("signup_channel_id"),
  signupRoleId: text("signup_role_id"),
  signupRoleName: text("signup_role_name"),
  liveProgressChannelId: text("live_progress_channel_id"),
  liveProgressMessageId: text("live_progress_message_id"),
  xpMultiplier: real("xp_multiplier").notNull().default(1),
  xpMultiplierExpiresAt: timestamp("xp_multiplier_expires_at"),
  xpMultiplierLabel: text("xp_multiplier_label"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEventConfigSchema = createInsertSchema(eventConfigTable);
export type InsertEventConfig = z.infer<typeof insertEventConfigSchema>;
export type EventConfig = typeof eventConfigTable.$inferSelect;
