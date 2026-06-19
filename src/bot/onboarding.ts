import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { OpeningSceneContent } from '../campaign/intro.js';

const STEPS = [
  '**1. Create your character** — `/character create` (only you see the menus; takes ~2 min)',
  '**2. Start the campaign** — a server admin runs `/campaign start` in this channel',
  '**3. Join the party** — `/campaign join character:YourName`',
  '**4. Play** — type what your character does in this channel (no more slash commands needed)',
];

export function buildGettingStartedEmbed(channelMention?: string): EmbedBuilder {
  const where = channelMention ?? 'this channel';
  return new EmbedBuilder()
    .setTitle('📜 Chronicler — How to Play')
    .setDescription(
      `I'm an AI dungeon master for a persistent D&D-style campaign. Everything happens in ${where}.\n\n` +
        '**Before the story begins, do this in order:**\n' +
        STEPS.join('\n'),
    )
    .addFields(
      {
        name: 'Step 1 right now',
        value: 'Type **`/character create`** and follow the menus (race → class → background → stats → name).',
      },
      {
        name: 'Who starts the story?',
        value:
          'Anyone with **Manage Server** runs **`/campaign start`** once everyone has a character (or is ready). That posts the opening scene.',
      },
      {
        name: 'After that',
        value:
          'Type actions in plain English — *"I slip into the alley"* — or ask *"where are we?"* / *"recap"* anytime.',
      },
    )
    .setColor(0x4a0080)
    .setFooter({ text: 'Type /help anytime for this guide' });
}

export function buildCharacterCreatedEmbed(
  characterName: string,
  options?: { race?: string; className?: string; portraitReady?: boolean },
): EmbedBuilder {
  const joinCmd = '/campaign join character:' + characterName;
  const subtitle =
    options?.race && options?.className
      ? `Level 1 ${options.race} ${options.className}`
      : 'Your hero is ready for the tale';

  const embed = new EmbedBuilder()
    .setTitle(`✅ ${characterName}`)
    .setDescription(
      `*${subtitle}*\n\n` +
        (options?.portraitReady
          ? 'Portrait painted and saved to your sheet.\n\n'
          : 'Portrait will appear once image generation is configured.\n\n') +
        '**Next steps**\n' +
        '1. Wait for **`/campaign start`** in the campaign channel (or run it if you have permission).\n' +
        `2. Run **\`${joinCmd}\`** in that channel.\n` +
        '3. Read the opening scene and type what you do — your portrait shows beside every action.',
    )
    .setColor(0x2d6a4f)
    .setFooter({ text: 'View your sheet with /character sheet name:' + characterName });

  if (options?.portraitReady) {
    embed.setImage('attachment://portrait.png');
  }

  return embed;
}

export interface CampaignOpeningPartyMember {
  characterName: string;
}

export interface CampaignOpeningJoinInfo {
  party: CampaignOpeningPartyMember[];
}

export interface CampaignOpeningPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}

export function buildCampaignOpeningPayload(
  campaignName: string,
  scene: OpeningSceneContent,
  joinInfo?: CampaignOpeningJoinInfo,
): CampaignOpeningPayload {
  const visual = new EmbedBuilder()
    .setTitle(scene.locationName)
    .setDescription(`*${scene.locationTagline}*`)
    .setColor(0x0a0a12);

  let footer = 'Type what you do — or pick a move below';
  if (joinInfo?.party.length === 1) {
    footer = `Others can /campaign join character:Name · ${footer}`;
  } else if (joinInfo && joinInfo.party.length > 1) {
    const roster = joinInfo.party.map((m) => m.characterName).join(', ');
    footer = `${roster} · ${footer}`;
  }

  const story = new EmbedBuilder()
    .setAuthor({ name: 'Chronicler' })
    .setTitle(campaignName)
    .setDescription(scene.narrative)
    .setColor(0x1a0a2e)
    .setFooter({ text: footer });

  const embeds = [visual, story];

  const choiceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    scene.choices.map((choice, index) =>
      new ButtonBuilder()
        .setCustomId(`opening_choice_${index}`)
        .setLabel(choice.label)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  if (!joinInfo?.party.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0x1b4332)
        .setDescription('`/character create` then `/campaign join character:YourName` to step into the yard.'),
    );
  }

  return { embeds, components: [choiceRow], files: [] };
}

/** @deprecated Use buildCampaignOpeningPayload */
export function buildCampaignOpeningEmbeds(
  campaignName: string,
  openingNarration: string,
  locationName: string,
): EmbedBuilder[] {
  const story = new EmbedBuilder()
    .setTitle(`⚔️ ${campaignName} — The story begins`)
    .setDescription(openingNarration)
    .setColor(0x4a0080)
    .setFooter({ text: `📍 ${locationName} · Type your action below to play` });
  return [story];
}

export function buildNotInCampaignEmbed(characterNames: string[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('You\'re watching the story — not in it yet')
    .setColor(0xff6600);

  if (characterNames.length === 0) {
    embed.setDescription(
      'This channel has an active campaign, but you haven\'t created a character.\n\n' +
        '**Do this:**\n' +
        '1. **`/character create`** — build your PC (only you see the wizard)\n' +
        '2. **`/campaign join character:YourName`** — join the party in this channel\n' +
        '3. **Type your actions** in chat',
    );
  } else {
    const list = characterNames.map((n) => `• \`/campaign join character:${n}\``).join('\n');
    embed.setDescription(
      'This channel has an active campaign. Pick a character to join:\n\n' +
        list +
        '\n\nThen type what your character does in chat.',
    );
  }

  return embed;
}

export function buildHelpButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('onboarding_character_create')
      .setLabel('Step 1: /character create')
      .setStyle(ButtonStyle.Primary),
  );
}

export function looksLikeHelpMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 200) return false;
  return (
    /\b(help|how do i|how to|what do i do|get started|how does this work|confused|no idea|what's going on|whats going on|start playing|make a character|create character)\b/.test(
      t,
    ) || /^\?+$/.test(t)
  );
}
