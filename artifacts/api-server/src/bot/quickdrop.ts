import type { Client, TextChannel } from "discord.js";
import { logger } from "../lib/logger";

interface QuickDropOptions {
  prize: string;
  durationMs: number;
}

const DROP_EMOJI = "⚡";

export async function startQuickDrop(
  client: Client,
  channel: TextChannel,
  opts: QuickDropOptions,
): Promise<void> {
  const seconds = Math.round(opts.durationMs / 1000);

  const dropMsg = await channel.send(
    `⚡ **QUICK DROP!**\n\n**Prize:** ${opts.prize}\n\nFirst person to react with ${DROP_EMOJI} wins!\n⏰ You have **${seconds} seconds**!`,
  );

  await dropMsg.react(DROP_EMOJI);

  logger.info({ prize: opts.prize, durationMs: opts.durationMs }, "Quick drop started");

  const collector = dropMsg.createReactionCollector({
    filter: (reaction, user) => reaction.emoji.name === DROP_EMOJI && !user.bot,
    max: 1,
    time: opts.durationMs,
  });

  collector.on("collect", async (reaction) => {
    const winner = reaction.users.cache.filter((u) => !u.bot).first();
    if (!winner) return;

    await channel.send(
      `⚡ **QUICK DROP CLAIMED!**\n\n🏆 <@${winner.id}> snagged the **${opts.prize}** first! Congratulations! 🎉`,
    );
    logger.info({ winnerId: winner.id, prize: opts.prize }, "Quick drop claimed");
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await channel.send(`⚡ **QUICK DROP EXPIRED!** Nobody claimed the **${opts.prize}** in time. 😢`);
      logger.info({ prize: opts.prize }, "Quick drop expired unclaimed");
    }
  });
}
