import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "@workspace/db";
import { milestonesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { MILESTONE_DEFS } from "../milestones";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("setreward")
  .setDescription("(Admin) Change the reward for a milestone")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption((opt) =>
    opt
      .setName("milestone")
      .setDescription("Milestone number (1–10)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10),
  )
  .addStringOption((opt) =>
    opt
      .setName("prize")
      .setDescription("Prize text (for Giveaway or Quick Drop milestones)")
      .setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("winners")
      .setDescription("Number of winners (for Giveaway milestones)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(20),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("duration_minutes")
      .setDescription("Duration in minutes (for Giveaway or Quick Drop milestones)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(1440),
  )
  .addStringOption((opt) =>
    opt
      .setName("role_name")
      .setDescription("Role name to create/assign (for Role milestones)")
      .setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("top_n")
      .setDescription("How many top users receive the role (for Role milestones)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50),
  )
  .addStringOption((opt) =>
    opt
      .setName("channel_name")
      .setDescription("Channel name to create (for Channel milestones)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("Announcement text (for Announcement milestones)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const milestoneId = interaction.options.getInteger("milestone", true);

  const def = MILESTONE_DEFS.find((m) => m.id === milestoneId);
  if (!def) {
    await interaction.editReply("❌ Invalid milestone number.");
    return;
  }

  const existing = await db.select().from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
  const row = existing[0];

  if (!row) {
    await interaction.editReply("❌ Milestone not found in database. Make sure the bot has started at least once to seed milestones.");
    return;
  }

  const currentConfig = (row.rewardConfig ?? def.rewardConfig) as Record<string, unknown>;
  const updatedConfig = { ...currentConfig };
  const rewardType = row.rewardType;

  const prize = interaction.options.getString("prize");
  const winners = interaction.options.getInteger("winners");
  const durationMinutes = interaction.options.getInteger("duration_minutes");
  const roleName = interaction.options.getString("role_name");
  const topN = interaction.options.getInteger("top_n");
  const channelName = interaction.options.getString("channel_name");
  const message = interaction.options.getString("message");

  const changes: string[] = [];

  if (prize !== null) {
    if (rewardType !== "giveaway" && rewardType !== "quickdrop") {
      await interaction.editReply(`❌ \`prize\` only applies to **giveaway** or **quickdrop** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["prize"] = prize;
    changes.push(`Prize → **${prize}**`);
  }

  if (winners !== null) {
    if (rewardType !== "giveaway") {
      await interaction.editReply(`❌ \`winners\` only applies to **giveaway** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["winners"] = winners;
    changes.push(`Winners → **${winners}**`);
  }

  if (durationMinutes !== null) {
    if (rewardType !== "giveaway" && rewardType !== "quickdrop") {
      await interaction.editReply(`❌ \`duration_minutes\` only applies to **giveaway** or **quickdrop** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["durationMs"] = durationMinutes * 60 * 1000;
    changes.push(`Duration → **${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}**`);
  }

  if (roleName !== null) {
    if (rewardType !== "role") {
      await interaction.editReply(`❌ \`role_name\` only applies to **role** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["roleName"] = roleName;
    changes.push(`Role Name → **${roleName}**`);
  }

  if (topN !== null) {
    if (rewardType !== "role") {
      await interaction.editReply(`❌ \`top_n\` only applies to **role** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["topN"] = topN;
    changes.push(`Top N → **${topN}**`);
  }

  if (channelName !== null) {
    if (rewardType !== "channel") {
      await interaction.editReply(`❌ \`channel_name\` only applies to **channel** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["name"] = channelName;
    changes.push(`Channel Name → **${channelName}**`);
  }

  if (message !== null) {
    if (rewardType !== "announcement") {
      await interaction.editReply(`❌ \`message\` only applies to **announcement** milestones. Milestone #${milestoneId} is a **${rewardType}** reward.`);
      return;
    }
    updatedConfig["message"] = message;
    changes.push(`Message → *${message.slice(0, 80)}${message.length > 80 ? "…" : ""}*`);
  }

  if (changes.length === 0) {
    const configLines = buildConfigSummary(rewardType, currentConfig);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle(`ℹ️ Milestone #${milestoneId} — ${def.title}`)
          .setDescription(`**Reward type:** ${rewardType}\n\n**Current config:**\n${configLines}\n\nProvide at least one option to make a change.`)
          .setFooter({ text: "2026 Summer Break Event" }),
      ],
    });
    return;
  }

  await db.update(milestonesTable)
    .set({ rewardConfig: updatedConfig })
    .where(eq(milestonesTable.id, milestoneId));

  logger.info({ milestoneId, updatedConfig, adminId: interaction.user.id }, "Milestone reward config updated");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Milestone Reward Updated")
        .addFields(
          { name: "🏆 Milestone", value: `#${milestoneId} — ${def.title}`, inline: false },
          { name: "🎁 Reward Type", value: rewardType, inline: true },
          { name: "✏️ Changes", value: changes.join("\n"), inline: false },
          { name: "📋 Full Config", value: buildConfigSummary(rewardType, updatedConfig), inline: false },
        )
        .setFooter({ text: "2026 Summer Break Event · Takes effect when this milestone unlocks" }),
    ],
  });
}

function buildConfigSummary(rewardType: string, config: Record<string, unknown>): string {
  const lines: string[] = [];

  if (rewardType === "giveaway") {
    lines.push(`Prize: **${config["prize"] ?? "—"}**`);
    lines.push(`Winners: **${config["winners"] ?? "—"}**`);
    const ms = config["durationMs"];
    if (typeof ms === "number") {
      lines.push(`Duration: **${Math.round(ms / 60000)} min**`);
    }
    if (config["channelName"]) lines.push(`Channel: **${config["channelName"]}**`);
  } else if (rewardType === "quickdrop") {
    lines.push(`Prize: **${config["prize"] ?? "—"}**`);
    const ms = config["durationMs"];
    if (typeof ms === "number") {
      lines.push(`Duration: **${Math.round(ms / 60000)} min**`);
    }
    if (config["channelName"]) lines.push(`Channel: **${config["channelName"]}**`);
  } else if (rewardType === "role") {
    lines.push(`Role Name: **${config["roleName"] ?? "—"}**`);
    lines.push(`Top N: **${config["topN"] ?? "—"}**`);
  } else if (rewardType === "channel") {
    lines.push(`Channel Name: **${config["name"] ?? "—"}**`);
    if (config["topic"]) lines.push(`Topic: *${config["topic"]}*`);
  } else if (rewardType === "announcement") {
    const msg = String(config["message"] ?? "—");
    lines.push(`Message: *${msg.slice(0, 120)}${msg.length > 120 ? "…" : ""}*`);
  }

  return lines.length > 0 ? lines.join("\n") : "*(no config)*";
}
