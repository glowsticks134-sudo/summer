import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getEventConfig } from "../eventScheduler";
import { MILESTONE_DEFS } from "../milestones";

export const data = new SlashCommandBuilder()
  .setName("eventinfo")
  .setDescription("View everything about the 2026 Summer Break Event");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const config = await getEventConfig(guildId);
  const started = config?.started ?? false;
  const startsAt = config?.startsAt;
  const unixTs = startsAt ? Math.floor(startsAt.getTime() / 1000) : null;

  const statusLine = started
    ? "🟢 **Status:** LIVE — start earning XP now!"
    : unixTs
    ? `🟡 **Status:** Starting <t:${unixTs}:R> (<t:${unixTs}:F>)`
    : "🔴 **Status:** Not started — stay tuned!";

  const milestoneList = MILESTONE_DEFS.map(
    (m) => `\`${m.xpRequired.toLocaleString()} XP\` — ${m.title}`,
  ).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏖️ 2026 Summer Break Event — Full Guide")
    .setColor(0xfbbf24)
    .setDescription(
      `${statusLine}\n\n` +
      "Welcome to the **2026 Summer Break Event** — a server-wide XP event where the whole community levels up together. " +
      "Chat, claim daily bonuses, and unlock rewards for everyone!",
    )
    .addFields(
      {
        name: "⭐ How to Earn XP",
        value:
          "• **Messages** — 50 XP per message (30s cooldown)\n" +
          "• **Daily Bonus** — 100 XP base, up to +250 streak bonus\n" +
          "• **Trivia** — 50 XP for correct answers\n" +
          "• **Spin** — daily wheel spin for bonus XP\n" +
          "• **Shoutout** — give a member +75 XP (1h cooldown)\n" +
          "• **Early Sign-Up Bonus** — 150 XP at event start",
        inline: false,
      },
      {
        name: "🏆 Slash Commands",
        value:
          "`/rank` — your XP, level & rank\n" +
          "`/leaderboard` — all-time top earners\n" +
          "`/weekly` — this week's top earners\n" +
          "`/daily` — claim your daily XP bonus\n" +
          "`/streak` — view your daily streak\n" +
          "`/spin` — daily lucky wheel spin\n" +
          "`/shoutout` — shout out a member\n" +
          "`/countdown` — time until event starts\n" +
          "`/serverprogress` — server milestone tracker\n" +
          "`/trivia` — answer a summer trivia question\n" +
          "`/eventinfo` — this guide",
        inline: false,
      },
      {
        name: "🎯 Server Milestones (Unlock Rewards for Everyone!)",
        value: milestoneList,
        inline: false,
      },
      {
        name: "📜 Rules",
        value:
          "• No spam or bot abuse — XP has a 30s per-message cooldown\n" +
          "• All participants automatically get the **2026 Summer Break Event** role\n" +
          "• Milestone rewards are server-wide — everyone benefits!\n" +
          "• Have fun and enjoy the summer! 🌞",
        inline: false,
      },
    )
    .setFooter({ text: "2026 Summer Break Event · Use /countdown to check the start time" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
