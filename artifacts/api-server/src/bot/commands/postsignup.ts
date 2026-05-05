import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { eventConfigTable, eventSignupsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getEventConfig } from "../eventScheduler";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("postsignup")
  .setDescription("(Admin) Post the Summer Break Event early sign-up embed in this channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const config = await getEventConfig();
  const signupCount = (await db.select().from(eventSignupsTable)).length;

  const unixTs = config?.startsAt
    ? Math.floor(config.startsAt.getTime() / 1000)
    : null;

  const startLine = unixTs
    ? `🗓️ **Event Starts:** <t:${unixTs}:F> (<t:${unixTs}:R>)`
    : "🗓️ **Event Starts:** Date to be announced — stay tuned!";

  const embed = new EmbedBuilder()
    .setTitle("🏖️ 2026 Summer Break Event — Early Sign-Up!")
    .setColor(0xfbbf24)
    .setDescription(
      "Welcome to the **2026 Summer Break Event**! This is a server-wide XP & leveling event where your chatting earns rewards for everyone.\n\n" +
      "**Sign up early to get:**\n" +
      "⭐ **150 bonus XP** the moment the event begins\n" +
      "🎖️ The **2026 Summer Break Event** role automatically granted\n" +
      "🔔 You'll be ready to grind from the very first second!\n\n" +
      startLine,
    )
    .addFields(
      {
        name: "📋 How It Works",
        value:
          "• Chat in any channel to earn **15–25 XP** per message\n" +
          "• Server hits milestones together → channels, roles, giveaways & quick drops unlock\n" +
          "• Use `/rank`, `/leaderboard`, `/serverprogress` to track progress",
        inline: false,
      },
      {
        name: "👥 Early Sign-Ups",
        value: `${signupCount} ${signupCount === 1 ? "person has" : "people have"} signed up so far!`,
        inline: false,
      },
    )
    .setFooter({ text: "Click the button below to sign up · 2026 Summer Break Event" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("summer_signup")
      .setLabel("🏖️ Sign Me Up!")
      .setStyle(ButtonStyle.Primary),
  );

  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.editReply("❌ Cannot post in this channel type.");
    return;
  }

  const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

  const existing = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  if (existing.length === 0) {
    await db.insert(eventConfigTable).values({
      id: 1,
      signupMessageId: msg.id,
      signupChannelId: interaction.channelId,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(eventConfigTable)
      .set({ signupMessageId: msg.id, signupChannelId: interaction.channelId, updatedAt: new Date() })
      .where(eq(eventConfigTable.id, 1));
  }

  logger.info({ messageId: msg.id, channelId: interaction.channelId }, "Sign-up embed posted");
  await interaction.editReply("✅ Sign-up embed posted!");
}
