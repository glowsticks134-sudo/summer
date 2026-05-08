import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable } from "@workspace/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { levelFromXp } from "../xp";
import { replyIfNotStarted } from "../utils";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Check your XP rank in the Summer Break Event")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("User to check (defaults to yourself)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (await replyIfNotStarted(interaction)) return;

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const target = interaction.options.getUser("user") ?? interaction.user;

  const rows = await db
    .select()
    .from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, target.id)));

  if (rows.length === 0) {
    await interaction.editReply(
      `${target.id === interaction.user.id ? "You haven't" : `<@${target.id}> hasn't`} earned any XP yet. Start chatting to get on the board! 🏖️`,
    );
    return;
  }

  const user = rows[0];
  const level = levelFromXp(user.xp);
  const xpToNextLevel = getXpToNextLevel(user.xp);
  const xpInCurrentLevel = getXpInCurrentLevel(user.xp);
  const levelProgress = xpInCurrentLevel + xpToNextLevel > 0
    ? Math.round((xpInCurrentLevel / (xpInCurrentLevel + xpToNextLevel)) * 100)
    : 0;

  const higherCount = await db
    .select()
    .from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), gt(xpUsersTable.xp, user.xp)));

  const rank = higherCount.length + 1;
  const progressBar = buildProgressBar(levelProgress);

  const embed = new EmbedBuilder()
    .setTitle(`☀️ ${user.displayName}'s Summer Rank`)
    .setColor(0xfbbf24)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "🏅 Rank", value: `#${rank}`, inline: true },
      { name: "📊 Level", value: `${level}`, inline: true },
      { name: "⭐ Total XP", value: `${user.xp.toLocaleString()}`, inline: true },
      { name: "💬 Messages", value: `${user.totalMessages.toLocaleString()}`, inline: true },
      {
        name: `Progress to Level ${level + 1}`,
        value: `${progressBar} ${levelProgress}%\n${xpInCurrentLevel.toLocaleString()} / ${(xpInCurrentLevel + xpToNextLevel).toLocaleString()} XP`,
        inline: false,
      },
    )
    .setFooter({ text: "2026 Summer Break Event" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function getXpToNextLevel(totalXp: number): number {
  let xp = totalXp;
  let level = 0;
  while (xp >= 100 * (level + 1) * (level + 2)) {
    xp -= 100 * (level + 1) * (level + 2);
    level++;
  }
  return 100 * (level + 1) * (level + 2) - xp;
}

function getXpInCurrentLevel(totalXp: number): number {
  let xp = totalXp;
  let level = 0;
  while (xp >= 100 * (level + 1) * (level + 2)) {
    xp -= 100 * (level + 1) * (level + 2);
    level++;
  }
  return xp;
}

function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}
