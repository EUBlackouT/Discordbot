import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { MemoryExtractorOutput } from '../../validation/schemas.js';

const MAX_TURN_LOG_LINES = 40;
const MAX_FACTS = 35;

export function getChroniclePath(campaignId: string): string {
  return path.join(config.campaign.dataDir, campaignId, 'chronicle.txt');
}

function buildInitialChronicle(campaignName: string, openingSituation: string): string {
  return `# Campaign Chronicle — ${campaignName}
# This file is the canonical story record. The AI reads it every turn.

## Current Situation
${openingSituation}

## NPC Positions
- Old Henrick: at the execution yard, fleeing toward the old quarter
- Sister Caldra Venn: at the execution yard, among the crowd
- Captain Mira Thornvale: at the execution yard, commanding the watch

## Established Facts
- A public execution in Mistharbor went wrong — the prisoner vanished from the scaffold
- Riot and panic spread through the execution yard

## Turn Log
`;
}

export async function ensureChronicle(
  campaignId: string,
  campaignName: string,
  openingSituation?: string,
): Promise<void> {
  const filePath = getChroniclePath(campaignId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  try {
    await fs.access(filePath);
  } catch {
    const situation =
      openingSituation ??
      'The campaign begins at the Mistharbor execution yard during a riot after a prisoner vanished from the scaffold.';
    await fs.writeFile(filePath, buildInitialChronicle(campaignName, situation), 'utf8');
  }
}

export async function readChronicle(campaignId: string): Promise<string> {
  const filePath = getChroniclePath(campaignId);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text.trim() || '(empty chronicle)';
  } catch {
    return '(no chronicle file yet)';
  }
}

export async function deleteChronicle(campaignId: string): Promise<void> {
  const dir = path.join(config.campaign.dataDir, campaignId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.debug('Chronicle delete skipped', { campaignId, err });
  }
}

function extractSection(chronicle: string, heading: string): string {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = chronicle.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function replaceSection(chronicle: string, heading: string, body: string): string {
  const pattern = new RegExp(`(## ${heading}\\n)([\\s\\S]*?)(?=\\n## |$)`);
  if (pattern.test(chronicle)) {
    return chronicle.replace(pattern, `$1${body.trim()}\n\n`);
  }
  return `${chronicle.trim()}\n\n## ${heading}\n${body.trim()}\n`;
}

function mergeNpcStatus(existing: string, updates: Array<{ name: string; status: string }>): string {
  const lines = existing
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'));

  const map = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (m) map.set(m[1].trim().toLowerCase(), `- ${m[1].trim()}: ${m[2].trim()}`);
  }

  for (const { name, status } of updates) {
    map.set(name.trim().toLowerCase(), `- ${name.trim()}: ${status.trim()}`);
  }

  return [...map.values()].join('\n') || '(none tracked)';
}

function mergeFacts(existing: string, newFacts: string[]): string {
  const lines = existing
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, ''));

  const seen = new Set(lines.map((l) => l.toLowerCase()));
  for (const fact of newFacts) {
    const trimmed = fact.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      lines.push(trimmed);
      seen.add(trimmed.toLowerCase());
    }
  }

  const kept = lines.slice(-MAX_FACTS);
  return kept.map((f) => `- ${f}`).join('\n') || '(none yet)';
}

function prependTurnLog(existing: string, line: string): string {
  const lines = existing
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const entry = `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${line.trim()}`;
  return [entry, ...lines].slice(0, MAX_TURN_LOG_LINES).join('\n');
}

/** Merge memory-extractor output into the chronicle .txt file. */
export async function applyChronicleFromMemory(
  campaignId: string,
  memory: MemoryExtractorOutput,
  turnContext?: { playerMessage: string; characterName?: string },
): Promise<void> {
  const filePath = getChroniclePath(campaignId);
  let chronicle: string;
  try {
    chronicle = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  if (memory.chronicle_situation) {
    chronicle = replaceSection(chronicle, 'Current Situation', memory.chronicle_situation);
  }

  if (memory.chronicle_npc_status.length > 0) {
    const existing = extractSection(chronicle, 'NPC Positions');
    const merged = mergeNpcStatus(existing, memory.chronicle_npc_status);
    chronicle = replaceSection(chronicle, 'NPC Positions', merged);
  }

  const factsToAdd = [...memory.new_public_facts];
  if (factsToAdd.length > 0) {
    const existing = extractSection(chronicle, 'Established Facts');
    chronicle = replaceSection(chronicle, 'Established Facts', mergeFacts(existing, factsToAdd));
  }

  const turnLine =
    memory.chronicle_turn_line ??
    (turnContext
      ? `${turnContext.characterName ? `${turnContext.characterName}: ` : ''}"${turnContext.playerMessage.slice(0, 80)}" → ${memory.session_summary_update || 'turn resolved'}`
      : memory.session_summary_update);

  if (turnLine) {
    const existing = extractSection(chronicle, 'Turn Log');
    chronicle = replaceSection(chronicle, 'Turn Log', prependTurnLog(existing, turnLine));
  }

  await fs.writeFile(filePath, chronicle.trim() + '\n', 'utf8');
}
