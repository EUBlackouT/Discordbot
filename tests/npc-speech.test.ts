import { describe, it, expect } from 'vitest';
import { classifyMessageMode } from '../src/campaign/message-mode.js';
import { findNpcInMessage, shouldUseNpcDialogue } from '../src/campaign/npc-speech.js';

const NPCS = [
  {
    id: '1',
    name: 'Sister Caldra Venn',
    description: 'Hooded acolyte',
    attitude: 'desperate',
    goals: 'Protect innocents',
  },
  {
    id: '2',
    name: 'Old Henrick the Crier',
    description: 'Town crier',
    attitude: 'fearful',
    goals: 'Survive',
  },
];

describe('npc speech routing', () => {
  it('treats directed questions as dialogue mode', () => {
    expect(classifyMessageMode('Do you understand the omen?')).toBe('dialogue');
    expect(classifyMessageMode("i ask Caldra 'Do you know a safe place?'")).toBe('dialogue');
  });

  it('finds NPCs referenced in player text', () => {
    expect(findNpcInMessage("i ask Caldra about the omen", NPCS)?.name).toBe('Sister Caldra Venn');
  });

  it('routes follow-up dialogue to the NPC from recent turns', () => {
    const decision = {
      action: 'NARRATE' as const,
      confidence: 0.8,
      reason: 'test',
      state_updates: [],
      safety_flags: [],
    };
    const recentTurns = [
      {
        message: "i ask Caldra 'Do you know a safe place?'",
        response: 'Caldra points toward the alleys.',
        discordId: '1',
      },
    ];
    expect(
      shouldUseNpcDialogue(
        decision,
        'Do you understand the omen?',
        NPCS,
        'dialogue',
        recentTurns,
      ),
    ).toBe(true);
  });
});
