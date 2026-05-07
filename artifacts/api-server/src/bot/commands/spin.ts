import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { levelFromXp, getActiveMultiplier } from "../xp";
import { isEventStarted } from "../eventScheduler";
import { logger } from "../../lib/logger";

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface SpinOutcome {
  emoji: string;
  label: string;
  baseXp: number;
  weight: number;
  color: number;
}

const OUTCOMES: SpinOutcome[] = [
  { emoji: "💀", label: "Skull",   baseXp: 0,    weight: 3,  color: 0x475569 },
  { emoji: "🍋", label: "Lemon",   baseXp: 50,   weight: 5,  color: 0xfde047 },
  { emoji: "🍊", label: "Orange",  baseXp: 100,  weight: 5,  color: 0xfb923c },
  { emoji: "⭐", label: "Star",    baseXp: 200,  weight: 4,  color: 0xfbbf24 },
  { emoji: "💎", label: "Diamond", baseXp: 500,  weight: 2,  color: 0x38bdf8 },
  { emoji: "🎰", label: "JACKPOT", baseXp: 1000, weight: 1,  color: 0xeab308 },
];

const TOTAL_WEIGHT = OUTCOMES.reduce((s, o) => s + o.weight, 0);

function spinWheel(): SpinOutcome {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const outcome of OUTCOMES) {
    roll -= outcome.weight;
    if (roll <= 0) return outcome;
  }
  return OUTCOMES[OUTCOMES.length - 1]!;
}

function buildSlotRow(outcome: SpinOutcome): string {
  // Build a 3-reel display where middle reel shows the real result
  const pool = OUTCOMES.filter((o) => o.emoji !== "💀").map((o) => o.emoji);
  const r = () => pool[Math.floor(Math.random() * pool.length)]!;
  if (outcome.label === "JACKPOT") return `${outcome.emoji} ${outcome.emoji} ${outcome.emoji}`;
  if (outcome.label === "Skull") return `💀 💀 💀`;
  return `${r()} ${outcome.emoji} ${r()}`;
}

export const data = new SlashCommandBuilder()
  .setName("spin")
  .setDescription("🎰 Spin the Summer Break wheel once per day for bonus XP!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const started = await isEventStarted();
  if (!started) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle("⏳ Event Not Started")
          .setDescription("The wheel isn't spinning yet! Use `/countdown` to see when the event begins."),
      ],
    });
    return;
  }

  const userId = interaction.user.id;
  const now = new Date();
  const rows = await db.select().from(xpUsersTable).where(eq(xpUsersTable.userId, userId));
  const user = rows[0];

  if (user?.lastSpinAt) {
    const elapsed = now.getTime() - user.lastSpinAt.getTime();
    if (elapsed < SPIN_COOLDOWN_MS) {
      const nextAt = new Date(user.lastSpinAt.getTime() + SPIN_COOLDOWN_MS);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle("🎰 Wheel Already Spun Today!")
            .setDescription(`You already spun the wheel today!\n\n⏰ Next spin: <t:${Math.floor(nextAt.getTime() / 1000)}:R>`)
            .setFooter({ text: "2026 Summer Break Event" }),
        ],
      });
      return;
    }
  }

  const outcome = spinWheel();
  const { multiplier } = await getActiveMultiplier();
  const xpGained = Math.round(outcome.baseXp * multiplier);
  const multiplierNote = multiplier > 1 ? ` (${outcome.baseXp} × ${multiplier}x multiplier)` : "";

  const member = interaction.guild?.members.cache.get(userId);
  const displayName = member?.displayName ?? interaction.user.username;

  const prevXp = user?.xp ?? 0;
  const newXp = prevXp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > (user?.level ?? 0);

  if (!user) {
    await db.insert(xpUsersTable).values({
      userId,
      username: interaction.user.username,
      displayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 0,
      lastSpinAt: now,
    });
  } else {
    await db.update(xpUsersTable).set({
      xp: newXp,
      level: newLevel,
      lastSpinAt: now,
      displayName,
      username: interaction.user.username,
    }).where(eq(xpUsersTable.userId, userId));
  }

  if (xpGained > 0) {
    const serverRows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
    const newServerXp = (serverRows[0]?.totalXp ?? 0) + xpGained;
    if (serverRows.length === 0) {
      await db.insert(serverXpTable).values({ id: 1, totalXp: newServerXp, updatedAt: now });
    } else {
      await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.id, 1));
    }
  }

  logger.info({ userId, outcome: outcome.label, xpGained }, "Spin command used");

  const slotDisplay = buildSlotRow(outcome);
  const isJackpot = outcome.label === "JACKPOT";
  const isBust = outcome.baseXp === 0;

  let resultText: string;
  if (isJackpot) {
    resultText = `🎉 **JACKPOT!!!** You hit the mother lode!\n\n+**${xpGained.toLocaleString()} XP**${multiplierNote}`;
  } else if (isBust) {
    resultText = "💀 **Busted!** Better luck tomorrow...";
  } else {
    resultText = `**${outcome.emoji} ${outcome.label}!**\n\n+**${xpGained.toLocaleString()} XP**${multiplierNote}`;
  }

  if (leveledUp) resultText += `\n\n⬆️ You leveled up to **Level ${newLevel}**!`;

  const embed = new EmbedBuilder()
    .setColor(outcome.color)
    .setTitle(`🎰 ${isJackpot ? "🎰 🎰  J A C K P O T  🎰 🎰" : "Summer Break Wheel"}`)
    .setDescription(`**[ ${slotDisplay} ]**\n\n${resultText}`)
    .addFields(
      { name: "📊 Total XP", value: newXp.toLocaleString(), inline: true },
      { name: "🎯 Level", value: `${newLevel}`, inline: true },
      { name: "⏰ Next Spin", value: `<t:${Math.floor((now.getTime() + SPIN_COOLDOWN_MS) / 1000)}:R>`, inline: true },
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: "2026 Summer Break Event · Spin once per day" });

  await interaction.editReply({ embeds: [embed] });
}
