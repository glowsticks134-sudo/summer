import { Client, GatewayIntentBits, Partials } from "discord.js";
import { logger } from "../lib/logger";
import { onReady } from "./events/ready";
import { onMessageCreate } from "./events/messageCreate";
import { onInteractionCreate } from "./events/interactionCreate";

export function startBot(): void {
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

  client.on("interactionCreate", (interaction) => onInteractionCreate(interaction));

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });

  logger.info("Discord bot starting...");
}
