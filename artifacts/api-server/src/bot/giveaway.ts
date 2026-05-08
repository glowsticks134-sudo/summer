import { db } from "@workspace/db";
import { giveawaysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Client, TextChannel, Message } from "discord.js";
import { logger } from "../lib/logger";

interface GiveawayOptions {
  prize: string;
  durationMs: number;
  winnersCount: number;
  milestoneId?: number;
}

const GIVEAWAY_EMOJI = "🎉";

export async function startGiveaway(
  client: Client,
  channel: TextChannel,
  opts: GiveawayOptions,
  guildId: string,
): Promise<void> {
  const endsAt = new Date(Date.now() + opts.durationMs);
  const minutes = Math.round(opts.durationMs / 60_000);

  const giveawayMsg = await channel.send(
    `🎊 **GIVEAWAY!**\n\n**Prize:** ${opts.prize}\n**Winners:** ${opts.winnersCount}\n**Ends in:** ${minutes} minute${minutes !== 1 ? "s" : ""}\n\nReact with ${GIVEAWAY_EMOJI} to enter!\n\n⏰ Ends: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
  );

  await giveawayMsg.react(GIVEAWAY_EMOJI);

  const [inserted] = await db
    .insert(giveawaysTable)
    .values({
      guildId,
      messageId: giveawayMsg.id,
      channelId: channel.id,
      prize: opts.prize,
      winnersCount: opts.winnersCount,
      durationMs: opts.durationMs,
      endsAt,
      ended: false,
      milestoneId: opts.milestoneId,
    })
    .returning();

  logger.info({ giveawayId: inserted.id, prize: opts.prize, endsAt, guildId }, "Giveaway started");
  setTimeout(() => endGiveaway(client, inserted.id), opts.durationMs);
}

async function endGiveaway(client: Client, giveawayDbId: number): Promise<void> {
  const rows = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveawayDbId));
  const giveaway = rows[0];
  if (!giveaway || giveaway.ended) return;

  try {
    const channel = (await client.channels.fetch(giveaway.channelId)) as TextChannel;
    const message = (await channel.messages.fetch(giveaway.messageId!)) as Message;
    const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);

    if (!reaction) {
      await channel.send(`❌ Giveaway for **${giveaway.prize}** ended — no valid entries.`);
      await db.update(giveawaysTable).set({ ended: true }).where(eq(giveawaysTable.id, giveawayDbId));
      return;
    }

    const users = await reaction.users.fetch();
    const eligible = users.filter((u) => !u.bot);

    if (eligible.size === 0) {
      await channel.send(`❌ Giveaway for **${giveaway.prize}** ended — no valid entries.`);
      await db.update(giveawaysTable).set({ ended: true }).where(eq(giveawaysTable.id, giveawayDbId));
      return;
    }

    const shuffled = [...eligible.values()].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, giveaway.winnersCount);
    const winnerIds = winners.map((w) => w.id);
    const winnerMentions = winners.map((w) => `<@${w.id}>`).join(", ");

    await channel.send(`🎉 **GIVEAWAY ENDED!**\n\n**Prize:** ${giveaway.prize}\n🏆 **Winner${winners.length > 1 ? "s" : ""}:** ${winnerMentions}\n\nCongratulations! 🎊`);
    await db.update(giveawaysTable).set({ ended: true, winnerIds }).where(eq(giveawaysTable.id, giveawayDbId));

    logger.info({ giveawayId: giveawayDbId, winnerIds }, "Giveaway ended");
  } catch (err) {
    logger.error({ err, giveawayId: giveawayDbId }, "Error ending giveaway");
  }
}
