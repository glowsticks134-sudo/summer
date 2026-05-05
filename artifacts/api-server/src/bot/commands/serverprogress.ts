import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { db } from "@workspace/db";
import { serverXpTable, milestonesTable } from "@workspace/db/schema";
import { eq, gt } from "drizzle-orm";
import { MILESTONE_DEFS } from "../milestones";
import { replyIfNotStarted } from "../utils";

export const data = new SlashCommandBuilder()
  .setName("serverprogress")
  .setDescription("View the server's overall Summer Break Event progress and milestones");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (await replyIfNotStarted(interaction)) return;

  const serverXpRows = await db.select().from(serverXpTable).where(eq(serverXpTable.id, 1));
  const totalXp = serverXpRows[0]?.totalXp ?? 0;

  const milestoneRows = await db.select().from(milestonesTable);
  const milestoneMap = new Map(milestoneRows.map((m) => [m.id, m]));

  const nextMilestone = MILESTONE_DEFS.find((m) => !(milestoneMap.get(m.id)?.unlocked));

  const lines = MILESTONE_DEFS.map((def) => {
    const dbRow = milestoneMap.get(def.id);
    const unlocked = dbRow?.unlocked ?? false;
    const icon = unlocked ? "✅" : totalXp >= def.xpRequired ? "🔓" : "🔒";
    return `${icon} **${def.title}** — ${def.xpRequired.toLocaleString()} XP`;
  });

  let progressSection = "";
  if (nextMilestone) {
    const xpNeeded = Math.max(0, nextMilestone.xpRequired - totalXp);
    const progress = Math.min(100, Math.round((totalXp / nextMilestone.xpRequired) * 100));
    const bar = "█".repeat(Math.round(progress / 5)) + "░".repeat(20 - Math.round(progress / 5));
    progressSection = `\n**Next Milestone:** ${nextMilestone.title}\n${bar} ${progress}%\n${xpNeeded.toLocaleString()} XP to go!`;
  } else {
    progressSection = "\n🏆 **ALL MILESTONES COMPLETED! You did it!** 🏆";
  }

  const embed = new EmbedBuilder()
    .setTitle("☀️ Summer Break Event — Server Progress")
    .setColor(0xf59e0b)
    .setDescription(`**Total Server XP:** ⭐ ${totalXp.toLocaleString()}\n${progressSection}`)
    .addFields({ name: "📋 Milestones", value: lines.join("\n") })
    .setFooter({ text: "2026 Summer Break Event" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
