import { db } from "@workspace/db";
import { eventConfigTable, eventSignupsTable, xpUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { logger } from "../lib/logger";

let countdownTimer: ReturnType<typeof setTimeout> | null = null;

export async function getEventConfig() {
  const rows = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  return rows[0] ?? null;
}

export async function isEventStarted(): Promise<boolean> {
  const config = await getEventConfig();
  return config?.started ?? false;
}

export async function scheduleEventStart(client: Client): Promise<void> {
  const config = await getEventConfig();
  if (!config || config.started || !config.startsAt) return;

  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }

  const msUntilStart = config.startsAt.getTime() - Date.now();
  if (msUntilStart <= 0) {
    await fireEventStart(client);
    return;
  }

  logger.info({ msUntilStart, startsAt: config.startsAt }, "Event countdown scheduled");
  countdownTimer = setTimeout(() => fireEventStart(client), msUntilStart);
}

async function fireEventStart(client: Client): Promise<void> {
  const config = await getEventConfig();
  if (!config || config.started) return;

  await db
    .update(eventConfigTable)
    .set({ started: true, updatedAt: new Date() })
    .where(eq(eventConfigTable.id, 1));

  logger.info("Event has started — XP grinding is now live");

  const guildId = process.env["DISCORD_GUILD_ID"];
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  await guild.members.fetch();

  const signups = await db.select().from(eventSignupsTable);
  const EVENT_ROLE_NAME = "2026 Summer Break Event";
  let eventRole = guild.roles.cache.find((r) => r.name === EVENT_ROLE_NAME);
  if (!eventRole) {
    eventRole = await guild.roles.create({
      name: EVENT_ROLE_NAME,
      color: 0xfbbf24,
      reason: "Summer Break Event participant role",
    });
  }

  let rolesGranted = 0;
  for (const signup of signups) {
    if (signup.roleGranted) continue;
    try {
      const member = guild.members.cache.get(signup.userId);
      if (member && !member.roles.cache.has(eventRole!.id)) {
        await member.roles.add(eventRole!);
      }
      await db
        .update(eventSignupsTable)
        .set({ roleGranted: true })
        .where(eq(eventSignupsTable.userId, signup.userId));

      const existingXp = await db
        .select()
        .from(xpUsersTable)
        .where(eq(xpUsersTable.userId, signup.userId));

      const EARLY_SIGNUP_BONUS = 150;
      if (existingXp.length === 0) {
        await db.insert(xpUsersTable).values({
          userId: signup.userId,
          username: signup.username,
          displayName: signup.displayName,
          xp: EARLY_SIGNUP_BONUS,
          level: 0,
          totalMessages: 0,
          lastXpAt: null,
        });
      } else {
        await db
          .update(xpUsersTable)
          .set({ xp: existingXp[0].xp + EARLY_SIGNUP_BONUS })
          .where(eq(xpUsersTable.userId, signup.userId));
      }
      rolesGranted++;
    } catch (err) {
      logger.error({ err, userId: signup.userId }, "Error granting role to early signup");
    }
  }

  logger.info({ rolesGranted }, "Early signup roles and bonuses granted");

  const channelId = config.announcementChannelId;
  if (!channelId) return;

  try {
    const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🌞 THE SUMMER BREAK EVENT HAS STARTED!")
      .setColor(0xfbbf24)
      .setDescription(
        "**The wait is over — start grinding!** 🏖️\n\n" +
        "Every message you send earns XP. Hit milestones together to unlock new channels, roles, giveaways, and quick drops!\n\n" +
        `🎁 Early sign-ups received **150 bonus XP** and the **2026 Summer Break Event** role!\n\n` +
        "Use **/rank** to check your XP, **/leaderboard** to see the top earners, and **/serverprogress** to track server milestones.",
      )
      .addFields(
        { name: "⭐ Earn XP", value: "Chat in any channel — 15–25 XP per message (60s cooldown)", inline: false },
        { name: "🏆 Commands", value: "`/rank` · `/leaderboard` · `/serverprogress`", inline: false },
      )
      .setFooter({ text: "2026 Summer Break Event" })
      .setTimestamp();

    await channel.send({ content: "@everyone", embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Failed to send event start announcement");
  }
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}
