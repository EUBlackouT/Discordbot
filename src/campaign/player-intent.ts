/** Lightweight routing for in-character / meta questions — no slash command needed. */

export type PlayerMetaIntent =
  | 'recap'
  | 'location'
  | 'quests'
  | 'npcs'
  | 'party'
  | 'leave'
  | null;

const RECAP =
  /\b(recap|catch me up|remind me|what happened|story so far|session summary|where were we|what did we do)\b/i;
const LOCATION =
  /\b(where am i|where are we|current location|describe (the )?(scene|area|room|place)|what does .+ look like|show me (the )?(scene|location|area))\b/i;
const QUESTS =
  /\b(what(?:'s| is| are) (our |the )?(quest|objectives?|goals?|mission)|quest log|what should we do|any active quests)\b/i;
const NPCS = /\b(who do we know|known npcs?|who have we met|npc list|who is here)\b/i;
const PARTY =
  /\b(who(?:'s| is) (in |with )?(the )?party|our party|party members?|who am i with)\b/i;
const LEAVE = /\b(leave (the )?campaign|quit (the )?campaign|drop out|i need to leave)\b/i;

/** Returns a meta intent when the message is clearly informational / administrative, not an in-world action. */
export function detectMetaIntent(message: string): PlayerMetaIntent {
  const text = message.trim();
  if (!text || text.length > 280) return null;

  // Short questions are more likely meta; long messages are usually actions.
  if (LEAVE.test(text)) return 'leave';
  if (RECAP.test(text)) return 'recap';
  if (LOCATION.test(text)) return 'location';
  if (QUESTS.test(text)) return 'quests';
  if (NPCS.test(text)) return 'npcs';
  if (PARTY.test(text)) return 'party';

  return null;
}
