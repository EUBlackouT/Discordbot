import { describe, it, expect } from 'vitest';
import { structureNarration, buildCampaignTurnReply } from '../src/bot/campaign-reply.js';

describe('campaign presentation', () => {
  it('splits narration into lead and beats', () => {
    const { lead, beats } = structureNarration('Rain falls.\n\nA bell tolls.\n\nThe crowd hushes.');
    expect(lead).toBe('Rain falls.');
    expect(beats).toEqual(['A bell tolls.', 'The crowd hushes.']);
  });

  it('builds player + chronicler embeds with portrait attachment', () => {
    const payload = buildCampaignTurnReply(
      {
        narration: 'The alley swallows you whole.',
        controllerAction: 'NARRATE',
        locationName: 'Mistharbor',
      },
      {
        player: {
          displayName: 'BlackouT',
          characterName: 'Gyro ironbark',
          characterId: 'char-1',
          action: 'I slip into the alley',
          portraitPath: 'C:/tmp/portrait.png',
        },
      },
    );

    expect(payload.embeds).toHaveLength(2);
    expect(payload.files).toHaveLength(1);
    expect(payload.embeds[0].data.author?.name).toBe('Gyro ironbark');
    expect(payload.embeds[1].data.author?.name).toBe('Chronicler');
  });

  it('attaches scene art on the chronicler embed when present', () => {
    const payload = buildCampaignTurnReply(
      {
        narration: 'Torches gutter in the wind.',
        assetPath: 'C:/tmp/scene.png',
        panels: [
          {
            title: '📍 Docks',
            description: 'Salt and smoke.',
          },
        ],
        controllerAction: 'START_SCENE',
      },
      {},
    );

    expect(payload.files).toHaveLength(1);
    const chronicler = payload.embeds[0];
    expect(chronicler.data.image?.url).toBe('attachment://scene.png');
    expect(payload.embeds.some((e) => e.data.title === '🖼️ Scene')).toBe(false);
  });

  it('shows NPC as speaker when npcSpeaker is set', () => {
    const payload = buildCampaignTurnReply(
      {
        narration: '*She lowers her voice.*\n\n"I saw the sigil too — we are marked."',
        controllerAction: 'NPC_DIALOGUE',
        npcSpeaker: 'Sister Caldra Venn',
        locationName: 'Mistharbor Execution Yard',
      },
      { suppressPlayerEmbed: true },
    );

    expect(payload.embeds[0].data.author?.name).toBe('Sister Caldra Venn');
    expect(payload.embeds[0].data.color).toBe(0x5c4033);
  });
});
