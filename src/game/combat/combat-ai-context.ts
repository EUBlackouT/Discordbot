import type { CampaignStatePacket } from '../../campaign/state.js';
import type { CombatParticipant } from './combat-service.js';
import { formatSpellKey } from '../character/spell-reference.js';

export function buildCombatBrief(packet: CampaignStatePacket): string | null {
  if (!packet.combat) return null;

  const lines = [
    `COMBAT ACTIVE — Round ${packet.combat.round}, ${packet.combat.currentTurnName ?? 'unknown'}'s turn`,
    `Danger level: ${packet.campaign.dangerLevel}/5`,
    '',
    'COMBATANTS (canonical HP — do not invent different values):',
    ...packet.combat.participants.map((p) => {
      const status = p.isDefeated ? ' [DOWN]' : p.isUnconscious ? ' [UNCONSCIOUS]' : '';
      const conc = p.concentratingOn ? `, concentrating on ${formatSpellKey(p.concentratingOn)}` : '';
      const cond = p.conditions.length ? `, conditions: ${p.conditions.join(', ')}` : '';
      const slots =
        p.spellSlotsRemaining && Object.keys(p.spellSlotsRemaining).length
          ? `, spell slots: ${Object.entries(p.spellSlotsRemaining).map(([k, v]) => `L${k}=${v}`).join(' ')}`
          : '';
      const saves =
        p.deathSaveFailures != null
          ? `, death saves ${p.deathSaveSuccesses ?? 0}✓/${p.deathSaveFailures ?? 0}✗`
          : '';
      return `- ${p.name} (${p.type}): HP ${p.hp}/${p.maxHp}, AC ${p.ac}${status}${conc}${cond}${slots}${saves}`;
    }),
  ];

  if (packet.combat.reinforcementsArrived?.length) {
    lines.push('', `Reinforcements this fight: ${packet.combat.reinforcementsArrived.join(', ')}`);
  }

  if (packet.combat.locationName) {
    lines.push('', `Fight location: ${packet.combat.locationName}`);
  }

  if (packet.combat.absentParty?.length) {
    lines.push(`Not in this fight (elsewhere): ${packet.combat.absentParty.join(', ')}`);
  }

  return lines.join('\n');
}

export function participantIsActive(p: CombatParticipant): boolean {
  return p.hp > 0 && !p.isUnconscious;
}

export function summarizeParticipantForAI(p: CombatParticipant) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    hp: p.hp,
    maxHp: p.maxHp,
    ac: p.ac,
    isDefeated: p.hp <= 0 && p.type === 'enemy',
    isUnconscious: Boolean(p.isUnconscious) || (p.hp <= 0 && p.type === 'player'),
    concentratingOn: p.concentratingOn ?? null,
    conditions: p.conditions,
    spellSlotsRemaining: p.spellSlotsRemaining ?? null,
    deathSaveSuccesses: p.type === 'player' && p.hp <= 0 ? (p.deathSaveSuccesses ?? 0) : null,
    deathSaveFailures: p.type === 'player' && p.hp <= 0 ? (p.deathSaveFailures ?? 0) : null,
  };
}
