import { db } from "@workspace/db";
import { milestonesTable, xpUsersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import type { Client, Guild, TextChannel } from "discord.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { logger } from "../lib/logger";
import { startGiveaway } from "./giveaway";
import { startQuickDrop } from "./quickdrop";

export interface MilestoneDef {
  id: number;
  xpRequired: number;
  title: string;
  description: string;
  rewardType: "channel" | "role" | "giveaway" | "quickdrop" | "announcement";
  rewardConfig: Record<string, unknown>;
}

export const MILESTONE_DEFS: MilestoneDef[] = [
  {
    id: 1,
    xpRequired: 1_000,
    title: "🌊 Summer Kickoff",
    description: "The server has earned 1,000 XP! A new channel has been unlocked.",
    rewardType: "channel",
    rewardConfig: { name: "summer-lounge", topic: "The Summer Break Event lounge — you unlocked this! 🏖️" },
  },
  {
    id: 2,
    xpRequired: 5_000,
    title: "☀️ Sun's Out",
    description: "5,000 XP reached! Summer emojis are now available on the server.",
    rewardType: "announcement",
    rewardConfig: {
      message: "☀️ **SUN'S OUT!** The server hit **5,000 XP**! Ask an admin to add your favourite summer emojis — you've earned it! 🏄 🍦 🌺 🎉 🌴",
    },
  },
  {
    id: 3,
    xpRequired: 15_000,
    title: "🏅 Summer Scout",
    description: "15,000 XP! The top 5 most active members earn the 'Summer Scout' role.",
    rewardType: "role",
    rewardConfig: { roleName: "Summer Scout", color: 0x34d399, topN: 5 },
  },
  {
    id: 4,
    xpRequired: 30_000,
    title: "🎁 Mini Giveaway",
    description: "30,000 XP! A mini giveaway has been triggered.",
    rewardType: "giveaway",
    rewardConfig: {
      prize: "Summer Break Event Mini Prize 🎁",
      durationMs: 30 * 60 * 1000,
      winners: 1,
      channelName: "summer-lounge",
    },
  },
  {
    id: 5,
    xpRequired: 50_000,
    title: "⚡ Quick Drop",
    description: "50,000 XP! A Quick Drop event is live — first to react wins!",
    rewardType: "quickdrop",
    rewardConfig: { prize: "Quick Drop Prize ⚡", durationMs: 5 * 60 * 1000, channelName: "summer-lounge" },
  },
  {
    id: 6,
    xpRequired: 75_000,
    title: "🏝️ VIP Lounge Unlocked",
    description: "75,000 XP! A secret VIP channel has been unlocked for the server.",
    rewardType: "channel",
    rewardConfig: { name: "vip-summer-lounge", topic: "VIP Summer Lounge 🏝️ — exclusive to the Summer Break Event." },
  },
  {
    id: 7,
    xpRequired: 100_000,
    title: "⚔️ Summer Warrior",
    description: "100,000 XP! The top 10 earners receive the 'Summer Warrior' role.",
    rewardType: "role",
    rewardConfig: { roleName: "Summer Warrior", color: 0xf97316, topN: 10 },
  },
  {
    id: 8,
    xpRequired: 150_000,
    title: "🎉 Big Giveaway",
    description: "150,000 XP! A BIG giveaway is now live for 1 hour.",
    rewardType: "giveaway",
    rewardConfig: {
      prize: "Summer Break Event Big Prize 🎉",
      durationMs: 60 * 60 * 1000,
      winners: 3,
      channelName: "summer-lounge",
    },
  },
  {
    id: 9,
    xpRequired: 200_000,
    title: "🔐 Summer HQ Unlocked",
    description: "200,000 XP! The secret Summer HQ channel is now open.",
    rewardType: "channel",
    rewardConfig: { name: "summer-hq", topic: "🔐 Summer HQ — you made it to the inner circle." },
  },
  {
    id: 10,
    xpRequired: 300_000,
    title: "🏆 Grand Finale",
    description: "300,000 XP! Grand Finale — top 3 become Summer Legends and a final Quick Drop fires!",
    rewardType: "role",
    rewardConfig: { roleName: "Summer Legend", color: 0xeab308, topN: 3 },
  },
];

export async function seedMilestones(): Promise<void> {
  for (const def of MILESTONE_DEFS) {
    const existing = await db.select().from(milestonesTable).where(eq(milestonesTable.id, def.id));
    if (existing.length === 0) {
      await db.insert(milestonesTable).values({
        id: def.id,
        xpRequired: def.xpRequired,
        title: def.title,
        description: def.description,
        rewardType: def.rewardType,
        rewardConfig: def.rewardConfig,
        unlocked: false,
      });
    }
  }
  logger.info("Milestones seeded");
}

export async function checkMilestones(client: Client, guild: Guild, serverTotalXp: number): Promise<void> {
  const locked = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.unlocked, false));

  for (const milestone of locked) {
    if (serverTotalXp >= milestone.xpRequired) {
      await unlockMilestone(client, guild, milestone.id);
    }
  }
}

async function unlockMilestone(client: Client, guild: Guild, milestoneId: number): Promise<void> {
  const def = MILESTONE_DEFS.find((m) => m.id === milestoneId);
  if (!def) return;

  await db
    .update(milestonesTable)
    .set({ unlocked: true, unlockedAt: new Date() })
    .where(eq(milestonesTable.id, milestoneId));

  logger.info({ milestoneId, title: def.title }, "Milestone unlocked");

  const announcementChannel = findChannel(guild, ["announcements", "general", "summer-lounge", "bot-log"]);

  try {
    if (def.rewardType === "channel") {
      await executeChannelReward(guild, def, announcementChannel);
    } else if (def.rewardType === "role") {
      await executeRoleReward(guild, def, announcementChannel);
    } else if (def.rewardType === "giveaway") {
      await executeGiveawayReward(client, guild, def, announcementChannel);
    } else if (def.rewardType === "quickdrop") {
      await executeQuickDropReward(client, guild, def, announcementChannel);
    } else if (def.rewardType === "announcement") {
      const cfg = def.rewardConfig as { message: string };
      if (announcementChannel) {
        await announcementChannel.send(`🎊 **MILESTONE UNLOCKED: ${def.title}**\n\n${cfg.message}`);
      }
    }
  } catch (err) {
    logger.error({ err, milestoneId }, "Error executing milestone reward");
  }
}

async function executeChannelReward(
  guild: Guild,
  def: MilestoneDef,
  announcementChannel: TextChannel | null,
): Promise<void> {
  const cfg = def.rewardConfig as { name: string; topic: string };
  const existingChannel = guild.channels.cache.find((c) => c.name === cfg.name);
  if (!existingChannel) {
    const newChannel = await guild.channels.create({
      name: cfg.name,
      type: ChannelType.GuildText,
      topic: cfg.topic,
    });
    logger.info({ channelId: newChannel.id, name: cfg.name }, "Created channel for milestone");
    await newChannel.send(
      `🎊 **${def.title}** — This channel was unlocked because the server hit **${def.xpRequired.toLocaleString()} XP**! ${def.description}`,
    );
  }
  if (announcementChannel) {
    await announcementChannel.send(
      `🎊 **MILESTONE UNLOCKED: ${def.title}**\n${def.description}\n\nA new channel <#${guild.channels.cache.find((c) => c.name === cfg.name)?.id ?? ""}> has been created!`,
    );
  }
}

async function executeRoleReward(
  guild: Guild,
  def: MilestoneDef,
  announcementChannel: TextChannel | null,
): Promise<void> {
  const cfg = def.rewardConfig as { roleName: string; color: number; topN: number };

  let role = guild.roles.cache.find((r) => r.name === cfg.roleName);
  if (!role) {
    role = await guild.roles.create({
      name: cfg.roleName,
      color: cfg.color,
      reason: `Summer Break Event Milestone: ${def.title}`,
    });
  }

  const topUsers = await db
    .select()
    .from(xpUsersTable)
    .orderBy(desc(xpUsersTable.xp))
    .limit(cfg.topN);

  const awarded: string[] = [];
  for (const user of topUsers) {
    const member = guild.members.cache.get(user.userId);
    if (member && !member.roles.cache.has(role!.id)) {
      await member.roles.add(role!);
      awarded.push(`<@${user.userId}>`);
    }
  }

  if (announcementChannel) {
    const mentions = awarded.length > 0 ? awarded.join(", ") : "top earners";
    await announcementChannel.send(
      `🎊 **MILESTONE UNLOCKED: ${def.title}**\n${def.description}\n\n🏅 The **${cfg.roleName}** role has been awarded to: ${mentions}`,
    );
  }
}

async function executeGiveawayReward(
  client: Client,
  guild: Guild,
  def: MilestoneDef,
  announcementChannel: TextChannel | null,
): Promise<void> {
  const cfg = def.rewardConfig as { prize: string; durationMs: number; winners: number; channelName: string };
  const targetChannel =
    (findChannel(guild, [cfg.channelName]) as TextChannel | null) ?? announcementChannel;
  if (!targetChannel) return;

  if (announcementChannel && announcementChannel.id !== targetChannel.id) {
    await announcementChannel.send(`🎊 **MILESTONE UNLOCKED: ${def.title}**\n${def.description}`);
  }

  await startGiveaway(client, targetChannel, {
    prize: cfg.prize,
    durationMs: cfg.durationMs,
    winnersCount: cfg.winners,
    milestoneId: def.id,
  });
}

async function executeQuickDropReward(
  client: Client,
  guild: Guild,
  def: MilestoneDef,
  announcementChannel: TextChannel | null,
): Promise<void> {
  const cfg = def.rewardConfig as { prize: string; durationMs: number; channelName: string };
  const targetChannel =
    (findChannel(guild, [cfg.channelName]) as TextChannel | null) ?? announcementChannel;
  if (!targetChannel) return;

  if (announcementChannel && announcementChannel.id !== targetChannel.id) {
    await announcementChannel.send(`🎊 **MILESTONE UNLOCKED: ${def.title}**\n${def.description}`);
  }

  await startQuickDrop(client, targetChannel, {
    prize: cfg.prize,
    durationMs: cfg.durationMs,
  });
}

function findChannel(guild: Guild, names: string[]): TextChannel | null {
  for (const name of names) {
    const ch = guild.channels.cache.find(
      (c) => c.name === name && c.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    if (ch) return ch;
  }
  return null;
}
