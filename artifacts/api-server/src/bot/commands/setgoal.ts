import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { milestonesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { MILESTONE_DEFS } from "../milestones";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("setgoal")
  .setDescription("(Admin) Change the XP goal for a milestone")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption((opt) =>
    opt
      .setName("milestone")
      .setDescription("Milestone number (1–10)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("xp")
      .setDescription("New XP goal required to unlock this milestone")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10_000_000),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const milestoneId = interaction.options.getInteger("milestone", true);
  const newXp = interaction.options.getInteger("xp", true);

  const def = MILESTONE_DEFS.find((m) => m.id === milestoneId);
  if (!def) {
    await interaction.editReply("❌ Invalid milestone number.");
    return;
  }

  const existing = await db.select().from(milestonesTable)
    .where(and(eq(milestonesTable.guildId, guildId), eq(milestonesTable.id, milestoneId)));

  if (existing.length === 0) {
    await db.insert(milestonesTable).values({
      guildId,
      id: milestoneId,
      xpRequired: newXp,
      title: def.title,
      description: def.description,
      rewardType: def.rewardType,
      rewardConfig: def.rewardConfig,
      unlocked: false,
    });
  } else {
    await db.update(milestonesTable)
      .set({ xpRequired: newXp })
      .where(and(eq(milestonesTable.guildId, guildId), eq(milestonesTable.id, milestoneId)));
  }

  logger.info({ guildId, milestoneId, newXp }, "Milestone XP goal updated by admin");

  const wasUnlocked = existing[0]?.unlocked ?? false;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Milestone Goal Updated")
        .addFields(
          { name: "🏆 Milestone", value: `#${milestoneId} — ${def.title}`, inline: false },
          { name: "🎯 New XP Goal", value: newXp.toLocaleString(), inline: true },
          { name: "🔓 Status", value: wasUnlocked ? "Already unlocked" : "Still locked", inline: true },
        )
        .setDescription(def.description)
        .setFooter({ text: "2026 Summer Break Event · Changes take effect immediately" }),
    ],
  });
}
