import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { xpUsersTable, serverXpTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { levelFromXp } from "../xp";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("adminaward")
  .setDescription("(Admin) Manually award XP to a user")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt.setName("user").setDescription("User to award XP to").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt.setName("amount").setDescription("Amount of XP to award").setRequired(true).setMinValue(1).setMaxValue(10000),
  )
  .addStringOption((opt) =>
    opt.setName("reason").setDescription("Reason for the award").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = interaction.options.getString("reason") ?? "Admin award";

  const now = new Date();
  const rows = await db.select().from(xpUsersTable).where(eq(xpUsersTable.userId, target.id));
  const user = rows[0];
  const prevXp = user?.xp ?? 0;
  const newXp = prevXp + amount;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > (user?.level ?? 0);

  const member = interaction.guild?.members.cache.get(target.id);
  const displayName = member?.displayName ?? target.username;

  if (!user) {
    await db.insert(xpUsersTable).values({
      userId: target.id,
      username: target.username,
      displayName,
      xp: newXp,
      level: newLevel,
      totalMessages: 0,
      weeklyXp: amount,
      weekStartAt: now,
    });
  } else {
    await db.update(xpUsersTable).set({
      xp: newXp,
      level: newLevel,
      weeklyXp: (user.weeklyXp ?? 0) + amount,
      displayName,
    }).where(eq(xpUsersTable.userId, target.id));
  }

  const serverRows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
  const newServerXp = (serverRows[0]?.totalXp ?? 0) + amount;
  if (serverRows.length === 0) {
    await db.insert(serverXpTable).values({ id: 1, totalXp: newServerXp, updatedAt: now });
  } else {
    await db.update(serverXpTable).set({ totalXp: newServerXp, updatedAt: now }).where(eq(serverXpTable.id, 1));
  }

  logger.info({ adminId: interaction.user.id, targetId: target.id, amount, reason }, "Admin XP award");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ XP Awarded")
        .addFields(
          { name: "👤 User", value: `<@${target.id}>`, inline: true },
          { name: "⭐ XP Added", value: `+${amount.toLocaleString()}`, inline: true },
          { name: "📊 New Total", value: newXp.toLocaleString(), inline: true },
          { name: "📈 Level", value: leveledUp ? `${newLevel} (leveled up! 🎉)` : `${newLevel}`, inline: true },
          { name: "📝 Reason", value: reason, inline: false },
        )
        .setFooter({ text: `Awarded by ${interaction.user.username} · 2026 Summer Break Event` }),
    ],
  });

  if (leveledUp && interaction.channel && "send" in interaction.channel) {
    await interaction.channel.send(
      `⬆️ <@${target.id}> was awarded **+${amount} XP** by an admin and leveled up to **Level ${newLevel}**! ☀️`,
    );
  }
}
