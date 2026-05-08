import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { eventConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { upsertEventConfig, getEventConfig } from "../eventScheduler";
import { logger } from "../../lib/logger";

const multiplierTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const data = new SlashCommandBuilder()
  .setName("setmultiplier")
  .setDescription("(Admin) Activate a temporary XP multiplier for a set duration")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addNumberOption((opt) =>
    opt
      .setName("multiplier")
      .setDescription("XP multiplier (e.g. 2 = double XP, 1.5 = 50% bonus)")
      .setRequired(true)
      .setMinValue(1.1)
      .setMaxValue(10),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("duration_minutes")
      .setDescription("How many minutes the multiplier lasts")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1440),
  )
  .addStringOption((opt) =>
    opt
      .setName("label")
      .setDescription('Label shown in announcements (e.g. "Double XP Sunday", "Weekend Bonus")')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const multiplier = interaction.options.getNumber("multiplier", true);
  const durationMinutes = interaction.options.getInteger("duration_minutes", true);
  const label = interaction.options.getString("label") ?? `${multiplier}x XP Event`;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  await upsertEventConfig(guildId, {
    xpMultiplier: multiplier,
    xpMultiplierExpiresAt: expiresAt,
    xpMultiplierLabel: label,
  });

  logger.info({ guildId, multiplier, durationMinutes, label, expiresAt }, "XP multiplier activated");

  await announceMultiplierStart(client, guildId, multiplier, label, expiresAt);
  scheduleMultiplierEnd(client, guildId, label, durationMinutes * 60 * 1000);

  const expiresUnix = Math.floor(expiresAt.getTime() / 1000);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf97316)
        .setTitle("⚡ XP Multiplier Activated!")
        .addFields(
          { name: "🔢 Multiplier", value: `**${multiplier}x**`, inline: true },
          { name: "🏷️ Label", value: label, inline: true },
          { name: "⏰ Expires", value: `<t:${expiresUnix}:R>`, inline: true },
        )
        .setFooter({ text: "2026 Summer Break Event" }),
    ],
  });
}

async function announceMultiplierStart(client: Client, guildId: string, multiplier: number, label: string, expiresAt: Date): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const config = await getEventConfig(guildId);
  const channelId = config?.announcementChannelId;
  const channel = (channelId ? guild.channels.cache.get(channelId) : null) as TextChannel | null
    ?? guild.channels.cache.find((c) => ["announcements", "general", "summer-lounge"].includes(c.name) && "send" in c) as TextChannel | null;

  if (!channel) return;

  const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`⚡ ${label} — XP MULTIPLIER IS LIVE!`)
    .setDescription(
      `All XP earned from messages is now multiplied by **${multiplier}x**!\n\n` +
      `🗣️ Start chatting to take advantage of the boost!\n` +
      `⏰ Ends <t:${expiresUnix}:R> (<t:${expiresUnix}:T>)`,
    )
    .setFooter({ text: "2026 Summer Break Event" })
    .setTimestamp();

  await channel.send({ content: "@everyone", embeds: [embed] }).catch(() => {});
}

export function scheduleMultiplierEnd(client: Client, guildId: string, label: string, durationMs: number): void {
  const existing = multiplierTimers.get(guildId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    multiplierTimers.delete(guildId);

    await upsertEventConfig(guildId, {
      xpMultiplier: 1,
      xpMultiplierExpiresAt: null,
      xpMultiplierLabel: null,
    }).catch(() => {});

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const config = await getEventConfig(guildId);
    const channelId = config?.announcementChannelId;
    const channel = (channelId ? guild.channels.cache.get(channelId) : null) as TextChannel | null
      ?? guild.channels.cache.find((c) => ["announcements", "general", "summer-lounge"].includes(c.name) && "send" in c) as TextChannel | null;

    if (!channel) return;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x64748b)
          .setTitle("⚡ XP Multiplier Ended")
          .setDescription(`The **${label}** XP multiplier has expired. XP is back to normal. Keep grinding! ☀️`)
          .setFooter({ text: "2026 Summer Break Event" })
          .setTimestamp(),
      ],
    }).catch(() => {});

    logger.info({ guildId, label }, "XP multiplier expired and reset");
  }, durationMs);

  multiplierTimers.set(guildId, timer);
}
