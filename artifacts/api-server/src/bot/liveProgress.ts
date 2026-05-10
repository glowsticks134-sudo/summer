import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { db } from "@workspace/db";
import { serverXpTable, milestonesTable, eventConfigTable, xpUsersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { MILESTONE_DEFS } from "./milestones";
import { getActiveMultiplier } from "./xp";
import { logger } from "../lib/logger";

const UPDATE_INTERVAL_MS = 30_000;
let updaterInterval: ReturnType<typeof setInterval> | null = null;

function buildProgressBar(current: number, target: number, length = 20): string {
  const pct = Math.min(1, current / target);
  const filled = Math.round(pct * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

export async function buildLiveProgressEmbed(guildId: string): Promise<EmbedBuilder> {
  const [serverXpRows, milestoneRows, topUsers, activeMultiplier] = await Promise.all([
    db.select().from(serverXpTable).where(eq(serverXpTable.guildId, guildId)),
    db.select().from(milestonesTable).where(eq(milestonesTable.guildId, guildId)),
    db.select().from(xpUsersTable).where(eq(xpUsersTable.guildId, guildId)).orderBy(desc(xpUsersTable.xp)).limit(3),
    getActiveMultiplier(guildId),
  ]);

  const totalXp = serverXpRows[0]?.totalXp ?? 0;
  const milestoneMap = new Map(milestoneRows.map((m) => [m.id, m]));
  const unlockedCount = milestoneRows.filter((m) => m.unlocked).length;
  const nextMilestoneDef = MILESTONE_DEFS.find((m) => !(milestoneMap.get(m.id)?.unlocked));

  let progressBlock = "";
  let embedColor = 0xfbbf24;

  if (nextMilestoneDef) {
    const xpNeeded = Math.max(0, nextMilestoneDef.xpRequired - totalXp);
    const pct = Math.min(100, Math.round((totalXp / nextMilestoneDef.xpRequired) * 100));
    const bar = buildProgressBar(totalXp, nextMilestoneDef.xpRequired);
    progressBlock =
      `**Next:** ${nextMilestoneDef.title}\n` +
      `\`${bar}\` **${pct}%**\n` +
      `⭐ **${totalXp.toLocaleString()}** / ${nextMilestoneDef.xpRequired.toLocaleString()} XP  ·  ${xpNeeded.toLocaleString()} to go`;
    if (pct >= 75) embedColor = 0x22c55e;
    else if (pct >= 40) embedColor = 0x84cc16;
  } else {
    progressBlock = "🏆 **ALL MILESTONES COMPLETED!** 🏆\n⭐ **" + totalXp.toLocaleString() + " XP** earned — incredible work!";
    embedColor = 0xeab308;
  }

  const milestoneLines = MILESTONE_DEFS.map((def) => {
    const dbRow = milestoneMap.get(def.id);
    const xpGoal = dbRow?.xpRequired ?? def.xpRequired;
    if (dbRow?.unlocked) return `✅ ~~${def.title}~~`;
    if (totalXp >= xpGoal) return `🔓 ${def.title} *(unlocking…)*`;
    return `🔒 ${def.title} — ${xpGoal.toLocaleString()} XP`;
  });

  const half = Math.ceil(milestoneLines.length / 2);
  const col1 = milestoneLines.slice(0, half).join("\n");
  const col2 = milestoneLines.slice(half).join("\n");

  const medals = ["🥇", "🥈", "🥉"];
  const topLine = topUsers.length > 0
    ? topUsers.map((u, i) => `${medals[i]} **${u.displayName}** — ${u.xp.toLocaleString()} XP`).join("\n")
    : "*No one has earned XP yet.*";

  const now = new Date();
  const unixNow = Math.floor(now.getTime() / 1000);

  if (activeMultiplier.multiplier > 1) embedColor = 0xf97316;

  let multiplierLine = "";
  if (activeMultiplier.multiplier > 1) {
    const config = await db.select().from(eventConfigTable).where(eq(eventConfigTable.guildId, guildId));
    const expiresAt = config[0]?.xpMultiplierExpiresAt;
    const expiresPart = expiresAt ? ` — ends <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "";
    multiplierLine = `⚡ **${activeMultiplier.multiplier}x XP MULTIPLIER ACTIVE** — ${activeMultiplier.label ?? "Bonus XP"}${expiresPart}`;
  }

  const description = multiplierLine ? `${multiplierLine}\n\n${progressBlock}` : progressBlock;

  return new EmbedBuilder()
    .setTitle("☀️ 2026 Summer Break Event — Live Progress")
    .setColor(embedColor)
    .setDescription(description)
    .addFields(
      { name: "📋 Milestones (1–5)", value: col1, inline: true },
      { name: "📋 Milestones (6–10)", value: col2, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "🏆 Top 3 Earners", value: topLine, inline: false },
      {
        name: "📊 Event Stats",
        value: `✅ **${unlockedCount} / ${MILESTONE_DEFS.length}** milestones unlocked\n⭐ **${totalXp.toLocaleString()}** total server XP`,
        inline: true,
      },
      { name: "🔄 Last Updated", value: `<t:${unixNow}:T>`, inline: true },
    )
    .setFooter({ text: "Updates every 30 seconds · 2026 Summer Break Event" })
    .setTimestamp(now);
}

async function tick(client: Client): Promise<void> {
  const allConfigs = await db.select().from(eventConfigTable);
  for (const config of allConfigs) {
    if (!config.liveProgressChannelId || !config.liveProgressMessageId) continue;
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(config.liveProgressChannelId) as TextChannel | undefined;
    if (!channel) continue;
    try {
      const message = await channel.messages.fetch(config.liveProgressMessageId);
      const embed = await buildLiveProgressEmbed(config.guildId);
      await message.edit({ embeds: [embed] });
    } catch (err) {
      logger.warn({ err, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined, guildId: config.guildId }, "Live progress embed update failed");
    }
  }
}

export function startLiveProgressUpdater(client: Client): void {
  if (updaterInterval) clearInterval(updaterInterval);
  updaterInterval = setInterval(() => {
    tick(client).catch((err) => logger.error({ err, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, "Live progress tick error"));
  }, UPDATE_INTERVAL_MS);
  logger.info({ intervalMs: UPDATE_INTERVAL_MS }, "Live progress updater started");
}

export function stopLiveProgressUpdater(): void {
  if (updaterInterval) {
    clearInterval(updaterInterval);
    updaterInterval = null;
    logger.info("Live progress updater stopped");
  }
}
