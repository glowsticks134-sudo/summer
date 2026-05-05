import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { db } from "@workspace/db";
import { eventConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { scheduleEventStart, formatCountdown } from "../eventScheduler";
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
    const found =
      interaction.guild.channels.cache.find(
        (c) => c.id === channelInput || c.name === channelInput.replace("#", ""),
      );
    announcementChannelId = found?.id ?? null;
  }
  if (!announcementChannelId && interaction.channelId) {
    announcementChannelId = interaction.channelId;
  }

  const existing = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  if (existing.length === 0) {
    await db.insert(eventConfigTable).values({
      id: 1,
      startsAt,
      started: false,
      announcementChannelId,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(eventConfigTable)
      .set({ startsAt, started: false, announcementChannelId, updatedAt: new Date() })
      .where(eq(eventConfigTable.id, 1));
  }

  await scheduleEventStart(client);

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

  logger.info({ startsAt, announcementChannelId }, "Event start time configured");
  await interaction.editReply({ embeds: [embed] });
}
