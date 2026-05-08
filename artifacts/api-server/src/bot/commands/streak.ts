import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { replyIfNotStarted } from "../utils";

const BASE_DAILY_XP = 100;
const STREAK_BONUS_PER_DAY = 15;
const MAX_STREAK_BONUS = 250;
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const STREAK_BREAK_MS = 48 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("streak")
  .setDescription("View your daily claim streak and upcoming bonus")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("User to check (defaults to yourself)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (await replyIfNotStarted(interaction)) return;

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const target = interaction.options.getUser("user") ?? interaction.user;
  const rows = await db.select().from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, target.id)));
  const user = rows[0];

  if (!user || user.dailyStreak === 0) {
    const isSelf = target.id === interaction.user.id;
    await interaction.editReply(
      isSelf
        ? "You haven't started a streak yet! Use `/daily` to claim your first bonus. 🏖️"
        : `<@${target.id}> hasn't claimed any daily bonuses yet.`,
    );
    return;
  }

  const now = Date.now();
  const streakBroken = user.lastDailyAt
    ? now - user.lastDailyAt.getTime() > STREAK_BREAK_MS
    : true;

  const streak = streakBroken ? 0 : user.dailyStreak;
  const canClaim = !user.lastDailyAt || now - user.lastDailyAt.getTime() >= DAILY_COOLDOWN_MS;
  const nextBonus = BASE_DAILY_XP + Math.min(streak * STREAK_BONUS_PER_DAY, MAX_STREAK_BONUS);

  const nextClaimTs = user.lastDailyAt
    ? Math.floor((user.lastDailyAt.getTime() + DAILY_COOLDOWN_MS) / 1000)
    : null;

  const streakBar = buildStreakBar(streak);
  const streakEmoji = streak >= 30 ? "🏆" : streak >= 14 ? "🔥" : streak >= 7 ? "⭐" : "✨";

  const embed = new EmbedBuilder()
    .setTitle(`${streakEmoji} ${target.username}'s Daily Streak`)
    .setColor(streakBroken ? 0xef4444 : streak >= 7 ? 0xf97316 : 0xfbbf24)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(streakBroken ? "⚠️ **Streak broken!** Claim your daily to start a new one." : streakBar)
    .addFields(
      { name: `${streakEmoji} Current Streak`, value: streakBroken ? "0 days (broken)" : `**${streak}** day${streak !== 1 ? "s" : ""}`, inline: true },
      { name: "⭐ Next Daily Reward", value: `**+${nextBonus} XP**`, inline: true },
      {
        name: "🕐 Claim Status",
        value: canClaim
          ? "✅ Ready to claim! Use `/daily`"
          : `⏰ <t:${nextClaimTs}:R>`,
        inline: false,
      },
    )
    .addFields(
      { name: "🎯 Streak Milestones", value: "7 days → +105 bonus XP\n14 days → +195 bonus XP\n20+ days → +300 bonus XP (max)", inline: false },
    )
    .setFooter({ text: "2026 Summer Break Event · Streak breaks if you miss 48 hours" });

  await interaction.editReply({ embeds: [embed] });
}

function buildStreakBar(streak: number): string {
  const milestones = [7, 14, 21, 30];
  const nextMilestone = milestones.find((m) => m > streak) ?? 30;
  const progress = Math.round((streak / nextMilestone) * 10);
  const bar = "🔥".repeat(Math.min(progress, 10)) + "▱".repeat(Math.max(0, 10 - progress));
  return `${bar}\n${streak} / ${nextMilestone} days to next milestone`;
}
