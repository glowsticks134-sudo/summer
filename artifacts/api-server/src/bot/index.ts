import { Client, GatewayIntentBits, Partials } from "discord.js";
import { logger } from "../lib/logger";
import { onReady } from "./events/ready";
import { onMessageCreate } from "./events/messageCreate";
import { onInteractionCreate } from "./events/interactionCreate";
import { seedMilestones } from "./milestones";
import { scheduleEventStart } from "./eventScheduler";

export function startBot(): void {
  if (process.env["DISCORD_BOT_ENABLED"] === "false") {
    logger.info("DISCORD_BOT_ENABLED=false — Discord bot is disabled in this environment.");
    return;
  }

  const token = process.env["DISCORD_BOT_TOKEN"];

  if (!token) {
    logger.warn(
      "DISCORD_BOT_TOKEN is not set — Discord bot will not start. Add it to your secrets when ready.",
    );
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  client.once("ready", () => onReady(client));

  client.on("messageCreate", (message) => onMessageCreate(client, message));

  client.on("interactionCreate", (interaction) => onInteractionCreate(client, interaction));

  // Seed milestones and schedule event start when the bot joins a new server
  client.on("guildCreate", async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot joined a new server");
    try {
      await seedMilestones(guild.id);
      await scheduleEventStart(client, guild.id);
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "Error during setup for new guild");
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });

  logger.info("Discord bot starting...");
}
