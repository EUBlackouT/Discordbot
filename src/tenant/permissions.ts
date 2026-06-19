import { PermissionFlagsBits, type GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config/index.js';

export function requireGuild(interaction: ChatInputCommandInteraction): string | null {
  if (!interaction.guildId) {
    return 'This command only works inside a Discord server.';
  }
  return null;
}

export function isGlobalAdmin(discordId: string): boolean {
  return config.admin.discordIds.length === 0 || config.admin.discordIds.includes(discordId);
}

export function isGuildAdmin(member: GuildMember | null): boolean {
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export async function canManageCampaign(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (isGlobalAdmin(interaction.user.id)) return true;
  if (!interaction.guild || !interaction.member) return false;
  const member = interaction.member as GuildMember;
  return isGuildAdmin(member);
}
