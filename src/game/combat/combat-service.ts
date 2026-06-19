import { prisma } from '../../db/client.js';
import { toJson, parseJson } from '../../utils/helpers.js';
import { rollInitiative } from '../dice/engine.js';
import type { Ability } from '../../utils/helpers.js';

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
}

export async function startCombat(campaignId: string, participantIds: string[]): Promise<string> {
  const active = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (active) throw new Error('Combat already in progress. Use /combat end first.');

  const characters = await prisma.character.findMany({
    where: { id: { in: participantIds }, campaignId },
  });

  const participants: CombatParticipant[] = characters.map((c) => {
    const mods = parseJson<Record<Ability, number>>(c.abilityMods, { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });
    const initRoll = rollInitiative(mods.DEX);
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
    };
  });

  participants.sort((a, b) => b.initiative - a.initiative);

  const combat = await prisma.combatState.create({
    data: {
      campaignId,
      status: 'active',
      round: 1,
      currentTurn: 0,
      participants: toJson(participants),
      initiativeOrder: toJson(participants.map((p) => p.id)),
    },
  });

  return combat.id;
}

export async function getCombatStatus(campaignId: string): Promise<string> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) return 'No active combat.';

  const participants = parseJson<CombatParticipant[]>(combat.participants, []);
  const current = participants[combat.currentTurn];

  const lines = [
    `**Combat — Round ${combat.round}**`,
    '',
    '**Initiative Order:**',
    ...participants.map((p, i) => {
      const marker = i === combat.currentTurn ? ' ▶' : '';
      return `${i + 1}. ${p.name} (Init ${p.initiative}) — HP ${p.hp}/${p.maxHp}${marker}`;
    }),
    '',
    current ? `**Current Turn:** ${current.name}` : '',
  ];

  return lines.join('\n');
}

export async function nextCombatTurn(campaignId: string): Promise<string> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) throw new Error('No active combat.');

  const participants = parseJson<CombatParticipant[]>(combat.participants, []);
  let nextTurn = combat.currentTurn + 1;
  let round = combat.round;

  if (nextTurn >= participants.length) {
    nextTurn = 0;
    round += 1;
  }

  await prisma.combatState.update({
    where: { id: combat.id },
    data: { currentTurn: nextTurn, round },
  });

  return `Round ${round} — **${participants[nextTurn]?.name}**'s turn.`;
}

export async function endCombat(campaignId: string): Promise<void> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) throw new Error('No active combat.');

  await prisma.combatState.update({
    where: { id: combat.id },
    data: { status: 'ended', endedAt: new Date() },
  });
}

export async function applyDamage(participantId: string, campaignId: string, damage: number): Promise<void> {
  const combat = await prisma.combatState.findFirst({ where: { campaignId, status: 'active' } });
  if (!combat) throw new Error('No active combat.');

  const participants = parseJson<CombatParticipant[]>(combat.participants, []);
  const idx = participants.findIndex((p) => p.id === participantId);
  if (idx === -1) throw new Error('Participant not found.');

  participants[idx].hp = Math.max(0, participants[idx].hp - damage);

  await prisma.combatState.update({
    where: { id: combat.id },
    data: { participants: toJson(participants) },
  });

  if (participants[idx].characterId) {
    await prisma.character.update({
      where: { id: participants[idx].characterId },
      data: { hitPoints: participants[idx].hp },
    });
  }
}

// TODO: Full attack resolution with weapon stats from rules data
// TODO: Condition application/removal each turn
// TODO: Death saves for player characters at 0 HP
