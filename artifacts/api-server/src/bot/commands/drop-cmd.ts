import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { startQuickDrop } from "../quickdrop";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("(Admin) Trigger a Quick Drop event in this channel — first to react wins!")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt.setName("prize").setDescription("What does the winner get?").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt.setName("seconds").setDescription("How many seconds to claim it (default: 60)").setRequired(false).setMinValue(10).setMaxValue(600),
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const prize = interaction.options.getString("prize", true);
  const seconds = interaction.options.getInteger("seconds") ?? 60;
  const durationMs = seconds * 1000;

  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.editReply("❌ Cannot run a quick drop in this channel type.");
    return;
  }

  await startQuickDrop(client, interaction.channel as TextChannel, { prize, durationMs });

  logger.info({ prize, seconds, adminId: interaction.user.id }, "Admin triggered quick drop");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Quick Drop Triggered!")
        .addFields(
          { name: "⚡ Prize", value: prize, inline: true },
          { name: "⏱️ Duration", value: `${seconds} second${seconds !== 1 ? "s" : ""}`, inline: true },
        )
        .setFooter({ text: `Started by ${interaction.user.username} · 2026 Summer Break Event` }),
    ],
  });
}
