import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { isEventStarted } from "../eventScheduler";
import { levelFromXp } from "../xp";
import { logger } from "../../lib/logger";

const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const STREAK_BREAK_MS = 48 * 60 * 60 * 1000;
const BASE_DAILY_XP = 100;
const STREAK_BONUS_PER_DAY = 15;
const MAX_STREAK_BONUS = 250;

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily Summer Break XP bonus!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const started = await isEventStarted(guildId);
  if (!started) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle("⏳ Event Not Started Yet")
          .setDescription("You can't claim your daily bonus until the event starts!\n\nUse `/countdown` to see how long until it begins."),
      ],
    });
    return;
  }

  const userId = interaction.user.id;
  const now = new Date();

  const rows = await db.select().from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));
  const user = rows[0];

  if (user?.lastDailyAt) {
    const elapsed = now.getTime() - user.lastDailyAt.getTime();
    if (elapsed < DAILY_COOLDOWN_MS) {
      const nextClaimAt = new Date(user.lastDailyAt.getTime() + DAILY_COOLDOWN_MS);
      const unixTs = Math.floor(nextClaimAt.getTime() / 1000);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle("⏰ Already Claimed!")
            .setDescription(`You already claimed your daily bonus today!\n\n🕐 Next claim available: <t:${unixTs}:R>`)
            .addFields({ name: "🔥 Current Streak", value: `${user.dailyStreak} day${user.dailyStreak !== 1 ? "s" : ""}`, inline: true })
            .setFooter({ text: "2026 Summer Break Event" }),
        ],
      });
      return;
    }
  }

  let newStreak = 1;
  if (user?.lastDailyAt) {
    const elapsed = now.getTime() - user.lastDailyAt.getTime();
    newStreak = elapsed < STREAK_BREAK_MS ? (user.dailyStreak ?? 0) + 1 : 1;
  }

  const streakBonus = Math.min((newStreak - 1) * STREAK_BONUS_PER_DAY, MAX_STREAK_BONUS);
  const xpGained = BASE_DAILY_XP + streakBonus;
  const prevXp = user?.xp ?? 0;
  const newXp = prevXp + xpGained;
  const newLevel = levelFromXp(newXp);

  const member = interaction.guild?.members.cache.get(userId);
  const displayName = member?.displayName ?? interaction.user.username;

  if (!user) {
    await db.insert(xpUsersTable).values({
      guildId,
      userId,
      username: interaction.user.username,
      displayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 0,
      lastDailyAt: now,
      dailyStreak: newStreak,
      weeklyXp: xpGained,
      weekStartAt: now,
    });
  } else {
    const weeklyXp = computeWeeklyXp(user, xpGained, now);
    await db.update(xpUsersTable).set({
      xp: newXp,
      level: newLevel,
      lastDailyAt: now,
      dailyStreak: newStreak,
      displayName,
      weeklyXp: weeklyXp.amount,
      weekStartAt: weeklyXp.startAt,
    }).where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));
  }

  const serverRows = await db.select().from(serverXpTable).where(eq(serverXpTable.guildId, guildId));
  const newServerXp = (serverRows[0]?.totalXp ?? 0) + xpGained;
  if (serverRows.length === 0) {
    await db.insert(serverXpTable).values({ guildId, totalXp: newServerXp, updatedAt: now });
  } else {
    await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.guildId, guildId));
  }

  logger.info({ guildId, userId, xpGained, newStreak }, "Daily XP claimed");

  const streakEmoji = newStreak >= 30 ? "🏆" : newStreak >= 14 ? "🔥" : newStreak >= 7 ? "⭐" : "✨";
  const milestoneText = newStreak === 7 ? "\n🎉 **7-day streak milestone!**"
    : newStreak === 14 ? "\n🎉 **2-week streak milestone!**"
    : newStreak === 30 ? "\n🏆 **30-day streak LEGEND!**"
    : "";

  const embed = new EmbedBuilder()
    .setTitle("☀️ Daily Bonus Claimed!")
    .setColor(0x22c55e)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription(`You claimed your daily Summer Break bonus!${milestoneText}`)
    .addFields(
      { name: "⭐ XP Earned", value: `+**${xpGained}** XP${streakBonus > 0 ? ` (${BASE_DAILY_XP} base + ${streakBonus} streak bonus)` : ""}`, inline: false },
      { name: `${streakEmoji} Streak`, value: `**${newStreak}** day${newStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "📊 Total XP", value: `${newXp.toLocaleString()}`, inline: true },
      { name: "🎯 Next Bonus", value: "<t:" + Math.floor((now.getTime() + DAILY_COOLDOWN_MS) / 1000) + ":R>", inline: true },
    )
    .setFooter({ text: "Streak breaks if you miss 48 hours · 2026 Summer Break Event" });

  await interaction.editReply({ embeds: [embed] });
}

function computeWeeklyXp(user: { weeklyXp: number; weekStartAt: Date | null }, xpGained: number, now: Date) {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  if (!user.weekStartAt || now.getTime() - user.weekStartAt.getTime() > WEEK_MS) {
    return { amount: xpGained, startAt: now };
  }
  return { amount: (user.weeklyXp ?? 0) + xpGained, startAt: user.weekStartAt };
}
