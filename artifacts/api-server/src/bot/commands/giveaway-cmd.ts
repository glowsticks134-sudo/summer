import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { startGiveaway } from "../giveaway";
import { logger } from "../../lib/logger";
import { replyIfNotStarted } from "../utils";

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("(Admin) Start a custom giveaway in this channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt.setName("prize").setDescription("What are you giving away?").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt.setName("minutes").setDescription("How many minutes the giveaway lasts").setRequired(true).setMinValue(1).setMaxValue(10080),
  )
  .addIntegerOption((opt) =>
    opt.setName("winners").setDescription("Number of winners (default: 1)").setRequired(false).setMinValue(1).setMaxValue(20),
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (await replyIfNotStarted(interaction)) return;

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const prize = interaction.options.getString("prize", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const winnersCount = interaction.options.getInteger("winners") ?? 1;

  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.editReply("❌ Cannot run a giveaway in this channel type.");
    return;
  }

  const durationMs = minutes * 60_000;
  await startGiveaway(client, interaction.channel as TextChannel, { prize, durationMs, winnersCount }, guildId);

  logger.info({ guildId, prize, minutes, winnersCount, adminId: interaction.user.id }, "Admin started giveaway");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Giveaway Started!")
        .addFields(
          { name: "🎁 Prize", value: prize, inline: true },
          { name: "⏱️ Duration", value: `${minutes} minute${minutes !== 1 ? "s" : ""}`, inline: true },
          { name: "🏆 Winners", value: `${winnersCount}`, inline: true },
        )
        .setFooter({ text: `Started by ${interaction.user.username} · 2026 Summer Break Event` }),
    ],
  });
}
