export interface StyleProfile {
  artStyle: string;
  colorPalette: string;
  lightingMood: string;
  negativePrompt: string;
  cameraFraming?: string;
  fantasyTone?: string;
  realismLevel?: string;
}

export interface CharacterPromptInput {
  name: string;
  race: string;
  className: string;
  appearance: string;
  styleProfile: StyleProfile;
  mood?: string;
  previousPrompt?: string;
  changeSummary?: string;
}

export interface LocationPromptInput {
  name: string;
  visualDescription: string;
  mood: string;
  currentChanges?: string;
  styleProfile: StyleProfile;
  landmarks?: string[];
  changeSummary?: string;
  previousPrompt?: string;
}

export function buildCharacterPortraitPrompt(input: CharacterPromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const continuity = input.previousPrompt
    ? `Maintain visual continuity with prior portrait. Changes: ${input.changeSummary ?? 'none'}.`
    : '';

  const prompt = [
    'Character portrait, head and shoulders framing',
    `${input.name}, ${input.race} ${input.className}`,
    input.appearance,
    input.mood ? `Expression/mood: ${input.mood}` : '',
    `Art style: ${input.styleProfile.artStyle}`,
    `Color palette: ${input.styleProfile.colorPalette}`,
    `Lighting: ${input.styleProfile.lightingMood}`,
    `Framing: ${input.styleProfile.cameraFraming ?? 'portrait, readable silhouette'}`,
    continuity,
    'Medieval fantasy, no text, no watermark, no UI elements',
  ]
    .filter(Boolean)
    .join('. ');

  return { prompt, negativePrompt: input.styleProfile.negativePrompt };
}

export function buildLocationPrompt(input: LocationPromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const continuity = input.previousPrompt
    ? `Same location identity as before. Prior visual: ${input.previousPrompt}. Changes: ${input.changeSummary ?? input.currentChanges ?? 'none'}.`
    : '';

  const prompt = [
    'Fantasy location scene, cinematic composition',
    input.name,
    input.visualDescription,
    input.landmarks?.length ? `Landmarks: ${input.landmarks.join(', ')}` : '',
    input.currentChanges ? `Current state: ${input.currentChanges}` : '',
    `Mood: ${input.mood}`,
    `Art style: ${input.styleProfile.artStyle}`,
    `Color palette: ${input.styleProfile.colorPalette}`,
    `Lighting: ${input.styleProfile.lightingMood}`,
    continuity,
    'No text, no watermark, no UI, no modern objects',
  ]
    .filter(Boolean)
    .join('. ');

  return { prompt, negativePrompt: input.styleProfile.negativePrompt };
}
