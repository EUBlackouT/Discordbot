import type { AttackResult } from './combat-service.js';
import type { ActiveCombat } from './combat-service.js';
import { formatCombatStatus } from './combat-service.js';

export interface CombatKillEvent {
  victimName: string;
  victimType: 'player' | 'npc' | 'enemy';
  killerName: string;
  damage?: number;
  critical: boolean;
  method: 'weapon' | 'spell' | 'opportunity';
  spellName?: string;
}

export function formatAttackSummary(result: AttackResult): string {
  const outcome = result.hit
    ? result.critical
      ? '**Critical hit!**'
      : '**Hit!**'
    : '**Miss.**';
  const dmg = result.hit && result.damage !== undefined ? ` · **${result.damage}** damage` : '';
  const down = result.targetDefeated ? ' · 🎯 **Down!**' : '';
  const conc = result.concentrationBroken ? `\n${result.concentrationBroken.breakdown}` : '';
  return `${result.attackerName} → ${result.targetName}\n${outcome}${dmg}${down}${conc}\n${result.breakdown}`;
}

export function formatEnemyTurnSummaries(results: AttackResult[]): string {
  if (results.length === 0) return '';
  return results.map(formatAttackSummary).join('\n\n');
}

export function extractKillEvents(results: AttackResult[]): CombatKillEvent[] {
  return results
    .filter((r) => r.hit && r.targetDefeated)
    .map((r) => ({
      victimName: r.targetName,
      victimType: r.targetType,
      killerName: r.attackerName,
      damage: r.damage,
      critical: r.critical,
      method: r.method ?? 'weapon',
      spellName: r.spellName,
    }));
}

export function buildKillNarrationInstruction(kills: CombatKillEvent[]): string {
  if (!kills.length) return '';
  const lines = kills.map((k) => {
    const how =
      k.method === 'spell' && k.spellName
        ? `${k.killerName}'s ${k.spellName}${k.critical ? ' (critical)' : ''}`
        : k.method === 'opportunity'
          ? `${k.killerName}'s parting strike${k.critical ? ' (critical)' : ''}`
          : `${k.killerName}'s attack${k.critical ? ' (critical blow)' : ''}`;
    if (k.victimType === 'enemy') {
      return `Describe how **${k.victimName}** is defeated by ${how} — vivid, cinematic death scene in 1-2 sentences. Show the final moment and its impact on the fight.`;
    }
    return `Describe **${k.victimName}** falling unconscious from ${how} — dramatic but not gratuitous.`;
  });
  return lines.join(' ');
}

export function buildCombatOutcomePayload(kills: CombatKillEvent[], allAttacks: AttackResult[]) {
  return {
    kills,
    attacks: allAttacks.map((r) => ({
      attacker: r.attackerName,
      target: r.targetName,
      hit: r.hit,
      critical: r.critical,
      damage: r.damage,
      defeated: r.targetDefeated,
      method: r.method ?? 'weapon',
      spellName: r.spellName,
    })),
  };
}

export function buildCombatPanel(combat: ActiveCombat): { title: string; description: string } {
  return {
    title: '⚔️ Combat',
    description: formatCombatStatus(combat.participants, combat.round, combat.currentTurn),
  };
}

export const COMBAT_START_NARRATION_RULES = `
Combat is STARTING (action START_COMBAT) — initiative is set but the player's turn may not have resolved yet:
- Describe the eruption of violence: positions, weapons drawn, foes reacting, atmosphere
- Do NOT narrate the player's attack landing, damage dealt, or enemy counterattacks unless state.combat already shows that damage occurred
- If the player charged or swung to start the fight, describe the rush and the guard bracing — not the outcome of the swing
- End with tension and a clear beat that it is the player's turn to act (if state.combat shows their ▶ turn marker)
`.trim();

export const COMBAT_NARRATION_RULES = `
During active combat (state.combat is set):
- state.combat.participants and state.combat.summary are CANONICAL — every HP/AC you mention must match exactly
- Do NOT invent different HP values or omit wounded enemies
- Do NOT repeat raw dice numbers — mechanics are shown separately; narrate the cinematic result
- When combat_outcome.kills is present, you MUST describe how each victim falls — the killing blow, the visual, the emotional beat
- Critical kills should feel devastating; spell kills should reflect the magic school (fire, radiant, necrotic, etc.)
- If enemies are defeated, set combat.end_combat=true
- To summon reinforcements mid-fight, the controller uses combat.add_enemies with full stats
`.trim();
