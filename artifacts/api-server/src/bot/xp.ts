import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { GuildMember, Message } from "discord.js";
import { logger } from "../lib/logger";
import { isEventStarted } from "./eventScheduler";

const XP_COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

function randomXp(): number {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

function xpForNextLevel(level: number): number {
  return 100 * (level + 1) * (level + 2);
}

export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level++;
  }
  return level;
}

export async function awardXp(
  message: Message,
): Promise<{ xpGained: number; newLevel: number; leveledUp: boolean; totalXp: number } | null> {
  if (!message.guild || message.author.bot) return null;

  const eventActive = await isEventStarted();
  if (!eventActive) return null;

  const userId = message.author.id;
  const now = new Date();

  const existing = await db
    .select()
    .from(xpUsersTable)
    .where(eq(xpUsersTable.userId, userId))
    .limit(1);

  const user = existing[0];

  if (user?.lastXpAt) {
    const elapsed = now.getTime() - user.lastXpAt.getTime();
    if (elapsed < XP_COOLDOWN_MS) return null;
  }

  const xpGained = randomXp();
  const prevXp = user?.xp ?? 0;
  const prevLevel = user?.level ?? 0;
  const newXp = prevXp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > prevLevel;

  const member = message.guild.members.cache.get(userId);
  const displayName = member?.displayName ?? message.author.username;

  if (!user) {
    await db.insert(xpUsersTable).values({
      userId,
      username: message.author.username,
      displayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 1,
      lastXpAt: now,
    });
  } else {
    await db
      .update(xpUsersTable)
      .set({
        xp: newXp,
        level: newLevel,
        totalMessages: (user.totalMessages ?? 0) + 1,
        lastXpAt: now,
        displayName,
        username: message.author.username,
      })
      .where(eq(xpUsersTable.userId, userId));
  }

  const serverXpRows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
  const currentServerXp = serverXpRows[0]?.totalXp ?? 0;
  const newServerXp = currentServerXp + xpGained;

  if (serverXpRows.length === 0) {
    await db.insert(serverXpTable).values({ id: 1, totalXp: newServerXp, updatedAt: now });
  } else {
    await db
      .update(serverXpTable)
      .set({ totalXp: newServerXp, updatedAt: now })
      .where(eq(serverXpTable.id, 1));
  }

  logger.info({ userId, xpGained, newXp, newLevel, leveledUp }, "XP awarded");

  return { xpGained, newLevel, leveledUp, totalXp: newServerXp };
}

export async function getServerTotalXp(): Promise<number> {
  const rows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
  return rows[0]?.totalXp ?? 0;
}

export async function assignEventRole(member: GuildMember): Promise<void> {
  const EVENT_ROLE_NAME = "2026 Summer Break Event";
  try {
    let role = member.guild.roles.cache.find((r) => r.name === EVENT_ROLE_NAME);
    if (!role) {
      role = await member.guild.roles.create({
        name: EVENT_ROLE_NAME,
        color: 0xfbbf24,
        reason: "Summer Break Event participant role",
      });
      logger.info({ roleId: role.id }, "Created Summer Break Event role");
    }
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      logger.info({ userId: member.id, roleId: role.id }, "Assigned Summer Break Event role");
    }
  } catch (err) {
    logger.error({ err }, "Failed to assign event role");
  }
}
