import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { levelFromXp } from "../xp";
import { isEventStarted } from "../eventScheduler";
import { logger } from "../../lib/logger";

const SHOUTOUT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const SHOUTOUT_XP = 75;

export const data = new SlashCommandBuilder()
  .setName("shoutout")
  .setDescription("Give someone a shoutout and award them bonus XP! (1-hour cooldown)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The member you want to shout out").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Why are you shouting them out?").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const started = await isEventStarted();
  if (!started) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle("⏳ Event Not Started")
          .setDescription("Shoutouts aren't available yet! Use `/countdown` to see when the event begins."),
      ],
    });
    return;
  }

  const giverId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason");

  if (target.id === giverId) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("❌ Nice Try!")
          .setDescription("You can't shout yourself out. Give the love to someone else! 😄"),
      ],
    });
    return;
  }

  if (target.bot) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xef4444).setDescription("❌ Bots don't need shoutouts!")] });
    return;
  }

  const now = new Date();
  const giverRows = await db.select().from(xpUsersTable).where(eq(xpUsersTable.userId, giverId));
  const giver = giverRows[0];

  if (giver?.lastShoutoutAt) {
    const elapsed = now.getTime() - giver.lastShoutoutAt.getTime();
    if (elapsed < SHOUTOUT_COOLDOWN_MS) {
      const nextAt = new Date(giver.lastShoutoutAt.getTime() + SHOUTOUT_COOLDOWN_MS);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle("⏰ Shoutout Cooldown")
            .setDescription(`You already gave a shoutout recently!\n\n⏰ Next shoutout available: <t:${Math.floor(nextAt.getTime() / 1000)}:R>`)
            .setFooter({ text: "2026 Summer Break Event" }),
        ],
      });
      return;
    }
  }

  // Award XP to target
  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetDisplayName = targetMember?.displayName ?? target.username;
  const giverMember = interaction.guild?.members.cache.get(giverId);
  const giverDisplayName = giverMember?.displayName ?? interaction.user.username;

  const targetRows = await db.select().from(xpUsersTable).where(eq(xpUsersTable.userId, target.id));
  const targetUser = targetRows[0];
  const prevXp = targetUser?.xp ?? 0;
  const newXp = prevXp + SHOUTOUT_XP;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > (targetUser?.level ?? 0);

  if (!targetUser) {
    await db.insert(xpUsersTable).values({
      userId: target.id,
      username: target.username,
      displayName: targetDisplayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 0,
    });
  } else {
    await db.update(xpUsersTable).set({
      xp: newXp,
      level: newLevel,
      displayName: targetDisplayName,
      username: target.username,
    }).where(eq(xpUsersTable.userId, target.id));
  }

  // Update server XP
  const serverRows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
  const newServerXp = (serverRows[0]?.totalXp ?? 0) + SHOUTOUT_XP;
  if (serverRows.length === 0) {
    await db.insert(serverXpTable).values({ id: 1, totalXp: newServerXp, updatedAt: now });
  } else {
    await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.id, 1));
  }

  // Update giver's shoutout cooldown
  if (!giver) {
    await db.insert(xpUsersTable).values({
      userId: giverId,
      username: interaction.user.username,
      displayName: giverDisplayName,
      xp: 0,
      level: 0,
      totalMessages: 0,
      lastShoutoutAt: now,
    });
  } else {
    await db.update(xpUsersTable).set({ lastShoutoutAt: now, displayName: giverDisplayName }).where(eq(xpUsersTable.userId, giverId));
  }

  logger.info({ giverId, targetId: target.id, xpGained: SHOUTOUT_XP }, "Shoutout given");

  const reasonLine = reason ? `\n💬 *"${reason}"*` : "";
  const levelLine = leveledUp ? `\n\n⬆️ <@${target.id}> leveled up to **Level ${newLevel}**!` : "";

  const embed = new EmbedBuilder()
    .setColor(0xec4899)
    .setTitle("📣 SHOUTOUT!")
    .setDescription(
      `**<@${giverId}>** is shouting out **<@${target.id}>**!${reasonLine}\n\n` +
      `🎁 <@${target.id}> received **+${SHOUTOUT_XP} XP**!${levelLine}`,
    )
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "📊 Their Total XP", value: newXp.toLocaleString(), inline: true },
      { name: "🎯 Their Level", value: `${newLevel}`, inline: true },
      { name: "⏰ Your Next Shoutout", value: `<t:${Math.floor((now.getTime() + SHOUTOUT_COOLDOWN_MS) / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: "2026 Summer Break Event · Give a shoutout every hour" });

  await interaction.editReply({ embeds: [embed] });
}
