import type { Client } from "discord.js";
import { REST, Routes } from "discord.js";
import { logger } from "../../lib/logger";
import { seedMilestones } from "../milestones";
import { scheduleEventStart } from "../eventScheduler";
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
];

export async function onReady(client: Client): Promise<void> {
  logger.info({ tag: client.user?.tag }, "Discord bot is ready");

  const token = process.env["DISCORD_BOT_TOKEN"];
  const guildId = process.env["DISCORD_GUILD_ID"];
  const clientId = client.user?.id;

  if (!token || !guildId || !clientId) {
    logger.warn("Missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID or client id — skipping slash command registration");
  } else {
    const rest = new REST({ version: "10" }).setToken(token);
    try {
      const commandData = commands.map((c) => c.data.toJSON());
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      logger.info({ count: commandData.length }, "Slash commands registered");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  }

  await seedMilestones();
  await scheduleEventStart(client);
}
