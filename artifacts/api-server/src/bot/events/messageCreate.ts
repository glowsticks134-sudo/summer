import type { Message, Client } from "discord.js";
import { logger } from "../../lib/logger";
import { awardXp, assignEventRole } from "../xp";
import { checkMilestones } from "../milestones";

export async function onMessageCreate(client: Client, message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const guildId = process.env["DISCORD_GUILD_ID"];
  if (guildId && message.guild.id !== guildId) return;

  try {
    const result = await awardXp(message);
    if (!result) return;

    const member = message.guild.members.cache.get(message.author.id)
      ?? await message.guild.members.fetch(message.author.id).catch(() => null);

    if (member) {
      await assignEventRole(member);

      if (result.leveledUp && message.channel.isTextBased() && "send" in message.channel) {
        await message.channel.send(
          `⬆️ <@${message.author.id}> leveled up to **Level ${result.newLevel}**! Keep it up! ☀️`,
        );
      }
    }

    await checkMilestones(client, message.guild, result.totalXp);
  } catch (err) {
    logger.error({ err, userId: message.author.id }, "Error processing message XP");
  }
}
