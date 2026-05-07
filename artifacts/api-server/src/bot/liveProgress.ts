import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { db } from "@workspace/db";
import { serverXpTable, milestonesTable, eventConfigTable, xpUsersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { MILESTONE_DEFS } from "./milestones";
import { getActiveMultiplier } from "./xp";
import { logger } from "../lib/logger";

const UPDATE_INTERVAL_MS = 30_000;
let updaterInterval: ReturnType<typeof setInterval> | null = null;

function buildProgressBar(current: number, target: number, length = 20): string {
  const pct = Math.min(1, current / target);
  const filled = Math.round(pct * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export async function buildLiveProgressEmbed(): Promise<EmbedBuilder> {
  const [serverXpRows, milestoneRows, topUsers, activeMultiplier] = await Promise.all([
    db.select().from(serverXpTable).where(eq(serverXpTable.id, 1)),
    db.select().from(milestonesTable),
    db.select().from(xpUsersTable).orderBy(desc(xpUsersTable.xp)).limit(3),
    getActiveMultiplier(),
  ]);

  const totalXp = serverXpRows[0]?.totalXp ?? 0;
  const milestoneMap = new Map(milestoneRows.map((m) => [m.id, m]));

  const unlockedCount = milestoneRows.filter((m) => m.unlocked).length;
  const nextMilestoneDef = MILESTONE_DEFS.find((m) => !(milestoneMap.get(m.id)?.unlocked));

  // Progress bar toward next milestone
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

    // Color shifts from gold → green as progress climbs
    if (pct >= 75) embedColor = 0x22c55e;
    else if (pct >= 40) embedColor = 0x84cc16;
  } else {
    progressBlock = "🏆 **ALL MILESTONES COMPLETED!** 🏆\n⭐ **" + totalXp.toLocaleString() + " XP** earned — incredible work!";
    embedColor = 0xeab308;
  }

  // Milestone list — split into two columns if all 10
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

  // Top 3 leaderboard
  const medals = ["🥇", "🥈", "🥉"];
  const topLine = topUsers.length > 0
    ? topUsers.map((u, i) => `${medals[i]} **${u.displayName}** — ${u.xp.toLocaleString()} XP`).join("\n")
    : "*No one has earned XP yet.*";

  const now = new Date();
  const unixNow = Math.floor(now.getTime() / 1000);

  // Multiplier banner
  let multiplierLine = "";
  if (activeMultiplier.multiplier > 1) {
    const config = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
    const expiresAt = config[0]?.xpMultiplierExpiresAt;
    const expiresPart = expiresAt ? ` — ends <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "";
    multiplierLine = `⚡ **${activeMultiplier.multiplier}x XP MULTIPLIER ACTIVE** — ${activeMultiplier.label ?? "Bonus XP"}${expiresPart}`;
    if (activeMultiplier.multiplier > 1) embedColor = 0xf97316;
  }

  const description = multiplierLine
    ? `${multiplierLine}\n\n${progressBlock}`
    : progressBlock;

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
        value:
          `✅ **${unlockedCount} / ${MILESTONE_DEFS.length}** milestones unlocked\n` +
          `⭐ **${totalXp.toLocaleString()}** total server XP`,
        inline: true,
      },
      { name: "🔄 Last Updated", value: `<t:${unixNow}:T>`, inline: true },
    )
    .setFooter({ text: "Updates every 30 seconds · 2026 Summer Break Event" })
    .setTimestamp(now);
}

async function tick(client: Client): Promise<void> {
  const configRows = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  const config = configRows[0];
  if (!config?.liveProgressChannelId || !config.liveProgressMessageId) return;

  const guildId = process.env["DISCORD_GUILD_ID"];
  if (!guildId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(config.liveProgressChannelId) as TextChannel | undefined;
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(config.liveProgressMessageId);
    const embed = await buildLiveProgressEmbed();
    await message.edit({ embeds: [embed] });
  } catch (err) {
    logger.warn({ err }, "Live progress embed update failed — message may have been deleted");
  }
}

export function startLiveProgressUpdater(client: Client): void {
  if (updaterInterval) {
    clearInterval(updaterInterval);
  }
  updaterInterval = setInterval(() => {
    tick(client).catch((err) => logger.error({ err }, "Live progress tick error"));
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
