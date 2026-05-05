import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventSignupsTable = pgTable("event_signups", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  signedUpAt: timestamp("signed_up_at").notNull().defaultNow(),
  roleGranted: boolean("role_granted").notNull().default(false),
});

export const insertEventSignupSchema = createInsertSchema(eventSignupsTable);
export type InsertEventSignup = z.infer<typeof insertEventSignupSchema>;
export type EventSignup = typeof eventSignupsTable.$inferSelect;
