import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { isEventStarted } from "../eventScheduler";
import { levelFromXp } from "../xp";
import { logger } from "../../lib/logger";

const TRIVIA_XP = 50;
const TRIVIA_DURATION_MS = 30_000;

interface TriviaQuestion {
  question: string;
  options: [string, string, string, string];
  correct: "A" | "B" | "C" | "D";
  emoji: string;
}

const QUESTIONS: TriviaQuestion[] = [
  { question: "What is the hottest planet in our solar system?", options: ["Mars", "Mercury", "Venus", "Jupiter"], correct: "C", emoji: "🪐" },
  { question: "Which ocean is the largest on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: "D", emoji: "🌊" },
  { question: "What season comes after Summer?", options: ["Winter", "Spring", "Autumn/Fall", "Monsoon"], correct: "C", emoji: "🍂" },
  { question: "Which fruit is known as the 'king of summer fruits'?", options: ["Peach", "Mango", "Watermelon", "Strawberry"], correct: "C", emoji: "🍉" },
  { question: "What SPF stands for in sunscreen?", options: ["Sun Protection Formula", "Sun Power Factor", "Sun Protection Factor", "Solar Protection Frequency"], correct: "C", emoji: "☀️" },
  { question: "How many days are in the month of July?", options: ["28", "29", "30", "31"], correct: "D", emoji: "📅" },
  { question: "What is the most popular ice cream flavor in the US?", options: ["Chocolate", "Strawberry", "Vanilla", "Cookies & Cream"], correct: "C", emoji: "🍦" },
  { question: "Which country invented the bikini?", options: ["USA", "Italy", "France", "Brazil"], correct: "C", emoji: "👙" },
  { question: "What does UV stand for in UV rays?", options: ["Ultra Violet", "Ultra Visible", "Under Violet", "Universal Vision"], correct: "A", emoji: "🌞" },
  { question: "In which month does summer officially start in the Northern Hemisphere?", options: ["May", "June", "July", "August"], correct: "B", emoji: "📆" },
  { question: "What is the temperature at which water boils (Celsius)?", options: ["90°C", "95°C", "100°C", "110°C"], correct: "C", emoji: "🌡️" },
  { question: "Which beach is said to be the most visited in the world?", options: ["Bondi Beach", "Copacabana Beach", "Miami Beach", "Waikiki Beach"], correct: "B", emoji: "🏖️" },
  { question: "What is the chemical symbol for the sun's primary fuel?", options: ["He", "H", "Li", "O"], correct: "B", emoji: "⚗️" },
  { question: "How many hours of daylight does the summer solstice have (in northern regions)?", options: ["12", "14", "16", "18"], correct: "C", emoji: "🌅" },
  { question: "What sport is traditionally played on the beach with a net?", options: ["Volleyball", "Tennis", "Badminton", "Handball"], correct: "A", emoji: "🏐" },
];

export const activeSessions = new Map<string, { correct: string; timeout: ReturnType<typeof setTimeout>; guildId: string }>();

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("Start a summer trivia question! First correct answer wins 50 XP")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const started = await isEventStarted(guildId);
  if (!started) {
    await interaction.editReply("⏳ The event hasn't started yet — trivia is only available during the event!");
    return;
  }

  const channelId = interaction.channelId;
  if (activeSessions.has(channelId)) {
    await interaction.editReply("❌ There's already an active trivia question in this channel! Answer it first.");
    return;
  }

  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const optionLabels = ["A", "B", "C", "D"] as const;

  const embed = new EmbedBuilder()
    .setTitle(`${q.emoji} Summer Trivia!`)
    .setColor(0x6366f1)
    .setDescription(`**${q.question}**\n\nFirst correct answer wins **+${TRIVIA_XP} XP**! You have **30 seconds**!`)
    .addFields(
      { name: "A", value: q.options[0], inline: true },
      { name: "B", value: q.options[1], inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "C", value: q.options[2], inline: true },
      { name: "D", value: q.options[3], inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
    )
    .setFooter({ text: "2026 Summer Break Event · Click the correct answer button!" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    optionLabels.map((label, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${label}_${channelId}`)
        .setLabel(`${label}: ${q.options[i]}`)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });

  const timeout = setTimeout(async () => {
    activeSessions.delete(channelId);
    const expiredEmbed = EmbedBuilder.from(embed)
      .setColor(0xef4444)
      .setTitle(`${q.emoji} Trivia Expired!`)
      .setDescription(`**${q.question}**\n\n⏰ Time's up! Nobody answered in time.\n✅ The correct answer was **${q.correct}: ${q.options[optionLabels.indexOf(q.correct)]}**`);

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      optionLabels.map((label, i) =>
        new ButtonBuilder()
          .setCustomId(`trivia_${label}_${channelId}_done`)
          .setLabel(`${label}: ${q.options[i]}`)
          .setStyle(label === q.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true),
      ),
    );

    await interaction.editReply({ embeds: [expiredEmbed], components: [disabledRow] }).catch(() => {});
  }, TRIVIA_DURATION_MS);

  activeSessions.set(channelId, { correct: q.correct, timeout, guildId });
  logger.info({ guildId, channelId, correct: q.correct }, "Trivia started");
}

export async function handleTriviaButton(
  interaction: ButtonInteraction,
  answer: string,
  channelId: string,
): Promise<void> {
  const session = activeSessions.get(channelId);
  if (!session) {
    await interaction.reply({ content: "This trivia has already ended!", ephemeral: true });
    return;
  }

  const isCorrect = answer === session.correct;

  if (!isCorrect) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setDescription(`❌ **${answer}** is wrong! Keep trying — someone can still get it right.`),
      ],
      ephemeral: true,
    });
    return;
  }

  clearTimeout(session.timeout);
  activeSessions.delete(channelId);

  const guildId = session.guildId;
  const userId = interaction.user.id;
  const now = new Date();

  const rows = await db.select().from(xpUsersTable)
    .where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));
  const user = rows[0];
  const prevXp = user?.xp ?? 0;
  const newXp = prevXp + TRIVIA_XP;
  const newLevel = levelFromXp(newXp);
  const member = interaction.guild?.members.cache.get(userId);
  const displayName = member?.displayName ?? interaction.user.username;

  if (!user) {
    await db.insert(xpUsersTable).values({
      guildId,
      userId,
      username: interaction.user.username,
      displayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 0,
      weeklyXp: TRIVIA_XP,
      weekStartAt: now,
    });
  } else {
    await db.update(xpUsersTable).set({
      xp: newXp,
      level: newLevel,
      weeklyXp: (user.weeklyXp ?? 0) + TRIVIA_XP,
      displayName,
    }).where(and(eq(xpUsersTable.guildId, guildId), eq(xpUsersTable.userId, userId)));
  }

  const serverRows = await db.select().from(serverXpTable).where(eq(serverXpTable.guildId, guildId));
  const newServerXp = (serverRows[0]?.totalXp ?? 0) + TRIVIA_XP;
  if (serverRows.length === 0) {
    await db.insert(serverXpTable).values({ guildId, totalXp: newServerXp, updatedAt: now });
  } else {
    await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.guildId, guildId));
  }

  logger.info({ guildId, userId, answer, xpGained: TRIVIA_XP }, "Trivia answered correctly");

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🎉 Trivia Answered!")
        .setDescription(`✅ <@${userId}> got it right with **${answer}**!\n\n🏆 They earned **+${TRIVIA_XP} XP**! Congrats!`)
        .setFooter({ text: "2026 Summer Break Event" }),
    ],
    components: [],
  });
}
