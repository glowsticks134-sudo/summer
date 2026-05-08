import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getEventConfig, formatCountdown } from "../eventScheduler";

export const data = new SlashCommandBuilder()
  .setName("countdown")
  .setDescription("Check how long until the Summer Break Event starts");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const config = await getEventConfig(guildId);

  if (!config || !config.startsAt) {
    await interaction.editReply("📅 The event start time hasn't been set yet. Stay tuned! 🏖️");
    return;
  }

  if (config.started) {
    const embed = new EmbedBuilder()
      .setTitle("☀️ The Event Is LIVE!")
      .setColor(0xfbbf24)
      .setDescription("The 2026 Summer Break Event has already started! Start chatting to earn XP. 🏄\n\nUse **/rank** to see your progress!")
      .setFooter({ text: "2026 Summer Break Event" })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const msUntil = config.startsAt.getTime() - Date.now();
  if (msUntil <= 0) {
    await interaction.editReply("🎉 The event is starting any moment now!");
    return;
  }

  const unixTimestamp = Math.floor(config.startsAt.getTime() / 1000);
  const timeLeft = formatCountdown(msUntil);

  const embed = new EmbedBuilder()
    .setTitle("⏳ Summer Break Event Countdown")
    .setColor(0x3b82f6)
    .setDescription(`The event starts **${timeLeft}** from now!\n\n⬇️ Sign up early to get a **150 XP head start** when it begins!`)
    .addFields(
      { name: "🗓️ Start Time", value: `<t:${unixTimestamp}:F>`, inline: true },
      { name: "⏱️ Time Left", value: `<t:${unixTimestamp}:R>`, inline: true },
    )
    .setFooter({ text: "2026 Summer Break Event · Use /signup to register early" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
