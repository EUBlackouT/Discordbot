/** Location/scene snapshot used to pick and cache background ambience. */
export interface AmbienceContext {
  locationId?: string;
  locationName?: string;
  locationSlug?: string;
  mood?: string;
  description?: string;
  visualDescription?: string;
  sceneMood?: string;
  currentChanges?: string;
  combatActive?: boolean;
}

export function buildAmbienceContext(
  state: {
    location?: {
      id: string;
      name: string;
      slug?: string;
      description?: string;
      visualDescription?: string;
      mood?: string;
      currentChanges?: string;
    } | null;
    scene?: { mood?: string } | null;
    combat?: unknown | null;
  },
  locationSlug?: string,
  combatActive?: boolean,
): AmbienceContext | undefined {
  if (!state.location) return undefined;
  return {
    locationId: state.location.id,
    locationName: state.location.name,
    locationSlug: locationSlug ?? state.location.slug,
    mood: state.location.mood,
    description: state.location.description,
    visualDescription: state.location.visualDescription,
    sceneMood: state.scene?.mood,
    currentChanges: state.location.currentChanges,
    combatActive: combatActive ?? Boolean(state.combat),
  };
}
