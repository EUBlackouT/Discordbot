/** Detect when the player wants to rest or camp — in-world action, not a meta command. */

const REST_PATTERNS = [
  /\b(long rest|take a rest|short rest)\b/i,
  /\b(camp for the night|make camp|set up camp|setup camp)\b/i,
  /\b(sleep for the night|rest until dawn|bed down for the night)\b/i,
  /\b(we rest|let'?s rest|i rest)\b/i,
];

const CAMP_CONTINUATION_PATTERNS = [
  /\b(take (?:first |second )?watch|keep watch|stand guard|on watch)\b/i,
  /\b(go to sleep|sleep|turn in|bed down|get some rest)\b/i,
  /\b(pray|meditate|prepare spells|study spells)\b/i,
  /\b(light a fire|start a fire|make a fire|pitch camp)\b/i,
  /\b(eat|rations|make dinner|cook)\b/i,
];

export function detectRestIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return REST_PATTERNS.some((p) => p.test(text));
}

export function detectCampContinuation(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return CAMP_CONTINUATION_PATTERNS.some((p) => p.test(text));
}

export const REST_DM_POLICY = `
REST / CAMP (player wants to long rest or make camp):
You are the DM deciding whether rest is LORE-APPROPRIATE — not a menu button.

Read state.campaign.dangerLevel (1=safe … 5=lethal), state.location, activeNpcs, campaign_chronicle, and any open pursuit or hostile presence.
Use action REST with a rest.outcome field:

- **deny** — Rest is not realistic right now (active combat, enemies in the room, public square mid-riot, fleeing pursuit). Narrate WHY and what they should do instead. Do NOT restore HP.
- **setup** — They can begin making camp but the night is not over yet. Describe finding/making a site, atmosphere, risks. Set rest.camp_prompt to ask ONE concrete question (watch order, light a fire, keep moving, pray, etc.). Do NOT restore HP yet.
- **approve** — A full safe long rest completes (secure shelter, no immediate threat). Narrate peaceful rest and recovery. HP and spell slots restore mechanically after narration.
- **interrupt** — They try to rest in a risky place OR you want a camp event. Describe the camp beginning, then something happens (distant howl, patrol, nightmare, visitor, weather). Use combat.enemies for ambushes, or REQUEST_CHECK for watch rolls. Do NOT restore HP unless you also approve after the event resolves.

Guidelines:
- Never approve rest during combat (handled separately — still return deny if state.combat is set).
- dangerLevel 4–5 in hostile territory: prefer setup, interrupt, or deny — rarely approve on first message.
- dangerLevel 1–2 in a safe inn or cleared area: approve or brief setup then approve on follow-up.
- If openThreads includes "⛺ Camp in progress", the party already started camping — interpret the player's message as watch/sleep/activity and choose approve, interrupt, or continue setup accordingly.
- Vary outcomes — not every camp needs an ambush; sometimes a quiet night with a character moment is right.
- When approving, lower tension in narration; optionally set combat.danger_level down by 1 (min 1) in state_updates.
`.trim();
