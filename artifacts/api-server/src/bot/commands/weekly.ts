import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable } from "@workspace/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { replyIfNotStarted } from "../utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("weekly")
  .setDescription("View the Summer Break Event weekly XP leaderboard");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (await replyIfNotStarted(interaction)) return;

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const allUsers = await db
    .select()
    .from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), gt(xpUsersTable.weekStartAt, weekAgo)));

  const activeUsers = allUsers
    .filter((u) => u.weeklyXp > 0)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, 10);

  if (activeUsers.length === 0) {
    await interaction.editReply(
      "No weekly XP data yet! Use `/daily` and keep chatting to earn weekly XP. 🏖️",
    );
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const rows = activeUsers.map((u, i) => {
    const medal = i < 3 ? medals[i] : `**#${i + 1}**`;
    return `${medal} **${u.displayName}** — ⭐ ${u.weeklyXp.toLocaleString()} XP this week`;
  });

  const nextMonday = getNextMonday();
  const resetTs = Math.floor(nextMonday.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle("📅 Weekly Leaderboard")
    .setColor(0x8b5cf6)
    .setDescription(rows.join("\n"))
    .addFields({ name: "🔄 Weekly Reset", value: `<t:${resetTs}:R> (<t:${resetTs}:F>)`, inline: false })
    .setFooter({ text: "2026 Summer Break Event · XP from messages + daily bonuses" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
