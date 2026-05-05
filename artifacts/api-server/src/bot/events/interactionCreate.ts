import type { Interaction, Client, ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { db } from "@workspace/db";
import { eventSignupsTable, eventConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import * as rankCommand from "../commands/rank";
import * as leaderboardCommand from "../commands/leaderboard";
import * as serverProgressCommand from "../commands/serverprogress";
import * as countdownCommand from "../commands/countdown";
import * as setEventStartCommand from "../commands/seteventstart";
import * as postSignupCommand from "../commands/postsignup";

type SlashExecutor = (interaction: Parameters<typeof rankCommand.execute>[0], client: Client) => Promise<void>;

const commandMap = new Map<string, SlashExecutor>([
  [rankCommand.data.name, (i) => rankCommand.execute(i)],
  [leaderboardCommand.data.name, (i) => leaderboardCommand.execute(i)],
  [serverProgressCommand.data.name, (i) => serverProgressCommand.execute(i)],
  [countdownCommand.data.name, (i) => countdownCommand.execute(i)],
  [setEventStartCommand.data.name, (i, c) => setEventStartCommand.execute(i, c)],
  [postSignupCommand.data.name, (i) => postSignupCommand.execute(i)],
]);

export async function onInteractionCreate(client: Client, interaction: Interaction): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(client, interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const handler = commandMap.get(interaction.commandName);
  if (!handler) return;

  try {
    await handler(interaction, client);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Error handling slash command");
    const msg = { content: "An error occurred. Please try again.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
}

async function handleButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId !== "summer_signup") return;

  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const existing = await db
    .select()
    .from(eventSignupsTable)
    .where(eq(eventSignupsTable.userId, userId));

  if (existing.length > 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("✅ Already Signed Up!")
          .setDescription("You're already registered for the 2026 Summer Break Event! Get ready to grind when it starts. 🏖️"),
      ],
    });
    return;
  }

  const member = interaction.guild?.members.cache.get(userId)
    ?? await interaction.guild?.members.fetch(userId).catch(() => null);

  await db.insert(eventSignupsTable).values({
    userId,
    username: interaction.user.username,
    displayName: member?.displayName ?? interaction.user.username,
    roleGranted: false,
  });

  const signups = await db.select().from(eventSignupsTable);
  const config = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  const startsAt = config[0]?.startsAt ?? null;
  const unixTs = startsAt ? Math.floor(startsAt.getTime() / 1000) : null;

  logger.info({ userId, username: interaction.user.username }, "User signed up for Summer Break Event");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🎉 You're Signed Up!")
        .setDescription(
          "You're officially registered for the **2026 Summer Break Event**!\n\n" +
          "⭐ You'll receive **150 bonus XP** the moment the event begins\n" +
          "🎖️ The **2026 Summer Break Event** role will be granted automatically\n\n" +
          (unixTs ? `⏰ The event starts <t:${unixTs}:R>. Be ready!` : "📅 The start time will be announced soon."),
        )
        .setFooter({ text: `${signups.length} ${signups.length === 1 ? "person has" : "people have"} signed up · 2026 Summer Break Event` }),
    ],
  });

  try {
    await updateSignupEmbed(interaction, signups.length, startsAt);
  } catch {
    // non-critical
  }
}

async function updateSignupEmbed(
  interaction: ButtonInteraction,
  signupCount: number,
  startsAt: Date | null,
): Promise<void> {
  if (!interaction.message || !interaction.message.embeds[0]) return;

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).spliceFields(1, 1, {
    name: "👥 Early Sign-Ups",
    value: `${signupCount} ${signupCount === 1 ? "person has" : "people have"} signed up so far!`,
    inline: false,
  });

  await interaction.message.edit({ embeds: [updatedEmbed] });
}
