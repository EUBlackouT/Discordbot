import type { CampaignStatePacket } from './state.js';

export interface PartyPosition {
  characterId: string;
  discordId: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
}

export interface ActingPlayerContext {
  discordId: string;
  characterId: string;
  characterName: string;
  locationId: string | null;
  locationName: string | null;
  /** Other PCs at the same location as the acting player */
  coLocatedParty: string[];
  /** PCs at a different location */
  separatedParty: Array<{ name: string; locationName: string | null }>;
}

export function buildActingPlayerContext(
  statePacket: CampaignStatePacket,
  discordId: string,
  characterId?: string,
  characterName?: string,
): ActingPlayerContext | null {
  const positions = statePacket.partyPositions;
  if (!positions.length) return null;

  const self =
    positions.find((p) => p.characterId === characterId) ??
    positions.find((p) => p.discordId === discordId);
  if (!self) return null;

  const coLocatedParty = positions
    .filter((p) => p.characterId !== self.characterId && p.locationId === self.locationId)
    .map((p) => p.name);

  const separatedParty = positions
    .filter((p) => p.characterId !== self.characterId && p.locationId !== self.locationId)
    .map((p) => ({ name: p.name, locationName: p.locationName }));

  return {
    discordId: self.discordId,
    characterId: self.characterId,
    characterName: characterName ?? self.name,
    locationId: self.locationId,
    locationName: self.locationName,
    coLocatedParty,
    separatedParty,
  };
}

export function resolveLocationForActingPlayer(
  statePacket: CampaignStatePacket,
  acting: ActingPlayerContext | null,
): CampaignStatePacket['location'] {
  if (!acting?.locationId) return statePacket.location;

  const match = statePacket.locationsById[acting.locationId];
  if (!match) return statePacket.location;

  return {
    id: match.id,
    name: match.name,
    slug: match.slug,
    description: match.description,
    visualDescription: match.visualDescription,
    mood: match.mood,
    activeAssetId: match.activeAssetId,
    currentChanges: match.currentChanges,
  };
}

export function scopeStateForActingPlayer(
  statePacket: CampaignStatePacket,
  acting: ActingPlayerContext | null,
): CampaignStatePacket {
  if (!acting) return statePacket;
  const povLocation = resolveLocationForActingPlayer(statePacket, acting);
  const povLocationId = acting.locationId;
  const activeNpcs =
    povLocationId != null
      ? statePacket.activeNpcs.filter((n) => !n.locationId || n.locationId === povLocationId)
      : statePacket.activeNpcs;

  let combat = statePacket.combat;
  if (combat && acting && !isCharacterInActiveCombat(combat, acting.characterId)) {
    combat = null;
  }

  return {
    ...statePacket,
    location: povLocation ?? statePacket.location,
    activeNpcs,
    combat,
  };
}

export function getCoLocatedCharacterIds(
  statePacket: CampaignStatePacket,
  characterId: string,
): string[] {
  const self = statePacket.partyPositions.find((p) => p.characterId === characterId);
  if (!self) return [characterId];

  if (!self.locationId) {
    return statePacket.partyPositions.map((p) => p.characterId);
  }

  return statePacket.partyPositions
    .filter((p) => p.locationId === self.locationId)
    .map((p) => p.characterId);
}

export function resolveCombatRoster(
  statePacket: CampaignStatePacket,
  initiatorCharacterId: string,
): { inCombatIds: string[]; absentNames: string[] } {
  const inCombatIds = getCoLocatedCharacterIds(statePacket, initiatorCharacterId);
  const inSet = new Set(inCombatIds);
  const absentNames = statePacket.partyPositions
    .filter((p) => !inSet.has(p.characterId))
    .map((p) => p.name);
  return { inCombatIds, absentNames };
}

export function isCharacterInActiveCombat(
  combat: NonNullable<CampaignStatePacket['combat']>,
  characterId: string,
): boolean {
  return combat.participants.some((p) => p.type === 'player' && p.id === characterId);
}

export function buildDistantCombatPolicy(
  combat: NonNullable<CampaignStatePacket['combat']>,
  characterId: string,
  characterName?: string,
): string {
  if (isCharacterInActiveCombat(combat, characterId)) return '';

  const fighters = combat.participants
    .filter((p) => p.type === 'player')
    .map((p) => p.name)
    .join(', ');
  const loc = combat.locationName ?? 'another location';
  const name = characterName ?? 'This character';
  return `COMBAT ELSEWHERE: ${fighters} are fighting at ${loc}. ${name} is NOT in this encounter — narrate only what they perceive from where they stand (distant sounds, etc.). Do not pull them into initiative.`;
}

export function isMultiplayerCampaign(statePacket: CampaignStatePacket): boolean {
  return statePacket.partyPositions.length > 1;
}
