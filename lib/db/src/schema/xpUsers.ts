import { pgTable, text, integer, timestamp, bigint, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const xpUsersTable = pgTable("xp_users", {
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(0),
  totalMessages: integer("total_messages").notNull().default(0),
  lastXpAt: timestamp("last_xp_at"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastDailyAt: timestamp("last_daily_at"),
  dailyStreak: integer("daily_streak").notNull().default(0),
  weeklyXp: integer("weekly_xp").notNull().default(0),
  weekStartAt: timestamp("week_start_at"),
  lastSpinAt: timestamp("last_spin_at"),
  lastShoutoutAt: timestamp("last_shoutout_at"),
}, (table) => [
  primaryKey({ columns: [table.guildId, table.userId] }),
]);

export const serverXpTable = pgTable("server_xp", {
  guildId: text("guild_id").primaryKey(),
  totalXp: bigint("total_xp", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertXpUserSchema = createInsertSchema(xpUsersTable);
export type InsertXpUser = z.infer<typeof insertXpUserSchema>;
export type XpUser = typeof xpUsersTable.$inferSelect;
