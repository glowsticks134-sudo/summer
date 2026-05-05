import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { isEventStarted, getEventConfig, formatCountdown } from "./eventScheduler";

export async function replyIfNotStarted(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const started = await isEventStarted();
  if (started) return false;

  const config = await getEventConfig();
  const startsAt = config?.startsAt;
  const unixTs = startsAt ? Math.floor(startsAt.getTime() / 1000) : null;
  const msLeft = startsAt ? startsAt.getTime() - Date.now() : null;

  const timeField = unixTs && msLeft && msLeft > 0
    ? `⏰ **Starts:** <t:${unixTs}:F>\n⌛ **Time left:** <t:${unixTs}:R> (${formatCountdown(msLeft)})`
    : "📅 The start time hasn't been announced yet — stay tuned!";

  const embed = new EmbedBuilder()
    .setTitle("⏳ Event Not Started Yet")
    .setColor(0x3b82f6)
    .setDescription(
      "This command is only available once the **2026 Summer Break Event** begins!\n\n" +
      timeField +
      "\n\n💡 Use `/countdown` to check the timer or `/eventinfo` for event details.",
    )
    .setFooter({ text: "2026 Summer Break Event" });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return true;
}
