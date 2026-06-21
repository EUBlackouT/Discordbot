/**
 * Full SRD character creation wizard — Discord component handlers.
 */
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  getCharacterDraft,
  upsertCharacterDraft,
  finalizeCharacter,
  buildCharacterPreviewFromDraft,
} from '../../../game/character/service.js';
import { loadRulesData, getSpellsForClass, getClassDefinition } from '../../../game/rules/loader.js';
import { parseJson, STANDARD_ARRAY, ABILITIES, type Ability } from '../../../utils/helpers.js';
import { rollAbilityScores } from '../../../game/dice/engine.js';
import {
  type CharacterDraftData,
  type WizardStep,
  getRemainingPool,
  getNextAbilityToAssign,
  EXTRA_LANGUAGES,
  assembleSkills,
  finalizeAbilityScores,
  computeSpellsPreparedCount,
} from '../../../game/character/draft-types.js';
import { SRD_RACES } from '../../../game/rules/srd-data.js';
import { validatePointBuy as validatePointBuyScores } from '../../../game/character/creator.js';
import { buildCharacterCreatedEmbed, buildGettingStartedEmbed } from '../../onboarding.js';
import { buildCharacterSheetEmbeds } from '../../../game/character/sheet-display.js';
import { isRenderableImagePath } from '../../campaign-reply.js';
import { assetManager } from '../../../core/campaign-loop.js';
import { getCampaignByChannel } from '../../../campaign/state.js';

async function getData(guildId: string, discordId: string): Promise<CharacterDraftData> {
  const draft = await getCharacterDraft(guildId, discordId);
  return parseJson<CharacterDraftData>(draft?.data ?? '{}', {});
}

async function save(
  guildId: string,
  discordId: string,
  step: WizardStep,
  patch: Partial<CharacterDraftData>,
  campaignId?: string,
  abilityMethod?: string,
) {
  await upsertCharacterDraft(guildId, discordId, step, patch as Record<string, unknown>, campaignId, abilityMethod);
}

function spellOptions(rules: Awaited<ReturnType<typeof loadRulesData>>, classKey: string, level: number, page = 0) {
  const all = getSpellsForClass(rules, classKey, level);
  const pageSize = 25;
  const slice = all.slice(page * pageSize, (page + 1) * pageSize);
  return { all, slice, page, pageSize, hasMore: all.length > (page + 1) * pageSize, hasPrev: page > 0 };
}

type SpellPickKind = 'cantrips' | 'spells_known' | 'spells_prepared';

function parseSpellPageId(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const page = parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(page) ? page : null;
}

function getSpellPickConfig(
  kind: SpellPickKind,
  data: CharacterDraftData,
  rules: Awaited<ReturnType<typeof loadRulesData>>,
) {
  const c = getClassDefinition(rules, data.classKey!)!;
  const sc = c.spellcasting!;
  if (kind === 'cantrips') {
    return { level: 0, required: sc.cantripsKnown, field: 'cantrips' as const, title: 'Cantrips' };
  }
  if (kind === 'spells_known') {
    return { level: 1, required: sc.spellsKnown!, field: 'spellsKnown' as const, title: '1st-level spells known' };
  }
  const race = SRD_RACES.find((r) => r.key === data.raceKey)!;
  const scores = finalizeAbilityScores(data, race);
  const ability = sc.ability as Ability;
  const required = computeSpellsPreparedCount(scores[ability], 1);
  return { level: 1, required, field: 'spellsPrepared' as const, title: 'Prepared spells' };
}

function mergeSpellPicks(current: string[], picks: string[], required: number): string[] {
  return [...new Set([...current, ...picks])].slice(0, required);
}

function truncate(text: string, max = 100): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

type PersonalityField = 'trait' | 'ideal' | 'bond' | 'flaw';

const PERSONALITY_FIELD_KEY: Record<PersonalityField, keyof CharacterDraftData> = {
  trait: 'personalityTrait',
  ideal: 'ideal',
  bond: 'bond',
  flaw: 'flaw',
};

function buildNameModal(flawSelection?: string): ModalBuilder {
  const customId = flawSelection ? `char_wiz_name__${flawSelection}` : 'char_wiz_name';
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Character Name')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true),
      ),
    );
}

function buildPersonalityCustomModal(field: PersonalityField): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`char_wiz_personality_custom_${field}_modal`)
    .setTitle(`Write your own ${field}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel(field.charAt(0).toUpperCase() + field.slice(1))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(400),
      ),
    );
}

function resolvePersonalityValue(field: PersonalityField, value: string, data: CharacterDraftData): string {
  const match = value.match(/^p_(trait|ideal|bond|flaw)_(\d+)$/);
  if (!match) return value;
  const idx = parseInt(match[2], 10);
  const opts = data.personalityOptions!;
  const list = { trait: opts.traits, ideal: opts.ideals, bond: opts.bonds, flaw: opts.flaws }[field];
  return list[idx] ?? value;
}

function buildPointBuyModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId('char_wiz_pointbuy_modal').setTitle('Point Buy (8–15 each)');
  for (const ab of ABILITIES) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(ab).setLabel(ab).setStyle(TextInputStyle.Short).setRequired(true).setValue('8'),
      ),
    );
  }
  return modal;
}

type WizardMessagePayload = {
  embeds?: EmbedBuilder[];
  components?: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>>;
  content?: string;
  files?: AttachmentBuilder[];
};

/** Prefer editReply for deferred interactions — ephemeral wizard messages cannot be PATCHed via message.edit(). */
export function shouldEditWizardViaReply(interaction: Interaction): boolean {
  return 'deferred' in interaction && Boolean(interaction.deferred || interaction.replied);
}

/** Edit the wizard ephemeral message (works after deferUpdate or modal submit). */
async function editWizardMessage(interaction: Interaction, payload: WizardMessagePayload): Promise<void> {
  if (shouldEditWizardViaReply(interaction)) {
    await (interaction as { editReply: (opts: WizardMessagePayload) => Promise<unknown> }).editReply(payload);
    return;
  }
  if (interaction.isModalSubmit() && interaction.message?.editable) {
    await interaction.message.edit(payload);
    return;
  }
  await (interaction as { editReply: (opts: WizardMessagePayload) => Promise<unknown> }).editReply(payload);
}

/** Whether this interaction must show a modal as its first response (no deferUpdate). */
export function wizardUsesModalFirst(interaction: Interaction, id: string): boolean {
  if (interaction.isButton() && (id === 'char_wiz_name_btn' || (id.startsWith('char_wiz_personality_custom_') && !id.includes('_modal')))) {
    return true;
  }
  if (interaction.isStringSelectMenu() && id === 'char_wiz_abilities_method' && interaction.values[0] === 'pointbuy') {
    return true;
  }
  if (interaction.isStringSelectMenu() && id === 'char_wiz_personality_flaw') {
    return true;
  }
  return false;
}

/** Whether this interaction should defer immediately before slow I/O. */
export function wizardShouldDeferFirst(interaction: Interaction, id: string): boolean {
  if (wizardUsesModalFirst(interaction, id)) return false;
  if (interaction.isButton() && /^char_wiz_spell_info_(cantrips|spells_known|spells_prepared)_\d+$/.test(id)) {
    return false;
  }
  return interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit();
}

function buildSpellDetailEmbed(
  spells: Array<{ name: string; school: string; castingTime: string; range: string; description: string }>,
  title: string,
  page: number,
): EmbedBuilder {
  const body = spells
    .map((s) => `**${s.name}** · ${s.school} · ${s.castingTime} · ${s.range}\n${truncate(s.description, 200)}`)
    .join('\n\n');
  return new EmbedBuilder()
    .setTitle(`📖 ${title} — page ${page + 1}`)
    .setDescription(body || 'No spells on this page.')
    .setFooter({ text: 'Only you can see this reference. Pick spells from the menu above.' })
    .setColor(0x4a0080);
}

export async function startCharacterWizard(
  guildId: string,
  discordId: string,
  campaignId?: string,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder>[] }> {
  const rules = await loadRulesData();
  await save(guildId, discordId, 'race', {}, campaignId);

  const intro = buildGettingStartedEmbed();
  intro.addFields({ name: 'Character wizard', value: '**Step 1 — Ancestry:** choose your race/subrace below.' });

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('char_wiz_race')
      .setPlaceholder('Choose ancestry')
      .addOptions(
        rules.races.slice(0, 25).map((r) => ({
          label: r.name,
          value: r.key,
          description: truncate(`${Object.entries(r.abilityBonuses).map(([a, b]) => `${a}+${b}`).join(', ') || 'No bonus'} · ${r.traits[0] ?? ''}`),
        })),
      ),
  );

  return { embeds: [intro], components: [row] };
}

export async function handleCharacterWizardComponent(interaction: Interaction): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit() && !interaction.isButton()) return false;

  const id = interaction.customId;
  if (!id.startsWith('char_wiz_') && id !== 'char_finalize') return false;

  const guildId = interaction.guildId;

  // --- Phase 1: acknowledge Discord within 3 seconds (before DB/rules I/O) ---
  if (interaction.isStringSelectMenu() && id === 'char_wiz_abilities_method' && interaction.values[0] === 'pointbuy') {
    await interaction.showModal(buildPointBuyModal());
    return true;
  }

  if (interaction.isButton() && id.startsWith('char_wiz_personality_custom_') && !id.includes('_modal')) {
    const field = id.replace('char_wiz_personality_custom_', '') as PersonalityField;
    await interaction.showModal(buildPersonalityCustomModal(field));
    return true;
  }

  if (interaction.isButton() && id === 'char_wiz_name_btn') {
    await interaction.showModal(buildNameModal());
    return true;
  }

  if (interaction.isButton() && id === 'char_wiz_appearance_btn') {
    await interaction.showModal(buildAppearanceModal());
    return true;
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_personality_flaw') {
    const selectedFlaw = interaction.values[0];
    // Acknowledge with the modal immediately — getData/save must not run before showModal.
    await interaction.showModal(buildNameModal(selectedFlaw));
    const flawData = await getData(guildId, interaction.user.id);
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    const flaw = resolvePersonalityValue('flaw', selectedFlaw, flawData);
    await save(guildId, interaction.user.id, 'name', { ...flawData, flaw }, campaign?.id);
    return true;
  }

  if (interaction.isButton() && /^char_wiz_spell_info_(cantrips|spells_known|spells_prepared)_\d+$/.test(id)) {
    await interaction.deferReply({ ephemeral: true });
    const match = id.match(/^char_wiz_spell_info_(cantrips|spells_known|spells_prepared)_(\d+)$/)!;
    const kind = match[1] as SpellPickKind;
    const page = parseInt(match[2], 10);
    const rules = await loadRulesData();
    const data = await getData(guildId, interaction.user.id);
    const config = getSpellPickConfig(kind, data, rules);
    const { slice } = spellOptions(rules, data.classKey!, config.level, page);
    await interaction.editReply({ embeds: [buildSpellDetailEmbed(slice, config.title, page)] });
    return true;
  }

  if (wizardShouldDeferFirst(interaction, id)) {
    await interaction.deferUpdate();
  }

  // --- Phase 2: load context (safe after ack) ---
  const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
  const rules = await loadRulesData();
  let data = await getData(guildId, interaction.user.id);

  if (interaction.isStringSelectMenu() && id === 'char_wiz_race') {
    const raceKey = interaction.values[0];
    const race = rules.races.find((r) => r.key === raceKey)!;
    data = { ...data, raceKey, race: race.name, raceTraits: race.traits, speed: race.speed, size: race.size };
    await save(guildId, interaction.user.id, 'class', data, campaign?.id);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('char_wiz_class')
        .setPlaceholder('Choose class')
        .addOptions(
          rules.classes.map((c) => ({
            label: c.name,
            value: c.key,
            description: truncate(`${c.hitDie} HP · Saves ${c.savingThrows.join('/')}${c.spellcasting ? ' · Caster' : ''} · ${c.features[0] ?? ''}`),
          })),
        ),
    );
    await editWizardMessage(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle('Step 2 — Class')
          .setDescription(
            `**${race.name}** selected.\n\nOpen the menu — each class shows hit die, saves, and a feature preview.`,
          )
          .setColor(0x4a0080),
      ],
      components: [row],
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_class') {
    const classKey = interaction.values[0];
    const c = rules.classes.find((x) => x.key === classKey)!;
    data = { ...data, classKey, className: c.name, hitDie: c.hitDie, savingThrows: c.savingThrows, classChoices: {}, classSkills: [], cantrips: [], spellsKnown: [], spellsPrepared: [] };
    if (c.level1Choices?.length) {
      const choice = c.level1Choices[0];
      await save(guildId, interaction.user.id, 'class_choice', data, campaign?.id);
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`char_wiz_class_choice_${choice.key}`)
          .setPlaceholder(choice.label)
          .addOptions(choice.options.map((o) => ({ label: o.label, value: o.key, description: o.description?.slice(0, 100) }))),
      );
      await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle(`Step 3 — ${choice.label}`).setColor(0x4a0080)], components: [row] });
      return true;
    }
    await save(guildId, interaction.user.id, 'background', data, campaign?.id);
    return advanceToBackground(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_class_choice_')) {
    const choiceKey = id.replace('char_wiz_class_choice_', '');
    data = { ...data, classChoices: { ...(data.classChoices ?? {}), [choiceKey]: interaction.values[0] } };
    await save(guildId, interaction.user.id, 'background', data, campaign?.id);
    return advanceToBackground(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_background') {
    const bg = rules.backgrounds.find((b) => b.key === interaction.values[0])!;
    data = { ...data, backgroundKey: bg.key, background: bg.name, backgroundSkills: bg.skillProficiencies, backgroundFeatures: bg.features, backgroundEquipment: bg.equipment, personalityOptions: { traits: bg.personalityTraits, ideals: bg.ideals, bonds: bg.bonds, flaws: bg.flaws } };
    await save(guildId, interaction.user.id, 'abilities_method', data, campaign?.id);
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('char_wiz_abilities_method').setPlaceholder('Ability score method').addOptions([
        { label: 'Standard Array', value: 'standard' },
        { label: 'Roll 4d6 drop lowest', value: 'roll' },
        { label: 'Point Buy (27 pts)', value: 'pointbuy' },
      ]),
    );
    await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Step 5 — Ability Scores').setDescription(`Background skills: ${bg.skillProficiencies.join(', ')}`)], components: [row] });
    return true;
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_abilities_method') {
    const method = interaction.values[0] as 'standard' | 'roll' | 'pointbuy';
    data = { ...data, abilityMethod: method, scorePool: method === 'standard' ? [...STANDARD_ARRAY] : rollAbilityScores(), abilityAssignment: {} };
    await save(guildId, interaction.user.id, 'abilities_assign', data, campaign?.id, method);
    return renderAbilityAssign(interaction, data);
  }

  if (interaction.isModalSubmit() && id === 'char_wiz_pointbuy_modal') {
    const scores = {} as Record<Ability, number>;
    for (const ab of ABILITIES) scores[ab] = parseInt(interaction.fields.getTextInputValue(ab), 10);
    const result = validatePointBuyScores(scores);
    if (!result.valid) {
      await editWizardMessage(interaction, {
        embeds: [new EmbedBuilder().setTitle('Invalid point buy').setDescription(result.error ?? 'Check your scores.')],
        components: [],
      });
      return true;
    }
    data = { ...data, abilityMethod: 'pointbuy', pointBuyScores: scores };
    await save(guildId, interaction.user.id, data.raceKey === 'half-elf' ? 'half_elf_abilities' : 'skills', data, campaign?.id, 'pointbuy');
    if (data.raceKey === 'half-elf') return renderHalfElf(interaction, data);
    return advanceToSkills(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_assign_')) {
    const ability = id.replace('char_wiz_assign_', '') as Ability;
    const pool = getRemainingPool(data);
    const picked = interaction.values[0];
    const index = picked.startsWith('pool_idx_') ? parseInt(picked.replace('pool_idx_', ''), 10) : pool.indexOf(parseInt(picked, 10));
    const score = pool[index];
    if (score === undefined) {
      return renderAbilityAssign(interaction, data);
    }
    data = { ...data, abilityAssignment: { ...(data.abilityAssignment ?? {}), [ability]: score } };
    if (getNextAbilityToAssign(data)) {
      await save(guildId, interaction.user.id, 'abilities_assign', data, campaign?.id, data.abilityMethod);
      return renderAbilityAssign(interaction, data);
    }
    await save(guildId, interaction.user.id, data.raceKey === 'half-elf' ? 'half_elf_abilities' : 'skills', data, campaign?.id, data.abilityMethod);
    if (data.raceKey === 'half-elf') return renderHalfElf(interaction, data);
    return advanceToSkills(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_halfelf_')) {
    const idx = id.endsWith('_1') ? 0 : 1;
    const picked = interaction.values[0] as Ability;
    const current: Ability[] = [...(data.halfElfBonuses ?? [])];
    current[idx] = picked;
    data = { ...data, halfElfBonuses: current as [Ability, Ability] };
    if (idx === 0) {
      await save(guildId, interaction.user.id, 'half_elf_abilities', data, campaign?.id);
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId('char_wiz_halfelf_2').setPlaceholder('Second +1 ability').addOptions(ABILITIES.filter((a) => a !== picked).map((a) => ({ label: a, value: a }))),
      );
      await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Half-Elf +1 (2 of 2)')], components: [row] });
      return true;
    }
    await save(guildId, interaction.user.id, 'skills', data, campaign?.id);
    return advanceToSkills(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_skills') {
    data = { ...data, classSkills: interaction.values };
    await save(guildId, interaction.user.id, data.classKey === 'rogue' ? 'expertise' : needsLanguageStep(data) ? 'languages' : 'equipment', data, campaign?.id);
    if (data.classKey === 'rogue') return renderExpertise(interaction, data);
    if (needsLanguageStep(data)) return renderLanguages(interaction, data);
    return advanceToEquipment(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_expertise') {
    data = { ...data, expertiseSkills: interaction.values };
    await save(guildId, interaction.user.id, needsLanguageStep(data) ? 'languages' : 'equipment', data, campaign?.id);
    if (needsLanguageStep(data)) return renderLanguages(interaction, data);
    return advanceToEquipment(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_languages') {
    data = { ...data, extraLanguages: interaction.values };
    await save(guildId, interaction.user.id, 'equipment', data, campaign?.id);
    return advanceToEquipment(interaction, data, rules);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_equipment') {
    const c = getClassDefinition(rules, data.classKey!)!;
    const pack = c.startingEquipment.find((p) => p.label === interaction.values[0]);
    data = { ...data, equipmentPackage: interaction.values[0], equipment: [...(pack?.items ?? []), ...(data.backgroundEquipment ?? [])] };
    await save(guildId, interaction.user.id, c.spellcasting?.cantripsKnown ? 'cantrips' : 'personality', data, campaign?.id);
    if (c.spellcasting?.cantripsKnown) return renderSpellPicker(interaction, data, rules, 'cantrips', 0);
    return advanceToPersonality(interaction, data);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_cantrips_pick_')) {
    const page = parseSpellPageId(id, 'char_wiz_cantrips_pick_') ?? 0;
    const config = getSpellPickConfig('cantrips', data, rules);
    const merged = mergeSpellPicks(data.cantrips ?? [], interaction.values, config.required);
    data = { ...data, cantrips: merged };
    if (merged.length >= config.required) return advanceAfterCantrips(interaction, data, rules, guildId, campaign?.id);
    await save(guildId, interaction.user.id, 'cantrips', data, campaign?.id);
    return renderSpellPicker(interaction, data, rules, 'cantrips', page);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_spells_known_pick_')) {
    const page = parseSpellPageId(id, 'char_wiz_spells_known_pick_') ?? 0;
    const config = getSpellPickConfig('spells_known', data, rules);
    const merged = mergeSpellPicks(data.spellsKnown ?? [], interaction.values, config.required);
    data = { ...data, spellsKnown: merged };
    if (merged.length >= config.required) {
      await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
      return advanceToPersonality(interaction, data);
    }
    await save(guildId, interaction.user.id, 'spells_known', data, campaign?.id);
    return renderSpellPicker(interaction, data, rules, 'spells_known', page);
  }

  if (interaction.isStringSelectMenu() && id.startsWith('char_wiz_spells_prepared_pick_')) {
    const page = parseSpellPageId(id, 'char_wiz_spells_prepared_pick_') ?? 0;
    const config = getSpellPickConfig('spells_prepared', data, rules);
    const merged = mergeSpellPicks(data.spellsPrepared ?? [], interaction.values, config.required);
    data = { ...data, spellsPrepared: merged };
    if (merged.length >= config.required) {
      await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
      return advanceToPersonality(interaction, data);
    }
    await save(guildId, interaction.user.id, 'spells_prepared', data, campaign?.id);
    return renderSpellPicker(interaction, data, rules, 'spells_prepared', page);
  }

  if (interaction.isButton() && id.startsWith('char_wiz_cantrips_page_')) {
    const page = parseInt(id.replace('char_wiz_cantrips_page_', ''), 10);
    return renderSpellPicker(interaction, data, rules, 'cantrips', page);
  }

  if (interaction.isButton() && id.startsWith('char_wiz_spells_known_page_')) {
    const page = parseInt(id.replace('char_wiz_spells_known_page_', ''), 10);
    return renderSpellPicker(interaction, data, rules, 'spells_known', page);
  }

  if (interaction.isButton() && id.startsWith('char_wiz_spells_prepared_page_')) {
    const page = parseInt(id.replace('char_wiz_spells_prepared_page_', ''), 10);
    return renderSpellPicker(interaction, data, rules, 'spells_prepared', page);
  }

  if (interaction.isButton() && id === 'char_wiz_cantrips_done') {
    return advanceAfterCantrips(interaction, data, rules, guildId, campaign?.id);
  }

  if (interaction.isButton() && id === 'char_wiz_spells_known_done') {
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    return advanceToPersonality(interaction, data);
  }

  if (interaction.isButton() && id === 'char_wiz_spells_prepared_done') {
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    return advanceToPersonality(interaction, data);
  }

  if (interaction.isStringSelectMenu() && id === 'char_wiz_personality_trait') {
    data = { ...data, personalityTrait: resolvePersonalityValue('trait', interaction.values[0], data) };
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    return renderPersonalityStep(interaction, data, 'ideal');
  }
  if (interaction.isStringSelectMenu() && id === 'char_wiz_personality_ideal') {
    data = { ...data, ideal: resolvePersonalityValue('ideal', interaction.values[0], data) };
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    return renderPersonalityStep(interaction, data, 'bond');
  }
  if (interaction.isStringSelectMenu() && id === 'char_wiz_personality_bond') {
    data = { ...data, bond: resolvePersonalityValue('bond', interaction.values[0], data) };
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    return renderPersonalityStep(interaction, data, 'flaw');
  }
  if (interaction.isModalSubmit() && id.startsWith('char_wiz_personality_custom_') && id.endsWith('_modal')) {
    const field = id.replace('char_wiz_personality_custom_', '').replace('_modal', '') as PersonalityField;
    const value = interaction.fields.getTextInputValue('text').trim();
    if (!value) {
      await interaction.followUp({ content: 'Please enter some text.', ephemeral: true });
      return true;
    }
    const key = PERSONALITY_FIELD_KEY[field];
    data = { ...data, [key]: value };
    if (field === 'flaw') {
      await save(guildId, interaction.user.id, 'name', data, campaign?.id);
      await editWizardMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Personality complete')
            .setDescription('Flaw saved. Click **Set character name** to continue.')
            .setColor(0x4a0080),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('char_wiz_name_btn').setLabel('Set character name').setStyle(ButtonStyle.Primary),
          ),
        ],
      });
      return true;
    }
    await save(guildId, interaction.user.id, 'personality', data, campaign?.id);
    const next = { trait: 'ideal', ideal: 'bond', bond: 'flaw' }[field] as PersonalityField;
    return renderPersonalityStep(interaction as unknown as StringSelectMenuInteraction, data, next);
  }

  if (interaction.isModalSubmit() && id.startsWith('char_wiz_name')) {
    if (id.startsWith('char_wiz_name__')) {
      const flawRef = id.slice('char_wiz_name__'.length);
      data = { ...data, flaw: resolvePersonalityValue('flaw', flawRef, data) };
    }
    data = { ...data, name: interaction.fields.getTextInputValue('name'), appearanceAnswers: data.appearanceAnswers ?? {}, appearanceIndex: 0 };
    await save(guildId, interaction.user.id, 'appearance', data, campaign?.id);
    return renderAppearanceStep(interaction, data);
  }

  if (interaction.isModalSubmit() && id === 'char_wiz_appearance_modal') {
    const look = interaction.fields.getTextInputValue('look').trim();
    data = {
      ...data,
      appearanceAnswers: { ...(data.appearanceAnswers ?? {}), look },
    };
    await save(guildId, interaction.user.id, 'review', data, campaign?.id);
    return renderReview(interaction, data);
  }

  if (interaction.isButton() && id === 'char_wiz_appearance_skip') {
    await save(guildId, interaction.user.id, 'review', data, campaign?.id);
    return renderReview(interaction, data);
  }

  if (interaction.isButton() && (id === 'char_wiz_finalize' || id === 'char_finalize')) {
    try {
      await editWizardMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Creating your character…')
            .setDescription('Saving your sheet and painting your portrait. This may take a moment.')
            .setColor(0x4a0080),
        ],
        components: [],
      });

      const character = await finalizeCharacter(guildId, interaction.user.id, campaign?.id);
      const portrait = await assetManager.generateCharacterPortraitOnCreate(
        character.id,
        guildId,
        interaction.user.id,
        campaign?.id,
      );
      const portraitReady = isRenderableImagePath(portrait?.localPath);
      const sheetEmbeds = buildCharacterSheetEmbeds(character, portrait?.localPath);
      const payload: WizardMessagePayload = {
        embeds: [
          buildCharacterCreatedEmbed(character.name, {
            race: character.race,
            className: character.className,
            portraitReady,
          }),
          ...sheetEmbeds,
        ],
        components: [],
      };
      if (portraitReady && portrait?.localPath) {
        payload.files = [new AttachmentBuilder(portrait.localPath, { name: 'portrait.png' })];
      }
      await editWizardMessage(interaction, payload);
    } catch (err) {
      await editWizardMessage(interaction, { content: `Error: ${(err as Error).message}`, components: [] });
    }
    return true;
  }

  return false;
}

function needsLanguageStep(data: CharacterDraftData): boolean {
  return ['half-elf', 'high-elf', 'human'].includes(data.raceKey ?? '') && !data.extraLanguages?.length;
}

async function advanceAfterCantrips(
  interaction: Interaction,
  data: CharacterDraftData,
  rules: Awaited<ReturnType<typeof loadRulesData>>,
  guildId: string,
  campaignId?: string,
) {
  const c = getClassDefinition(rules, data.classKey!)!;
  if (c.spellcasting?.spellsKnown) {
    await save(guildId, interaction.user.id, 'spells_known', data, campaignId);
    return renderSpellPicker(interaction, data, rules, 'spells_known', 0);
  }
  if (c.spellcasting?.spellsPrepared) {
    await save(guildId, interaction.user.id, 'spells_prepared', data, campaignId);
    return renderSpellPicker(interaction, data, rules, 'spells_prepared', 0);
  }
  await save(guildId, interaction.user.id, 'personality', data, campaignId);
  return advanceToPersonality(interaction, data);
}

async function advanceToBackground(interaction: StringSelectMenuInteraction, data: CharacterDraftData, rules: Awaited<ReturnType<typeof loadRulesData>>) {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('char_wiz_background')
      .setPlaceholder('Choose background')
      .addOptions(
        rules.backgrounds.map((b) => ({
          label: b.name,
          value: b.key,
          description: truncate(`Skills: ${b.skillProficiencies.join(', ')} · ${b.features[0]}`),
        })),
      ),
  );
  await editWizardMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle('Step 4 — Background')
        .setDescription(
          `**${data.className}** selected.\n\nEach background lists **skill proficiencies** and its **feature** in the dropdown. Open the menu to compare options.`,
        )
        .setColor(0x4a0080),
    ],
    components: [row],
  });
  return true;
}

async function renderAbilityAssign(interaction: StringSelectMenuInteraction, data: CharacterDraftData) {
  const ability = getNextAbilityToAssign(data)!;
  const pool = getRemainingPool(data);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`char_wiz_assign_${ability}`)
      .setPlaceholder(`Assign ${ability}`)
      // Discord requires unique option values — rolled scores can duplicate (e.g. two 12s).
      .addOptions(pool.map((score, index) => ({ label: String(score), value: `pool_idx_${index}` }))),
  );
  await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Assign scores').setDescription(`Pool: ${(data.scorePool ?? []).join(', ')}`)], components: [row] });
  return true;
}

async function renderHalfElf(interaction: Interaction, data: CharacterDraftData) {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('char_wiz_halfelf_1').setPlaceholder('+1 ability').addOptions(ABILITIES.filter((a) => a !== 'CHA').map((a) => ({ label: a, value: a }))),
  );
  await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Half-Elf +1 (1 of 2)')], components: [row] });
  return true;
}

async function advanceToSkills(interaction: Interaction, data: CharacterDraftData, rules: Awaited<ReturnType<typeof loadRulesData>>) {
  const c = getClassDefinition(rules, data.classKey!)!;
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('char_wiz_skills').setMinValues(c.skillChoices.count).setMaxValues(c.skillChoices.count).addOptions(c.skillChoices.options.map((s) => ({ label: s, value: s }))),
  );
  await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Class skills').setDescription(`Background: ${(data.backgroundSkills ?? []).join(', ')}`)], components: [row] });
  return true;
}

async function renderLanguages(interaction: Interaction, data: CharacterDraftData) {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('char_wiz_languages').setMinValues(1).setMaxValues(1).addOptions(EXTRA_LANGUAGES.slice(0, 25).map((l) => ({ label: l, value: l }))),
  );
  await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Bonus language')], components: [row] });
  return true;
}

async function renderExpertise(interaction: Interaction, data: CharacterDraftData) {
  const skills = assembleSkills(data);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('char_wiz_expertise')
      .setPlaceholder('Choose 2 skills for Expertise')
      .setMinValues(2)
      .setMaxValues(2)
      .addOptions(skills.map((s) => ({ label: s, value: s }))),
  );
  await editWizardMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle('Rogue — Expertise')
        .setDescription(
          `Pick **2** skills you are proficient in. You add **double** your proficiency bonus to these checks.\n\nProficiencies: ${skills.join(', ')}`,
        )
        .setColor(0x4a0080),
    ],
    components: [row],
  });
  return true;
}

async function renderSpellPicker(
  interaction: Interaction,
  data: CharacterDraftData,
  rules: Awaited<ReturnType<typeof loadRulesData>>,
  kind: SpellPickKind,
  page: number,
) {
  const config = getSpellPickConfig(kind, data, rules);
  const selected = (data[config.field] ?? []) as string[];
  const remaining = config.required - selected.length;
  const { slice, hasMore, hasPrev, all, pageSize } = spellOptions(rules, data.classKey!, config.level, page);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));

  const components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];

  if (remaining > 0 && slice.length > 0) {
    const available = slice.filter((s) => !selected.includes(s.key));
    if (available.length > 0) {
      const maxPick = Math.min(remaining, available.length);
      const prefix =
        kind === 'cantrips'
          ? 'char_wiz_cantrips_pick_'
          : kind === 'spells_known'
            ? 'char_wiz_spells_known_pick_'
            : 'char_wiz_spells_prepared_pick_';
      components.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${prefix}${page}`)
            .setPlaceholder(`Add spells (${selected.length}/${config.required})`)
            .setMinValues(1)
            .setMaxValues(maxPick)
            .addOptions(
              available.map((s) => ({
                label: s.name,
                value: s.key,
                description: truncate(`${s.school} · ${s.castingTime} · ${s.description}`),
              })),
            ),
        ),
      );
    }
  }

  if (hasPrev || hasMore) {
    const pagePrefix =
      kind === 'cantrips'
        ? 'char_wiz_cantrips_page_'
        : kind === 'spells_known'
          ? 'char_wiz_spells_known_page_'
          : 'char_wiz_spells_prepared_page_';
    const infoPrefix =
      kind === 'cantrips'
        ? 'char_wiz_spell_info_cantrips_'
        : kind === 'spells_known'
          ? 'char_wiz_spell_info_spells_known_'
          : 'char_wiz_spell_info_spells_prepared_';
    const nav = new ActionRowBuilder<ButtonBuilder>();
    if (hasPrev) nav.addComponents(new ButtonBuilder().setCustomId(`${pagePrefix}${page - 1}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary));
    nav.addComponents(
      new ButtonBuilder().setCustomId(`${infoPrefix}${page}`).setLabel('📖 Spell details').setStyle(ButtonStyle.Primary),
    );
    if (hasMore) nav.addComponents(new ButtonBuilder().setCustomId(`${pagePrefix}${page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));
    components.push(nav);
  } else if (slice.length > 0) {
    const infoPrefix =
      kind === 'cantrips'
        ? 'char_wiz_spell_info_cantrips_'
        : kind === 'spells_known'
          ? 'char_wiz_spell_info_spells_known_'
          : 'char_wiz_spell_info_spells_prepared_';
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${infoPrefix}${page}`).setLabel('📖 Spell details (this page)').setStyle(ButtonStyle.Primary),
      ),
    );
  }

  if (remaining <= 0) {
    const doneId =
      kind === 'cantrips'
        ? 'char_wiz_cantrips_done'
        : kind === 'spells_known'
          ? 'char_wiz_spells_known_done'
          : 'char_wiz_spells_prepared_done';
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(doneId).setLabel('Continue').setStyle(ButtonStyle.Primary),
      ),
    );
  }

  const selectedLabels = selected.map((key) => all.find((s) => s.key === key)?.name ?? key).join(', ');

  await editWizardMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle(config.title)
        .setDescription(
          [
            `**${selected.length}/${config.required}** selected${remaining > 0 ? ` — pick **${remaining}** more` : ' — ready to continue'}`,
            selected.length ? `Selected: ${selectedLabels}` : 'Open the menu to add spells — each row shows school, casting time, and a short description.',
            'Tap **📖 Spell details** for full text on this page.',
            totalPages > 1 ? `Page **${page + 1}** of **${totalPages}**` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        )
        .setColor(0x4a0080),
    ],
    components,
  });
  return true;
}

async function advanceToEquipment(interaction: Interaction, data: CharacterDraftData, rules: Awaited<ReturnType<typeof loadRulesData>>) {
  const c = getClassDefinition(rules, data.classKey!)!;
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId('char_wiz_equipment').addOptions(c.startingEquipment.map((p) => ({ label: `Package ${p.label}`, value: p.label }))),
  );
  await editWizardMessage(interaction, { embeds: [new EmbedBuilder().setTitle('Starting equipment')], components: [row] });
  return true;
}

async function advanceToPersonality(interaction: Interaction, data: CharacterDraftData) {
  return renderPersonalityStep(interaction as StringSelectMenuInteraction, data, 'trait');
}

async function renderPersonalityStep(interaction: StringSelectMenuInteraction, data: CharacterDraftData, field: PersonalityField) {
  const opts = data.personalityOptions!;
  const map = { trait: opts.traits, ideal: opts.ideals, bond: opts.bonds, flaw: opts.flaws };
  const ids = { trait: 'char_wiz_personality_trait', ideal: 'char_wiz_personality_ideal', bond: 'char_wiz_personality_bond', flaw: 'char_wiz_personality_flaw' };
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ids[field])
      .setPlaceholder(`Choose ${field} from background suggestions`)
      .addOptions(map[field].slice(0, 25).map((t, i) => ({ label: truncate(t, 100), value: `p_${field}_${i}`, description: truncate(t, 100) }))),
  );
  const customRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`char_wiz_personality_custom_${field}`)
      .setLabel(`Write my own ${field}`)
      .setStyle(ButtonStyle.Secondary),
  );
  await editWizardMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Personality — ${field}`)
        .setDescription(
          'Pick a suggestion from the list (each row shows the full text), or tap **Write my own** to enter your own.',
        )
        .setColor(0x4a0080),
    ],
    components: [selectRow, customRow],
  });
  return true;
}

async function renderAppearanceStep(interaction: Interaction, data: CharacterDraftData) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('char_wiz_appearance_btn')
      .setLabel('Describe their look')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('char_wiz_appearance_skip')
      .setLabel('Skip for now')
      .setStyle(ButtonStyle.Secondary),
  );
  await editWizardMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Appearance — ${data.name}`)
        .setDescription(
          '**How does your character look?** This drives your portrait art.\n\n' +
            'Face, build, hair, clothing, colors, scars — a few vivid lines are enough. ' +
            'You can regenerate later with `/portrait generate`.',
        )
        .setColor(0x4a0080),
    ],
    components: [row],
  });
  return true;
}

function buildAppearanceModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('char_wiz_appearance_modal')
    .setTitle('Character appearance')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('look')
          .setLabel('Describe your character\'s look')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('e.g. Broad-shouldered dwarf with copper braids, soot-stained leather apron, kind amber eyes, iron holy symbol at the neck…'),
      ),
    );
}

async function renderReview(interaction: Interaction, data: CharacterDraftData) {
  const look = data.appearanceAnswers?.look?.trim();
  const buttons = [
    new ButtonBuilder().setCustomId('char_wiz_finalize').setLabel('Create character').setStyle(ButtonStyle.Success),
  ];
  if (!look) {
    buttons.push(
      new ButtonBuilder().setCustomId('char_wiz_appearance_btn').setLabel('Add appearance').setStyle(ButtonStyle.Secondary),
    );
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

  const preview = buildCharacterPreviewFromDraft(data);
  const intro = new EmbedBuilder()
    .setColor(0x4a0080)
    .setTitle('Review your character')
    .setDescription(
      look
        ? 'Your full sheet is below. When everything looks right, press **Create character**.'
        : 'Your full sheet is below. You can **Add appearance** for a better portrait, or press **Create character** to finish.',
    );

  const embeds: EmbedBuilder[] = [intro];
  if (preview) {
    const sheetEmbeds = buildCharacterSheetEmbeds(preview);
    embeds.push(...sheetEmbeds);
  } else {
    embeds.push(
      new EmbedBuilder()
        .setTitle(`Review — ${data.name ?? 'Unnamed'}`)
        .setDescription(`${data.race} ${data.className} · ${data.background}`)
        .setFooter({ text: 'Some sheet details could not be previewed — try completing earlier steps.' }),
    );
  }

  await editWizardMessage(interaction, {
    embeds,
    components: [row],
  });
  return true;
}
