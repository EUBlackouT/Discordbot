import { describe, it, expect } from 'vitest';
import { wizardShouldDeferFirst, wizardUsesModalFirst, shouldEditWizardViaReply } from '../src/bot/commands/handlers/character-wizard.js';

function mockSelect(id: string, values: string[]) {
  return {
    isStringSelectMenu: () => true,
    isButton: () => false,
    isModalSubmit: () => false,
    customId: id,
    values,
  };
}

function mockButton(id: string) {
  return {
    isStringSelectMenu: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    customId: id,
    values: [] as string[],
  };
}

function mockModal(id: string) {
  return {
    isStringSelectMenu: () => false,
    isButton: () => false,
    isModalSubmit: () => true,
    customId: id,
    values: [] as string[],
  };
}

describe('wizard interaction ack routing', () => {
  it('defers standard ability method before DB work', () => {
    const ix = mockSelect('char_wiz_abilities_method', ['standard']);
    expect(wizardUsesModalFirst(ix as never, ix.customId)).toBe(false);
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(true);
  });

  it('uses modal first for point buy', () => {
    const ix = mockSelect('char_wiz_abilities_method', ['pointbuy']);
    expect(wizardUsesModalFirst(ix as never, ix.customId)).toBe(true);
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(false);
  });

  it('uses modal first for flaw then name', () => {
    const ix = mockSelect('char_wiz_personality_flaw', ['p_flaw_0']);
    expect(wizardUsesModalFirst(ix as never, ix.customId)).toBe(true);
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(false);
  });

  it('defers modal submit for point buy follow-up', () => {
    const ix = mockModal('char_wiz_pointbuy_modal');
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(true);
  });

  it('defers name modal submit for review step', () => {
    const ix = mockModal('char_wiz_name__p_flaw_0');
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(true);
  });

  it('does not defer spell info (uses ephemeral reply)', () => {
    const ix = mockButton('char_wiz_spell_info_cantrips_0');
    expect(wizardShouldDeferFirst(ix as never, ix.customId)).toBe(false);
  });

  it('edits deferred modal submits via editReply (not message.edit)', () => {
    const ix = {
      ...mockModal('char_wiz_name__p_flaw_0'),
      deferred: true,
      replied: false,
      message: { editable: true },
    };
    expect(shouldEditWizardViaReply(ix as never)).toBe(true);
  });
});
