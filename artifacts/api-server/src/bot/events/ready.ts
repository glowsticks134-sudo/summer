import type { Client } from "discord.js";
import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger";
import { seedMilestones } from "../milestones";
import { scheduleEventStart } from "../eventScheduler";
import { startLiveProgressUpdater } from "../liveProgress";
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

const commands = [
  rankCommand,
  leaderboardCommand,
  serverProgressCommand,
  countdownCommand,
  setEventStartCommand,
  postSignupCommand,
  dailyCommand,
  streakCommand,
  weeklyCommand,
  eventInfoCommand,
  triviaCommand,
  adminAwardCommand,
  giveawayCommand,
  dropCommand,
  setSignupRoleCommand,
  setGoalCommand,
  pollCommand,
  announceCommand,
  setRewardCommand,
  postLiveProgressCommand,
  setMultiplierCommand,
  endMultiplierCommand,
  spinCommand,
  shoutoutCommand,
];

export async function onReady(client: Client): Promise<void> {
  logger.info({ tag: client.user?.tag }, "Discord bot is ready");

  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = client.user?.id;

  if (!token || !clientId) {
    logger.warn("Missing DISCORD_BOT_TOKEN or client id — skipping slash command registration");
  } else {
    const rest = new REST({ version: "10" }).setToken(token);
    const commandData = commands.map((c) => c.data.toJSON());

    try {
      // Always register as global commands (works in all servers)
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      logger.info({ count: commandData.length }, "Global slash commands registered");
    } catch (err) {
      logger.error({ err }, "Failed to register global slash commands");
    }

    // Also register guild commands instantly if DISCORD_GUILD_ID is set
    const guildId = process.env["DISCORD_GUILD_ID"];
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
        logger.info({ guildId, count: commandData.length }, "Guild slash commands registered (instant)");
      } catch (err) {
        logger.warn({ err, guildId }, "Failed to register guild slash commands");
      }
    }
  }

  // Seed milestones and schedule event start for every guild the bot is in
  for (const guild of client.guilds.cache.values()) {
    try {
      await seedMilestones(guild.id);
      await scheduleEventStart(client, guild.id);
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "Error during per-guild setup on ready");
    }
  }

  startLiveProgressUpdater(client);
}
