import { randomUUID } from 'crypto';
import { prisma } from '../../db/client.js';
import { toJson, parseJson } from '../../utils/helpers.js';
import { rollInitiative, executeRoll, rollDamage } from '../dice/engine.js';
import type { Ability } from '../../utils/helpers.js';
import { getRemainingSlots, getSpellSlotState } from './spell-slots.js';
import { rollDeathSave } from './death-saves.js';
import { concentrationSaveDc, rollConcentrationSave } from './concentration.js';
import { formatSpellKey } from '../character/spell-reference.js';

export type ActionEconomy = 'action' | 'bonus' | 'reaction' | 'free';

export interface CombatParticipant {
  id: string;
  name: string;
  type: 'player' | 'npc' | 'enemy';
  characterId?: string;
  ac: number;
  hp: number;
  maxHp: number;
  initiative: number;
  conditions: string[];
  attackBonus?: number;
  damage?: string;
  /** Remaining spell slots (level → count), players only */
  spellSlotsRemaining?: Record<string, number>;
  concentratingOn?: string | null;
  deathSaveSuccesses?: number;
  deathSaveFailures?: number;
  isUnconscious?: boolean;
  hasUsedAction?: boolean;
  hasUsedBonusAction?: boolean;
  hasReaction?: boolean;
  /** Temporary AC bonus (e.g. Shield spell) until start of this participant's next turn */
  acBonus?: number;
}

export interface CombatEnemyInput {
  name: string;
  ac?: number;
  hp?: number;
  attackBonus?: number;
  damage?: string;
}

export interface AttackResult {
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  targetType: 'player' | 'npc' | 'enemy';
  hit: boolean;
  critical: boolean;
  natural1: boolean;
  attackRoll: number;
  attackTotal: number;
  targetAc: number;
  damage?: number;
  damageBreakdown?: string;
  targetHpAfter: number;
  targetDefeated: boolean;
  breakdown: string;
  method?: 'weapon' | 'spell' | 'opportunity';
  spellName?: string;
  concentrationBroken?: { spellKey: string; breakdown: string };
}

export interface ActiveCombat {
  id: string;
  round: number;
  currentTurn: number;
  participants: CombatParticipant[];
  reinforcementsArrived: string[];
  locationId?: string | null;
  locationName?: string | null;
  absentParty?: string[];
}

export interface DamageEffectResult {
  hpAfter: number;
  defeated: boolean;
  concentrationBroken?: { spellKey: string; breakdown: string };
}

function defaultEconomy(p: CombatParticipant): CombatParticipant {
  return {
    ...p,
    hasUsedAction: p.hasUsedAction ?? false,
    hasUsedBonusAction: p.hasUsedBonusAction ?? false,
    hasReaction: p.hasReaction ?? true,
    acBonus: p.acBonus ?? 0,
  };
}

export function effectiveAc(participant: CombatParticipant): number {
  return participant.ac + (participant.acBonus ?? 0);
}

export async function markActionUsed(campaignId: string, participantId: string): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;
  const participants = combat.participants.map((p) =>
    p.id === participantId ? { ...p, hasUsedAction: true } : p,
  );
  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

export async function markBonusActionUsed(campaignId: string, participantId: string): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;
  const participants = combat.participants.map((p) =>
    p.id === participantId ? { ...p, hasUsedBonusAction: true } : p,
  );
  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

export async function markReactionUsed(campaignId: string, participantId: string): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;
  const participants = combat.participants.map((p) =>
    p.id === participantId ? { ...p, hasReaction: false } : p,
  );
  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

/** Shield: +5 AC until the start of this participant's next turn. */
export async function activateShield(campaignId: string, participantId: string): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;
  const participants = combat.participants.map((p) =>
    p.id === participantId ? { ...p, acBonus: 5, hasReaction: false } : p,
  );
  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

async function applyDamageToParticipant(
  participants: CombatParticipant[],
  idx: number,
  damage: number,
  conModifier = 0,
): Promise<DamageEffectResult> {
  const before = participants[idx];
  participants[idx].hp = Math.max(0, participants[idx].hp - damage);

  if (participants[idx].hp <= 0 && participants[idx].type === 'player') {
    participants[idx].isUnconscious = true;
    participants[idx].deathSaveSuccesses = 0;
    participants[idx].deathSaveFailures = 0;
  }

  let concentrationBroken: DamageEffectResult['concentrationBroken'];
  if (
    damage > 0 &&
    before.concentratingOn &&
    participants[idx].hp > 0
  ) {
    const dc = concentrationSaveDc(damage);
    const save = rollConcentrationSave(conModifier, dc);
    if (!save.success) {
      concentrationBroken = {
        spellKey: before.concentratingOn,
        breakdown: `Concentration broken on **${formatSpellKey(before.concentratingOn)}** (${save.breakdown} vs DC ${dc})`,
      };
      participants[idx].concentratingOn = null;
    }
  }

  return {
    hpAfter: participants[idx].hp,
    defeated: participants[idx].hp <= 0,
    concentrationBroken,
  };
}

async function getConModForParticipant(p: CombatParticipant): Promise<number> {
  if (!p.characterId) return 0;
  const c = await prisma.character.findUnique({ where: { id: p.characterId } });
  if (!c) return 0;
  const mods = parseJson<Record<string, number>>(c.abilityMods, {});
  return mods.CON ?? 0;
}

export interface CombatPersistenceMeta {
  order: string[];
  reinforcementsArrived: string[];
  locationId?: string | null;
  locationName?: string | null;
  absentParty?: string[];
}

export function parseCombatMeta(raw: string): CombatPersistenceMeta {
  const parsed = parseJson<unknown>(raw, []);
  if (Array.isArray(parsed)) {
    return { order: parsed.filter((x): x is string => typeof x === 'string'), reinforcementsArrived: [] };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    return {
      order: Array.isArray(obj.order) ? obj.order.filter((x): x is string => typeof x === 'string') : [],
      reinforcementsArrived: Array.isArray(obj.reinforcementsArrived)
        ? obj.reinforcementsArrived.filter((x): x is string => typeof x === 'string')
        : [],
      locationId: typeof obj.locationId === 'string' ? obj.locationId : null,
      locationName: typeof obj.locationName === 'string' ? obj.locationName : null,
      absentParty: Array.isArray(obj.absentParty)
        ? obj.absentParty.filter((x): x is string => typeof x === 'string')
        : [],
    };
  }
  return { order: [], reinforcementsArrived: [] };
}

async function loadActiveCombat(campaignId: string): Promise<(ActiveCombat & { dbId: string }) | null> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) return null;
  const meta = parseCombatMeta(combat.initiativeOrder);
  return {
    dbId: combat.id,
    id: combat.id,
    round: combat.round,
    currentTurn: combat.currentTurn,
    participants: parseJson<CombatParticipant[]>(combat.participants, []),
    reinforcementsArrived: meta.reinforcementsArrived,
    locationId: meta.locationId,
    locationName: meta.locationName,
    absentParty: meta.absentParty,
  };
}

async function saveCombat(
  dbId: string,
  data: {
    participants: CombatParticipant[];
    currentTurn: number;
    round: number;
    status?: string;
    reinforcementsArrived?: string[];
  },
): Promise<void> {
  const order = data.participants.map((p) => p.id);
  const existing = await prisma.combatState.findUnique({ where: { id: dbId } });
  const prevMeta = existing ? parseCombatMeta(existing.initiativeOrder) : { order: [], reinforcementsArrived: [] };
  const reinforcements = data.reinforcementsArrived ?? prevMeta.reinforcementsArrived;

  await prisma.combatState.update({
    where: { id: dbId },
    data: {
      participants: toJson(data.participants),
      initiativeOrder: toJson({
        order,
        reinforcementsArrived: reinforcements,
        locationId: prevMeta.locationId ?? null,
        locationName: prevMeta.locationName ?? null,
        absentParty: prevMeta.absentParty ?? [],
      }),
      currentTurn: data.currentTurn,
      round: data.round,
      status: data.status,
      endedAt: data.status === 'ended' ? new Date() : undefined,
    },
  });
}

export async function getActiveCombat(campaignId: string): Promise<ActiveCombat | null> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return null;
  return {
    id: combat.id,
    round: combat.round,
    currentTurn: combat.currentTurn,
    participants: combat.participants,
    reinforcementsArrived: combat.reinforcementsArrived,
    locationId: combat.locationId,
    locationName: combat.locationName,
    absentParty: combat.absentParty,
  };
}

export function getLivingParticipants(participants: CombatParticipant[]): CombatParticipant[] {
  return participants.filter((p) => p.hp > 0 && !p.isUnconscious);
}

export function normalizeTurnIndex(participants: CombatParticipant[], index: number): number {
  if (participants.length === 0) return 0;
  let idx = index;
  for (let i = 0; i < participants.length; i++) {
    const p = participants[idx];
    if (p && (p.hp > 0 || (p.type === 'player' && p.hp <= 0 && !p.isUnconscious))) {
      return idx;
    }
    idx = (idx + 1) % participants.length;
  }
  return index;
}

export function findParticipantByName(
  participants: CombatParticipant[],
  name: string,
): CombatParticipant | undefined {
  const q = name.toLowerCase();
  return participants.find((p) => p.name.toLowerCase() === q || p.name.toLowerCase().includes(q));
}

export function getCurrentParticipant(combat: ActiveCombat): CombatParticipant | undefined {
  const p = combat.participants[combat.currentTurn];
  if (!p) return undefined;
  if (p.type === 'enemy' && p.hp <= 0) return undefined;
  return p;
}

export async function addCombatReinforcements(
  campaignId: string,
  enemies: CombatEnemyInput[],
): Promise<CombatParticipant[]> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) throw new Error('No active combat.');

  const participants = [...combat.participants];
  const added: CombatParticipant[] = [];

  for (const enemy of enemies) {
    const initRoll = rollInitiative(0);
    const participant: CombatParticipant = {
      id: `enemy-${randomUUID().slice(0, 8)}`,
      name: enemy.name,
      type: 'enemy',
      ac: enemy.ac ?? 12,
      hp: enemy.hp ?? 14,
      maxHp: enemy.hp ?? 14,
      initiative: initRoll.total,
      conditions: [],
      attackBonus: enemy.attackBonus ?? 3,
      damage: enemy.damage ?? '1d6+1',
    };
    participants.push(participant);
    added.push(participant);
  }

  participants.sort((a, b) => b.initiative - a.initiative);

  const reinforcements = [...combat.reinforcementsArrived, ...added.map((e) => e.name)];

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: 0,
    round: combat.round,
    reinforcementsArrived: reinforcements,
  });

  return added;
}

export async function setConcentration(
  campaignId: string,
  participantId: string,
  spellKey: string | null,
): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;

  const participants = combat.participants.map((p) => {
    if (p.id === participantId) return { ...p, concentratingOn: spellKey };
    if (spellKey && p.concentratingOn) return { ...p, concentratingOn: null };
    return p;
  });

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

export async function processDeathSaveTurn(
  campaignId: string,
  participantId: string,
): Promise<{ result: ReturnType<typeof rollDeathSave>; participant: CombatParticipant } | null> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return null;

  const idx = combat.participants.findIndex((p) => p.id === participantId);
  if (idx === -1) return null;

  const p = combat.participants[idx];
  if (p.hp > 0) return null;

  const save = rollDeathSave(p.deathSaveSuccesses ?? 0, p.deathSaveFailures ?? 0);
  const participants = [...combat.participants];
  participants[idx] = {
    ...p,
    deathSaveSuccesses: save.stabilized ? 3 : save.successes,
    deathSaveFailures: save.died ? 3 : save.failures,
    isUnconscious: !save.stabilized && !save.died,
  };

  if (save.stabilized && save.roll === 20) {
    participants[idx].hp = 1;
    participants[idx].isUnconscious = false;
    participants[idx].deathSaveSuccesses = 0;
    participants[idx].deathSaveFailures = 0;
  } else if (save.stabilized) {
    participants[idx].isUnconscious = true;
  }

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });

  if (participants[idx].characterId) {
    await prisma.character.update({
      where: { id: participants[idx].characterId },
      data: { hitPoints: participants[idx].hp },
    });
  }

  return { result: save, participant: participants[idx] };
}

export async function updateParticipantSpellSlots(
  campaignId: string,
  participantId: string,
  slots: Record<string, number>,
): Promise<void> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return;

  const participants = combat.participants.map((p) =>
    p.id === participantId ? { ...p, spellSlotsRemaining: slots } : p,
  );

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
}

export async function startCombat(campaignId: string, participantIds: string[]): Promise<string> {
  return startCombatWithEnemies(campaignId, participantIds, []);
}

export async function startCombatWithEnemies(
  campaignId: string,
  playerCharacterIds: string[],
  enemies: CombatEnemyInput[],
  combatScene?: Pick<CombatPersistenceMeta, 'locationId' | 'locationName' | 'absentParty'>,
): Promise<string> {
  const active = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (active) throw new Error('Combat already in progress.');

  const characters = await prisma.character.findMany({
    where: { id: { in: playerCharacterIds } },
  });

  const participants: CombatParticipant[] = characters.map((c) => {
    const mods = parseJson<Record<Ability, number>>(c.abilityMods, {
      STR: 0,
      DEX: 0,
      CON: 0,
      INT: 0,
      WIS: 0,
      CHA: 0,
    });
    const strMod = mods.STR ?? 0;
    const initRoll = rollInitiative(mods.DEX ?? 0);
    const slotState = getSpellSlotState(c.spellcasting);
    return {
      id: c.id,
      name: c.name,
      type: 'player' as const,
      characterId: c.id,
      ac: c.armorClass,
      hp: c.hitPoints,
      maxHp: c.maxHitPoints,
      initiative: initRoll.total,
      conditions: parseJson<string[]>(c.conditions, []),
      attackBonus: strMod + c.proficiencyBonus,
      damage: '1d8',
      spellSlotsRemaining: getRemainingSlots(slotState),
      concentratingOn: null,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      isUnconscious: c.hitPoints <= 0,
      hasUsedAction: false,
      hasUsedBonusAction: false,
      hasReaction: true,
      acBonus: 0,
    };
  });

  for (const enemy of enemies) {
    const initRoll = rollInitiative(0);
    participants.push({
      id: `enemy-${randomUUID().slice(0, 8)}`,
      name: enemy.name,
      type: 'enemy',
      ac: enemy.ac ?? 12,
      hp: enemy.hp ?? 11,
      maxHp: enemy.hp ?? 11,
      initiative: initRoll.total,
      conditions: [],
      attackBonus: enemy.attackBonus ?? 3,
      damage: enemy.damage ?? '1d6+1',
      hasUsedAction: false,
      hasUsedBonusAction: false,
      hasReaction: true,
      acBonus: 0,
    });
  }

  participants.sort((a, b) => b.initiative - a.initiative);

  const combat = await prisma.combatState.create({
    data: {
      campaignId,
      status: 'active',
      round: 1,
      currentTurn: 0,
      participants: toJson(participants),
      initiativeOrder: toJson({
        order: participants.map((p) => p.id),
        reinforcementsArrived: [],
        locationId: combatScene?.locationId ?? null,
        locationName: combatScene?.locationName ?? null,
        absentParty: combatScene?.absentParty ?? [],
      }),
    },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { dangerLevel: Math.min(5, (await prisma.campaign.findUnique({ where: { id: campaignId } }))!.dangerLevel + 1) },
  });

  return combat.id;
}

export async function getCombatStatus(campaignId: string): Promise<string> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return 'No active combat.';
  return formatCombatStatus(combat.participants, combat.round, combat.currentTurn);
}

export function formatCombatStatus(
  participants: CombatParticipant[],
  round: number,
  currentTurn: number,
): string {
  const current = participants[currentTurn];
  const lines = [
    `**⚔️ Combat — Round ${round}**`,
    '',
    ...participants.map((p, i) => {
      const marker = i === currentTurn ? ' ▶' : '';
      const hpPct = p.maxHp > 0 ? Math.round((p.hp / p.maxHp) * 100) : 0;
      const bar = '█'.repeat(Math.max(0, Math.round(hpPct / 10))) + '░'.repeat(10 - Math.max(0, Math.round(hpPct / 10)));
      const tag = p.type === 'enemy' ? '👹' : '🛡️';
      const down = p.hp <= 0 ? (p.type === 'player' ? ' 💀' : ' ☠️') : '';
      const econ =
        p.type === 'player' && i === currentTurn
          ? ` · ${p.hasUsedAction ? '✓act' : '○act'}${p.hasUsedBonusAction ? ' ✓bonus' : ' ○bonus'}${p.hasReaction === false ? '' : ' ○rxn'}`
          : '';
      const conc = p.concentratingOn ? ` · ✨${p.concentratingOn}` : '';
      const slots =
        p.spellSlotsRemaining && Object.keys(p.spellSlotsRemaining).length
          ? ` · slots ${Object.entries(p.spellSlotsRemaining).map(([k, v]) => `${k}:${v}`).join(' ')}`
          : '';
      return `${tag} **${p.name}** ${bar} ${p.hp}/${p.maxHp} AC ${effectiveAc(p)}${down}${econ}${conc}${slots}${marker}`;
    }),
    '',
    current ? `**Turn:** ${current.name}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function resolveAttack(
  campaignId: string,
  attackerId: string,
  targetId: string,
  opts?: { attackBonus?: number; damageExpr?: string; method?: AttackResult['method']; spellName?: string },
): Promise<AttackResult> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) throw new Error('No active combat.');

  const participants = [...combat.participants];
  const attackerIdx = participants.findIndex((p) => p.id === attackerId);
  const targetIdx = participants.findIndex((p) => p.id === targetId);
  if (attackerIdx === -1 || targetIdx === -1) throw new Error('Combatant not found.');

  const attacker = participants[attackerIdx];
  const target = participants[targetIdx];
  const bonus = opts?.attackBonus ?? attacker.attackBonus ?? 0;
  const damageExpr = opts?.damageExpr ?? attacker.damage ?? '1d6';
  const targetAc = effectiveAc(target);

  const roll = executeRoll(bonus >= 0 ? `1d20+${bonus}` : `1d20${bonus}`);
  const natural = roll.keptDice[0] ?? 0;
  const critical = natural === 20;
  const natural1 = natural === 1;
  const hit = critical || (!natural1 && roll.total >= targetAc);

  let damage: number | undefined;
  let damageBreakdown: string | undefined;
  let concentrationBroken: AttackResult['concentrationBroken'];

  if (hit) {
    const dmgRoll = rollDamage(critical ? `${damageExpr}`.replace(/^(\d+)d/, '$1d').concat('') : damageExpr);
    if (critical && damageExpr.match(/^\d+d\d+/)) {
      const doubled = rollDamage(damageExpr);
      damage = dmgRoll.total + doubled.total;
      damageBreakdown = `${dmgRoll.breakdown} + crit ${doubled.breakdown} = ${damage}`;
    } else {
      damage = dmgRoll.total;
      damageBreakdown = dmgRoll.breakdown;
    }
    const conMod = await getConModForParticipant(participants[targetIdx]);
    const effect = await applyDamageToParticipant(participants, targetIdx, damage, conMod);
    if (effect.concentrationBroken) concentrationBroken = effect.concentrationBroken;
  }

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });

  if (participants[targetIdx].characterId) {
    await prisma.character.update({
      where: { id: participants[targetIdx].characterId },
      data: { hitPoints: participants[targetIdx].hp },
    });
  }

  const breakdown = hit
    ? `d20 (${natural}) + ${bonus} = **${roll.total}** vs AC ${targetAc} — **HIT**${damage !== undefined ? ` · ${damageBreakdown}` : ''}`
    : `d20 (${natural}) + ${bonus} = **${roll.total}** vs AC ${targetAc} — **MISS**`;

  return {
    attackerId: attacker.id,
    attackerName: attacker.name,
    targetId: target.id,
    targetName: target.name,
    targetType: target.type,
    hit,
    critical,
    natural1,
    attackRoll: natural,
    attackTotal: roll.total,
    targetAc,
    damage,
    damageBreakdown,
    targetHpAfter: participants[targetIdx].hp,
    targetDefeated: participants[targetIdx].hp <= 0,
    breakdown,
    method: opts?.method ?? 'weapon',
    spellName: opts?.spellName,
    concentrationBroken,
  };
}

export async function applyHealing(participantId: string, campaignId: string, amount: number): Promise<number> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) throw new Error('No active combat.');

  const participants = [...combat.participants];
  const idx = participants.findIndex((p) => p.id === participantId);
  if (idx === -1) throw new Error('Participant not found.');

  const before = participants[idx].hp;
  participants[idx].hp = Math.min(participants[idx].maxHp, participants[idx].hp + amount);

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });

  if (participants[idx].characterId) {
    await prisma.character.update({
      where: { id: participants[idx].characterId },
      data: { hitPoints: participants[idx].hp },
    });
  }

  return participants[idx].hp - before;
}

export async function advanceCombatTurn(campaignId: string): Promise<string> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) throw new Error('No active combat.');

  let nextTurn = combat.currentTurn;
  let round = combat.round;
  const participants = combat.participants.map(defaultEconomy);
  const total = participants.length;
  if (total === 0) throw new Error('No combatants.');

  for (let step = 0; step < total; step++) {
    nextTurn = (nextTurn + 1) % total;
    if (nextTurn === 0) round += 1;
    const candidate = participants[nextTurn];
    if (!candidate) continue;
    if (candidate.type === 'enemy' && candidate.hp <= 0) continue;
    if (candidate.type === 'player' && candidate.hp <= 0 && candidate.isUnconscious) continue;
    break;
  }

  // Reset action economy for the participant whose turn is starting
  const active = participants[nextTurn];
  if (active) {
    participants[nextTurn] = {
      ...active,
      hasUsedAction: false,
      hasUsedBonusAction: false,
      hasReaction: true,
      acBonus: 0,
    };
  }

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: nextTurn,
    round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });
  return `Round ${round} — **${participants[nextTurn]?.name}**'s turn.`;
}

  /** Run AI enemy turns until a living player's turn or combat ends. */
export async function runEnemyTurns(campaignId: string): Promise<AttackResult[]> {
  const results: AttackResult[] = [];
  let combat = await loadActiveCombat(campaignId);
  if (!combat) return results;

  let safety = 0;
  while (safety++ < 12) {
    combat = await loadActiveCombat(campaignId);
    if (!combat) break;

    const current = combat.participants[combat.currentTurn];
    if (!current) break;

    // Stop when a living player can act — never skip their turn.
    if (current.type === 'player' && current.hp > 0 && !current.isUnconscious) break;

    if (current.type === 'enemy' && current.hp <= 0) {
      await advanceCombatTurn(campaignId);
      continue;
    }

    if (current.type !== 'enemy') {
      await advanceCombatTurn(campaignId);
      continue;
    }

    const players = combat.participants.filter((p) => p.type === 'player' && p.hp > 0);
    if (players.length === 0) break;

    const target = players.reduce((a, b) => (a.hp <= b.hp ? a : b));
    const result = await resolveAttack(campaignId, current.id, target.id);
    results.push(result);

    const ended = await tryEndCombatIfOver(campaignId);
    if (ended) break;

    await advanceCombatTurn(campaignId);
    combat = await loadActiveCombat(campaignId);
    if (!combat) break;
    const next = combat.participants[combat.currentTurn];
    if (next?.type === 'player') break;
  }

  return results;
}

export async function tryEndCombatIfOver(campaignId: string): Promise<boolean> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return false;

  const livingEnemies = combat.participants.filter((p) => p.type === 'enemy' && p.hp > 0);
  const livingPlayers = combat.participants.filter(
    (p) => p.type === 'player' && p.hp > 0 && !p.isUnconscious && (p.deathSaveFailures ?? 0) < 3,
  );

  if (livingEnemies.length === 0 || livingPlayers.length === 0) {
    await endCombat(campaignId);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { dangerLevel: Math.max(1, (await prisma.campaign.findUnique({ where: { id: campaignId } }))!.dangerLevel - 1) },
    });
    return true;
  }
  return false;
}

export async function nextCombatTurn(campaignId: string): Promise<string> {
  const msg = await advanceCombatTurn(campaignId);
  await runEnemyTurns(campaignId);
  return msg;
}

export async function endCombat(campaignId: string): Promise<void> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) throw new Error('No active combat.');

  await prisma.combatState.update({
    where: { id: combat.id },
    data: { status: 'ended', endedAt: new Date() },
  });
}

export async function applyDamage(
  participantId: string,
  campaignId: string,
  damage: number,
): Promise<DamageEffectResult> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) throw new Error('No active combat.');

  const participants = [...combat.participants];
  const idx = participants.findIndex((p) => p.id === participantId);
  if (idx === -1) throw new Error('Participant not found.');

  const conMod = await getConModForParticipant(participants[idx]);
  const effect = await applyDamageToParticipant(participants, idx, damage, conMod);

  await saveCombat(combat.dbId, {
    participants,
    currentTurn: combat.currentTurn,
    round: combat.round,
    reinforcementsArrived: combat.reinforcementsArrived,
  });

  if (participants[idx].characterId) {
    await prisma.character.update({
      where: { id: participants[idx].characterId },
      data: { hitPoints: participants[idx].hp },
    });
  }

  return effect;
}

/** Opportunity attacks when a participant flees — each living enemy gets one swing. */
export async function runOpportunityAttacks(
  campaignId: string,
  fleeingParticipantId: string,
): Promise<AttackResult[]> {
  const combat = await loadActiveCombat(campaignId);
  if (!combat) return [];

  const fleeing = combat.participants.find((p) => p.id === fleeingParticipantId);
  if (!fleeing) return [];

  const results: AttackResult[] = [];
  const enemies = combat.participants.filter((p) => p.type === 'enemy' && p.hp > 0);

  for (const enemy of enemies) {
    if (enemy.hasReaction === false) continue;
    const result = await resolveAttack(campaignId, enemy.id, fleeing.id, { method: 'opportunity' });
    results.push(result);
    await markReactionUsed(campaignId, enemy.id);
    if (fleeing.id === result.targetId && result.targetDefeated) break;
  }

  return results;
}
