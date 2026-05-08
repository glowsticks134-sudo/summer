import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable, eventConfigTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import type { GuildMember, Message } from "discord.js";
import { logger } from "../lib/logger";
import { isEventStarted } from "./eventScheduler";

const XP_COOLDOWN_MS = 30_000;
const XP_AMOUNT = 50;

export async function getActiveMultiplier(guildId: string): Promise<{ multiplier: number; label: string | null }> {
  const rows = await db.select().from(eventConfigTable).where(eq(eventConfigTable.guildId, guildId));
  const config = rows[0];
  if (!config || !config.xpMultiplier || config.xpMultiplier <= 1) return { multiplier: 1, label: null };
  if (config.xpMultiplierExpiresAt && config.xpMultiplierExpiresAt < new Date()) return { multiplier: 1, label: null };
  return { multiplier: config.xpMultiplier, label: config.xpMultiplierLabel ?? null };
}

export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level++;
  }
  return level;
}

function xpForNextLevel(level: number): number {
  return 100 * (level + 1) * (level + 2);
}

export async function awardXp(
  message: Message,
): Promise<{ xpGained: number; newLevel: number; leveledUp: boolean; totalXp: number } | null> {
  if (!message.guild || message.author.bot) return null;

  const guildId = message.guild.id;
  const eventActive = await isEventStarted(guildId);
  if (!eventActive) return null;

  const userId = message.author.id;
  const now = new Date();

  const existing = await db
    .select()
    .from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));

  const user = existing[0];

  if (user?.lastXpAt) {
    const elapsed = now.getTime() - user.lastXpAt.getTime();
    if (elapsed < XP_COOLDOWN_MS) return null;
  }

  const { multiplier } = await getActiveMultiplier(guildId);
  const xpGained = Math.round(XP_AMOUNT * multiplier);

  const prevXp = user?.xp ?? 0;
  const prevLevel = user?.level ?? 0;
  const newXp = prevXp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > prevLevel;

  const member = message.guild.members.cache.get(userId);
  const displayName = member?.displayName ?? message.author.username;

  if (!user) {
    await db.insert(xpUsersTable).values({
      guildId,
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
      .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));
  }

  const serverXpRows = await db.select().from(serverXpTable).where(eq(serverXpTable.guildId, guildId));
  const currentServerXp = serverXpRows[0]?.totalXp ?? 0;
  const newServerXp = currentServerXp + xpGained;

  if (serverXpRows.length === 0) {
    await db.insert(serverXpTable).values({ guildId, totalXp: newServerXp, updatedAt: now });
  } else {
    await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.guildId, guildId));
  }

  logger.info({ guildId, userId, xpGained, newXp, newLevel, leveledUp }, "XP awarded");
  return { xpGained, newLevel, leveledUp, totalXp: newServerXp };
}

export async function getServerTotalXp(guildId: string): Promise<number> {
  const rows = await db.select().from(serverXpTable).where(eq(serverXpTable.guildId, guildId));
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
