import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { levelFromXp } from "../xp";
import { replyIfNotStarted } from "../utils";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View the Summer Break Event XP leaderboard")
  .addIntegerOption((opt) =>
    opt.setName("page").setDescription("Page number").setRequired(false).setMinValue(1),
  );

const PAGE_SIZE = 10;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (await replyIfNotStarted(interaction)) return;

  const page = (interaction.options.getInteger("page") ?? 1) - 1;
  const offset = page * PAGE_SIZE;

  const users = await db
    .select()
    .from(xpUsersTable)
    .orderBy(desc(xpUsersTable.xp))
    .limit(PAGE_SIZE + offset);

  const pageUsers = users.slice(offset, offset + PAGE_SIZE);

  if (pageUsers.length === 0) {
    await interaction.editReply("No participants yet! Be the first to chat and earn XP. 🏖️");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const rows = pageUsers.map((u, i) => {
    const globalRank = offset + i + 1;
    const medal = globalRank <= 3 ? medals[globalRank - 1] : `**#${globalRank}**`;
    const level = levelFromXp(u.xp);
    return `${medal} **${u.displayName}** — ⭐ ${u.xp.toLocaleString()} XP · Lv.${level}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🏆 Summer Break Event Leaderboard")
    .setColor(0xf59e0b)
    .setDescription(rows.join("\n"))
    .setFooter({ text: `Page ${page + 1} · 2026 Summer Break Event` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
