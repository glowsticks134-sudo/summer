import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { upsertEventConfig } from "../eventScheduler";
import { logger } from "../../lib/logger";

export const data = new SlashCommandBuilder()
  .setName("setsignuprole")
  .setDescription("(Admin) Choose which role is assigned when someone signs up for the event")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption((opt) =>
    opt
      .setName("role")
      .setDescription("The role to assign on sign-up (leave blank to clear)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) { await interaction.editReply("❌ This command can only be used in a server."); return; }

  const role = interaction.options.getRole("role");

  if (role === null) {
    await upsertEventConfig(guildId, { signupRoleId: null, signupRoleName: null });
    logger.info({ guildId }, "Signup role cleared");
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("🔄 Sign-Up Role Cleared")
          .setDescription("Sign-ups will no longer auto-assign a role.\nThe bot will still create the **2026 Summer Break Event** role when XP is first earned.")
          .setFooter({ text: "2026 Summer Break Event" }),
      ],
    });
    return;
  }

  await upsertEventConfig(guildId, { signupRoleId: role.id, signupRoleName: role.name });
  logger.info({ guildId, roleId: role.id, roleName: role.name }, "Signup role configured");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Sign-Up Role Set")
        .setDescription(`Members who click **Sign Me Up!** will now automatically receive the <@&${role.id}> role.`)
        .addFields(
          { name: "🎖️ Role", value: `<@&${role.id}>`, inline: true },
          { name: "🆔 Role ID", value: role.id, inline: true },
        )
        .setFooter({ text: "2026 Summer Break Event" }),
    ],
  });
}
