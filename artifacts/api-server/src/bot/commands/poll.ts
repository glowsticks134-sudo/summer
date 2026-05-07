import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../../lib/logger";

const OPTION_EMOJIS = ["🇦", "🇧", "🇨", "🇩"];

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Create a reaction poll for the server")
  .addStringOption((opt) =>
    opt.setName("question").setDescription("The question to ask").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("option_a").setDescription("First option").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("option_b").setDescription("Second option").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("option_c").setDescription("Third option (optional)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("option_d").setDescription("Fourth option (optional)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const question = interaction.options.getString("question", true);
  const optionA = interaction.options.getString("option_a", true);
  const optionB = interaction.options.getString("option_b", true);
  const optionC = interaction.options.getString("option_c");
  const optionD = interaction.options.getString("option_d");

  const options: string[] = [optionA, optionB];
  if (optionC) options.push(optionC);
  if (optionD) options.push(optionD);

  const optionLines = options
    .map((opt, i) => `${OPTION_EMOJIS[i]} **${opt}**`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x818cf8)
    .setTitle(`📊 ${question}`)
    .setDescription(optionLines + "\n\nReact below to cast your vote!")
    .setFooter({
      text: `Poll by ${interaction.user.displayName} · 2026 Summer Break Event`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.editReply("❌ Cannot post a poll in this channel type.");
    return;
  }

  const pollMsg = await interaction.channel.send({ embeds: [embed] });

  for (let i = 0; i < options.length; i++) {
    try {
      await pollMsg.react(OPTION_EMOJIS[i]!);
    } catch (err) {
      logger.warn({ err, emoji: OPTION_EMOJIS[i] }, "Failed to add poll reaction");
    }
  }

  logger.info({ userId: interaction.user.id, question, options }, "Poll created");

  await interaction.editReply("✅ Poll posted!");
}
