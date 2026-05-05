import type { Interaction } from "discord.js";
import { logger } from "../../lib/logger";
import * as rankCommand from "../commands/rank";
import * as leaderboardCommand from "../commands/leaderboard";
import * as serverProgressCommand from "../commands/serverprogress";

const commandMap = new Map([
  [rankCommand.data.name, rankCommand.execute],
  [leaderboardCommand.data.name, leaderboardCommand.execute],
  [serverProgressCommand.data.name, serverProgressCommand.execute],
]);

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const handler = commandMap.get(interaction.commandName);
  if (!handler) return;

  try {
    await handler(interaction);
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
