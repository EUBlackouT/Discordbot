import type { MessageMode } from './message-mode.js';
import type { CampaignStatePacket } from './state.js';
import type { ControllerDecision } from '../validation/schemas.js';

export interface NpcSpeaker {
  id?: string;
  name: string;
  description?: string;
  attitude?: string;
  goals?: string;
  voiceId?: string;
  voiceLabel?: string;
}

const TITLE_TOKENS = new Set(['sister', 'brother', 'old', 'the', 'captain', 'lord', 'lady', 'father', 'mother']);

function toNpcSpeaker(
  npc: CampaignStatePacket['activeNpcs'][number],
): NpcSpeaker {
  return {
    id: npc.id,
    name: npc.name,
    description: npc.description,
    attitude: npc.attitude,
    goals: npc.goals,
    voiceId: npc.elevenLabsVoiceId || undefined,
    voiceLabel: npc.voiceLabel || undefined,
  };
}

/** Match an NPC the player names or addresses in their message. */
export function findNpcInMessage(
  message: string,
  npcs: CampaignStatePacket['activeNpcs'],
): NpcSpeaker | undefined {
  const lower = message.toLowerCase();

  for (const npc of npcs) {
    const nameLower = npc.name.toLowerCase();
    if (lower.includes(nameLower)) {
      return toNpcSpeaker(npc);
    }

    const tokens = nameLower.split(/\s+/).filter((t) => t.length > 3 && !TITLE_TOKENS.has(t));
    if (tokens.some((token) => lower.includes(token))) {
      return toNpcSpeaker(npc);
    }
  }

  return undefined;
}

/** Resolve which NPC should speak for this turn. */
export function resolveNpcSpeaker(
  decision: ControllerDecision,
  message: string,
  npcs: CampaignStatePacket['activeNpcs'],
  messageMode: MessageMode,
  recentTurns?: CampaignStatePacket['recentTurns'],
): NpcSpeaker | undefined {
  if (decision.npc_name) {
    const exact = npcs.find((n) => n.name.toLowerCase() === decision.npc_name!.toLowerCase());
    if (exact) return toNpcSpeaker(exact);
    const partial = npcs.find((n) =>
      n.name.toLowerCase().includes(decision.npc_name!.toLowerCase()),
    );
    return partial ? toNpcSpeaker(partial) : { name: decision.npc_name };
  }

  const shouldSpeak =
    decision.action === 'NPC_DIALOGUE' || messageMode === 'dialogue';

  if (!shouldSpeak) return undefined;

  const named = findNpcInMessage(message, npcs);
  if (named) return named;

  for (const turn of [...(recentTurns ?? [])].reverse()) {
    const fromMsg = findNpcInMessage(turn.message, npcs);
    if (fromMsg) return fromMsg;
    if (turn.response) {
      const fromResp = findNpcInMessage(turn.response, npcs);
      if (fromResp) return fromResp;
    }
  }

  if (npcs.length === 1) return toNpcSpeaker(npcs[0]);

  return undefined;
}

export function shouldUseNpcDialogue(
  decision: ControllerDecision,
  message: string,
  npcs: CampaignStatePacket['activeNpcs'],
  messageMode: MessageMode,
  recentTurns?: CampaignStatePacket['recentTurns'],
): boolean {
  if (decision.action === 'NPC_DIALOGUE') return true;
  if (messageMode !== 'dialogue') return false;
  return Boolean(resolveNpcSpeaker(decision, message, npcs, messageMode, recentTurns));
}
