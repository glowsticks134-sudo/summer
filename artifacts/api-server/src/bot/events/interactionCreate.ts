import type { Interaction, Client, ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { db } from "@workspace/db";
import { eventSignupsTable, eventConfigTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger";
import * as rankCommand from "../commands/rank";
import * as leaderboardCommand from "../commands/leaderboard";
import * as serverProgressCommand from "../commands/serverprogress";
import * as countdownCommand from "../commands/countdown";
import * as setEventStartCommand from "../commands/seteventstart";
import * as postSignupCommand from "../commands/postsignup";
import * as dailyCommand from "../commands/daily";
import * as streakCommand from "../commands/streak";
import * as weeklyCommand from "../commands/weekly";
import * as eventInfoCommand from "../commands/eventinfo";
import * as triviaCommand from "../commands/trivia";
import * as adminAwardCommand from "../commands/adminaward";
import * as giveawayCommand from "../commands/giveaway-cmd";
import * as dropCommand from "../commands/drop-cmd";
import * as setSignupRoleCommand from "../commands/setsignuprole";
import * as setGoalCommand from "../commands/setgoal";
import * as pollCommand from "../commands/poll";
import * as announceCommand from "../commands/announce";
import * as setRewardCommand from "../commands/setreward";
import * as postLiveProgressCommand from "../commands/postliveprogress";
import * as setMultiplierCommand from "../commands/setmultiplier";
import * as endMultiplierCommand from "../commands/endmultiplier";
import * as spinCommand from "../commands/spin";
import * as shoutoutCommand from "../commands/shoutout";

// Commands that only the bot owner (DISCORD_OWNER_ID) may execute
const OWNER_ONLY_COMMANDS = new Set([
  "seteventstart",
  "postsignup",
  "setsignuprole",
  "setgoal",
  "setreward",
  "postliveprogress",
  "setmultiplier",
  "endmultiplier",
  "announce",
  "adminaward",
  "giveaway",
  "drop",
  "trivia",
  "poll",
]);

function isOwner(userId: string): boolean {
  const ownerId = process.env["DISCORD_OWNER_ID"];
  if (!ownerId) {
    logger.warn("DISCORD_OWNER_ID is not set — admin commands are disabled for everyone");
    return false;
  }
  return userId === ownerId;
}

type SlashExecutor = (interaction: Parameters<typeof rankCommand.execute>[0], client: Client) => Promise<void>;

const commandMap = new Map<string, SlashExecutor>([
  [rankCommand.data.name, (i) => rankCommand.execute(i)],
  [leaderboardCommand.data.name, (i) => leaderboardCommand.execute(i)],
  [serverProgressCommand.data.name, (i) => serverProgressCommand.execute(i)],
  [countdownCommand.data.name, (i) => countdownCommand.execute(i)],
  [setEventStartCommand.data.name, (i, c) => setEventStartCommand.execute(i, c)],
  [postSignupCommand.data.name, (i) => postSignupCommand.execute(i)],
  [dailyCommand.data.name, (i) => dailyCommand.execute(i)],
  [streakCommand.data.name, (i) => streakCommand.execute(i)],
  [weeklyCommand.data.name, (i) => weeklyCommand.execute(i)],
  [eventInfoCommand.data.name, (i) => eventInfoCommand.execute(i)],
  [triviaCommand.data.name, (i) => triviaCommand.execute(i)],
  [adminAwardCommand.data.name, (i) => adminAwardCommand.execute(i)],
  [giveawayCommand.data.name, (i, c) => giveawayCommand.execute(i, c)],
  [dropCommand.data.name, (i, c) => dropCommand.execute(i, c)],
  [setSignupRoleCommand.data.name, (i) => setSignupRoleCommand.execute(i)],
  [setGoalCommand.data.name, (i) => setGoalCommand.execute(i)],
  [pollCommand.data.name, (i) => pollCommand.execute(i)],
  [announceCommand.data.name, (i) => announceCommand.execute(i)],
  [setRewardCommand.data.name, (i) => setRewardCommand.execute(i)],
  [postLiveProgressCommand.data.name, (i) => postLiveProgressCommand.execute(i)],
  [setMultiplierCommand.data.name, (i, c) => setMultiplierCommand.execute(i, c)],
  [endMultiplierCommand.data.name, (i) => endMultiplierCommand.execute(i)],
  [spinCommand.data.name, (i) => spinCommand.execute(i)],
  [shoutoutCommand.data.name, (i) => shoutoutCommand.execute(i)],
]);

export async function onInteractionCreate(client: Client, interaction: Interaction): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(client, interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Owner-only gate: block non-owners from admin commands
  if (OWNER_ONLY_COMMANDS.has(interaction.commandName) && !isOwner(interaction.user.id)) {
    const msg = { content: "🔒 This command is restricted to the bot owner only.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
    logger.warn({ userId: interaction.user.id, command: interaction.commandName }, "Non-owner attempted admin command");
    return;
  }

  const handler = commandMap.get(interaction.commandName);
  if (!handler) return;

  try {
    await handler(interaction, client);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Error handling slash command");
    const errMsg = isOwner(interaction.user.id)
      ? `❌ **Error in \`/${interaction.commandName}\`:**\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``
      : "An error occurred. Please try again.";
    const msg = { content: errMsg, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
}

async function handleButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  if (customId.startsWith("trivia_")) {
    const parts = customId.split("_");
    const answer = parts[1];
    const channelId = parts[2];
    if (answer && channelId) {
      await triviaCommand.handleTriviaButton(interaction, answer, channelId);
    }
    return;
  }

  if (customId === "summer_signup") {
    await handleSignupButton(interaction);
    return;
  }
}

async function handleSignupButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.editReply("❌ This button can only be used in a server.");
    return;
  }

  const userId = interaction.user.id;
  const existing = await db
    .select()
    .from(eventSignupsTable)
    .where(and(eq(eventSignupsTable.guildId, guildId), eq(eventSignupsTable.userId, userId)));

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
    guildId,
    userId,
    username: interaction.user.username,
    displayName: member?.displayName ?? interaction.user.username,
    roleGranted: false,
  });

  const [signups, configRows] = await Promise.all([
    db.select().from(eventSignupsTable).where(eq(eventSignupsTable.guildId, guildId)),
    db.select().from(eventConfigTable).where(eq(eventConfigTable.guildId, guildId)),
  ]);

  const config = configRows[0];
  const startsAt = config?.startsAt ?? null;
  const unixTs = startsAt ? Math.floor(startsAt.getTime() / 1000) : null;

  let roleGranted = false;
  let roleLine = "🎖️ The **2026 Summer Break Event** role will be granted automatically when the event starts";
  if (member && config?.signupRoleId) {
    try {
      const guild = interaction.guild!;
      let role = guild.roles.cache.get(config.signupRoleId);
      if (!role) {
        role = await guild.roles.fetch(config.signupRoleId).catch(() => null) ?? undefined;
      }
      if (role) {
        await member.roles.add(role);
        await db.update(eventSignupsTable)
          .set({ roleGranted: true })
          .where(and(eq(eventSignupsTable.guildId, guildId), eq(eventSignupsTable.userId, userId)));
        roleGranted = true;
        roleLine = `🎖️ You've been given the **${role.name}** role!`;
        logger.info({ userId, roleId: role.id, roleName: role.name, guildId }, "Signup role assigned");
      }
    } catch (err) {
      logger.warn({ err, userId, guildId }, "Failed to assign signup role");
    }
  }

  logger.info({ userId, username: interaction.user.username, guildId, roleGranted }, "User signed up for Summer Break Event");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("🎉 You're Signed Up!")
        .setDescription(
          "You're officially registered for the **2026 Summer Break Event**!\n\n" +
          "⭐ You'll receive **150 bonus XP** the moment the event begins\n" +
          roleLine + "\n\n" +
          (unixTs ? `⏰ The event starts <t:${unixTs}:R>. Be ready!` : "📅 The start time will be announced soon."),
        )
        .setFooter({ text: `${signups.length} ${signups.length === 1 ? "person has" : "people have"} signed up · 2026 Summer Break Event` }),
    ],
  });

  try {
    if (interaction.message?.embeds[0]) {
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).spliceFields(1, 1, {
        name: "👥 Early Sign-Ups",
        value: `${signups.length} ${signups.length === 1 ? "person has" : "people have"} signed up so far!`,
        inline: false,
      });
      await interaction.message.edit({ embeds: [updatedEmbed] });
    }
  } catch {
    // non-critical
  }
}
