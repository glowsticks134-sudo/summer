import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { eventConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("endmultiplier")
  .setDescription("(Admin) Cancel the active XP multiplier early")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rows = await db.select().from(eventConfigTable).where(eq(eventConfigTable.id, 1));
  const config = rows[0];

  const isActive = config && config.xpMultiplier > 1 &&
    (!config.xpMultiplierExpiresAt || config.xpMultiplierExpiresAt > new Date());

  if (!isActive) {
    await interaction.editReply("ℹ️ There is no active XP multiplier to end.");
    return;
  }

  const label = config.xpMultiplierLabel ?? "XP Multiplier";

  await db.update(eventConfigTable).set({
    xpMultiplier: 1,
    xpMultiplierExpiresAt: null,
    xpMultiplierLabel: null,
    updatedAt: new Date(),
  }).where(eq(eventConfigTable.id, 1));

  logger.info({ label }, "XP multiplier cancelled early by admin");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x64748b)
        .setTitle("⚡ XP Multiplier Cancelled")
        .setDescription(`The **${label}** multiplier has been ended early. XP is back to normal.`)
        .setFooter({ text: "2026 Summer Break Event" }),
    ],
  });
}
