import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("(Admin) Post a formatted announcement embed as the bot")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((opt) =>
    opt.setName("title").setDescription("Announcement title").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("message").setDescription("Announcement body text").setRequired(true),
  )
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to post in (defaults to current channel)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("color")
      .setDescription("Embed color")
      .setRequired(false)
      .addChoices(
        { name: "🟡 Gold (default)", value: "gold" },
        { name: "🟢 Green", value: "green" },
        { name: "🔴 Red", value: "red" },
        { name: "🔵 Blue", value: "blue" },
        { name: "🟣 Purple", value: "purple" },
        { name: "⚫ Dark", value: "dark" },
      ),
  )
  .addBooleanOption((opt) =>
    opt.setName("ping").setDescription("Ping @everyone with the announcement?").setRequired(false),
  );

const COLOR_MAP: Record<string, number> = {
  gold: 0xfbbf24,
  green: 0x22c55e,
  red: 0xef4444,
  blue: 0x3b82f6,
  purple: 0x8b5cf6,
  dark: 0x1e293b,
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);
  const colorKey = interaction.options.getString("color") ?? "gold";
  const ping = interaction.options.getBoolean("ping") ?? false;
  const channelOption = interaction.options.getChannel("channel") as TextChannel | null;

  const targetChannel = (channelOption as TextChannel | null) ??
    (interaction.channel && "send" in interaction.channel ? interaction.channel as TextChannel : null);

  if (!targetChannel) {
    await interaction.editReply("❌ Could not find a valid text channel to post in.");
    return;
  }

  const color = COLOR_MAP[colorKey] ?? COLOR_MAP["gold"]!;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📢 ${title}`)
    .setDescription(message)
    .setFooter({ text: "2026 Summer Break Event" })
    .setTimestamp();

  const content = ping ? "@everyone" : undefined;

  await targetChannel.send({ content, embeds: [embed] });

  logger.info({ adminId: interaction.user.id, title, channelId: targetChannel.id }, "Admin announcement posted");

  await interaction.editReply(`✅ Announcement posted in <#${targetChannel.id}>!`);
}
