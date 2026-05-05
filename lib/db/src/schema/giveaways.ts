import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const giveawaysTable = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  messageId: text("message_id"),
  channelId: text("channel_id").notNull(),
  prize: text("prize").notNull(),
  winnersCount: integer("winners_count").notNull().default(1),
  durationMs: integer("duration_ms").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  ended: boolean("ended").notNull().default(false),
  winnerIds: text("winner_ids").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  milestoneId: integer("milestone_id"),
});

export const insertGiveawaySchema = createInsertSchema(giveawaysTable).omit({ id: true });
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type Giveaway = typeof giveawaysTable.$inferSelect;
