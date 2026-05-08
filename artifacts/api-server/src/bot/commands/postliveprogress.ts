import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { upsertEventConfig } from "../eventScheduler";
import { buildLiveProgressEmbed } from "../liveProgress";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postliveprogress")
  .setDescription("(Admin) Post the live-updating server progress tracker embed in a channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel to post it in (defaults to current channel)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const channelOpt = interaction.options.getChannel("channel") as TextChannel | null;
  const targetChannel: TextChannel | null =
    channelOpt ??
    (interaction.channel && "send" in interaction.channel ? (interaction.channel as TextChannel) : null);

  if (!targetChannel) {
    await interaction.editReply("❌ Could not find a valid text channel to post in.");
    return;
  }

  const embed = await buildLiveProgressEmbed(guildId);
  const msg = await targetChannel.send({ embeds: [embed] });

  try {
    await msg.pin();
  } catch {
    // non-critical — bot may lack pin perms
  }

  await upsertEventConfig(guildId, { liveProgressChannelId: targetChannel.id, liveProgressMessageId: msg.id });

  logger.info({ guildId, channelId: targetChannel.id, messageId: msg.id }, "Live progress embed posted");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Live Progress Tracker Posted")
        .setDescription(
          `The tracker has been posted in <#${targetChannel.id}> and will auto-update every **30 seconds**.\n\n` +
          "Run this command again in a different channel to move it.",
        )
        .setFooter({ text: "2026 Summer Break Event" }),
    ],
  });
}
