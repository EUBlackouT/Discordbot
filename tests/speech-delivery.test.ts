import { describe, expect, it } from 'vitest';
import { INTRO_NPCS } from '../src/campaign/intro.js';
import { buildSpeechDeliveryContext } from '../src/voice/npc-speech-style.js';
import {
  applyDeliveryDirectives,
  buildDeliveryDirective,
  inferDeliveryIntensity,
  voiceSettingsForDirective,
} from '../src/voice/speech-delivery-directives.js';
import { inferSpeechEmotion, prepareSpeechForTts } from '../src/voice/speech-delivery.js';

describe('speech delivery directives', () => {
  const thornvaleLine =
    'Witchcraft in the front ranks! Clear that section — seize the whole knot of them!';

  it('tags Thornvale riot orders at extreme intensity', () => {
    const ctx = buildSpeechDeliveryContext(INTRO_NPCS[0]!, {
      sceneMood: 'immediate danger, accusation, no time to think',
      controllerAction: 'START_SCENE',
    });
    const emotion = inferSpeechEmotion(thornvaleLine, ctx);
    const directive = buildDeliveryDirective(thornvaleLine, emotion, ctx);
    expect(directive.emotion).toBe('commanding');
    expect(directive.intensity).toBe('extreme');

    const tagged = applyDeliveryDirectives(thornvaleLine, directive);
    expect(tagged).toMatch(/\[angry\]/i);
    expect(tagged).toMatch(/\[shouts\]/i);
    expect(tagged).toMatch(/\[loudly\]/i);
    expect(tagged).toMatch(/\[yelling\]/i);
  });

  it('lowers stability and raises style for extreme commands', () => {
    const directive = {
      emotion: 'commanding' as const,
      intensity: inferDeliveryIntensity(thornvaleLine, 'commanding', {
        isNpc: true,
        sceneMood: 'riot',
        controllerAction: 'START_SCENE',
      }),
    };
    const settings = voiceSettingsForDirective(directive);
    expect(settings.stability).toBeLessThanOrEqual(0.2);
    expect(settings.style).toBeGreaterThanOrEqual(0.8);
  });

  it('prepareSpeechForTts applies directive stack for NPC lines', () => {
    const ctx = buildSpeechDeliveryContext(INTRO_NPCS[0]!, {
      sceneMood: 'immediate danger',
      controllerAction: 'START_SCENE',
    });
    const prepared = prepareSpeechForTts(thornvaleLine, ctx, 1200);
    expect(prepared.text).toMatch(/\[shouts\]/i);
    expect(prepared.voiceSettings.style).toBeGreaterThan(0.7);
  });

  it('applies dramatic narrator delivery without NPC commanding tags', () => {
    const line = 'Then Henrick stops mid-sentence.';
    const prepared = prepareSpeechForTts(
      line,
      { sceneMood: 'immediate danger', controllerAction: 'START_SCENE', isNpc: false },
      1200,
    );
    expect(prepared.text).toMatch(/\[dramatic\]/i);
    expect(prepared.text).not.toMatch(/\[shouts\]|\[yelling\]|\[angry\]/i);
    expect(prepared.emotion).not.toBe('commanding');
  });

  it('uses chronicler tagging — one opening emotion tag, pauses between sentences', () => {
    const line =
      'The condemned stands hooded on the platform. Old Henrick the crier sways on his step below. Then Henrick stops mid-sentence.';
    const prepared = prepareSpeechForTts(
      line,
      { sceneMood: 'immediate danger', controllerAction: 'START_SCENE', isNpc: false },
      1200,
    );
    expect(prepared.text).toMatch(/^\[dramatic\] The condemned/);
    expect(prepared.text).not.toMatch(/\[dramatic\].*\[dramatic\]/);
    expect(prepared.text).toMatch(/\[pause\]/);
    expect(prepared.voiceSettings.stability).toBeGreaterThanOrEqual(0.52);
  });

  it('does not treat crowd screams in narration as angry NPC shouts', () => {
    const line =
      'A beat of silence, then the square detonates: screams, shoving, someone retching against the stones.';
    const prepared = prepareSpeechForTts(
      line,
      { sceneMood: 'immediate danger', controllerAction: 'START_SCENE', isNpc: false },
      1200,
    );
    expect(prepared.emotion).not.toBe('angry');
    expect(prepared.text).not.toMatch(/\[shouts\]|\[yelling\]|\[angry\]/i);
  });

  it('tags fearful lines as scared/nervous', () => {
    const line = 'Please — they are coming! Hide, now!';
    const ctx = { isNpc: true, npcAttitude: 'desperate', sceneMood: 'danger' };
    const directive = buildDeliveryDirective(line, inferSpeechEmotion(line, ctx), ctx);
    const tagged = applyDeliveryDirectives(line, directive);
    expect(tagged).toMatch(/\[(scared|nervously|desperately)\]/i);
  });

  it('tags happy lines with happily/excited', () => {
    const line = 'Thank the gods — we made it! I could laugh for joy!';
    const ctx = { isNpc: true };
    const directive = buildDeliveryDirective(line, inferSpeechEmotion(line, ctx), ctx);
    const tagged = applyDeliveryDirectives(line, directive);
    expect(tagged).toMatch(/\[(happily|excited)\]/i);
  });
});
