import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { upsertEventConfig, scheduleEventStart, formatCountdown } from "../eventScheduler";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("seteventstart")
  .setDescription("(Admin) Set the Summer Break Event start time")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt
      .setName("datetime")
      .setDescription('ISO date/time or "now" — e.g. 2026-07-01T18:00:00 or "now"')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel ID or name to send the start announcement in")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const input = interaction.options.getString("datetime", true).trim();
  const channelInput = interaction.options.getString("channel");

  let startsAt: Date;
  if (input.toLowerCase() === "now") {
    startsAt = new Date(Date.now() + 5000);
  } else {
    startsAt = new Date(input);
    if (isNaN(startsAt.getTime())) {
      await interaction.editReply('❌ Invalid date format. Use ISO format like `2026-07-01T18:00:00` or `"now"`.');
      return;
    }
  }

  let announcementChannelId: string | null = null;
  if (channelInput && interaction.guild) {
    const found = interaction.guild.channels.cache.find(
      (c) => c.id === channelInput || c.name === channelInput.replace("#", ""),
    );
    announcementChannelId = found?.id ?? null;
  }
  if (!announcementChannelId && interaction.channelId) {
    announcementChannelId = interaction.channelId;
  }

  await upsertEventConfig(guildId, { startsAt, started: false, announcementChannelId });
  await scheduleEventStart(client, guildId);

  const msUntil = startsAt.getTime() - Date.now();
  const countdown = msUntil > 0 ? formatCountdown(msUntil) : "starting now";

  const embed = new EmbedBuilder()
    .setTitle("✅ Event Start Time Set")
    .setColor(0x22c55e)
    .addFields(
      { name: "🕐 Starts At", value: `<t:${Math.floor(startsAt.getTime() / 1000)}:F>`, inline: true },
      { name: "⏱️ Countdown", value: countdown, inline: true },
      { name: "📢 Channel", value: announcementChannelId ? `<#${announcementChannelId}>` : "Not set", inline: true },
    )
    .setFooter({ text: "2026 Summer Break Event" });

  logger.info({ guildId, startsAt, announcementChannelId }, "Event start time configured");
  await interaction.editReply({ embeds: [embed] });
}
