import fs from 'node:fs/promises';
import { getChroniclePath, readChronicle } from './campaign-chronicle.js';
import type { PlotThread } from '../../validation/schemas.js';

function replaceSection(chronicle: string, heading: string, body: string): string {
  const pattern = new RegExp(`(## ${heading}\\n)([\\s\\S]*?)(?=\\n## |$)`);
  if (pattern.test(chronicle)) {
    return chronicle.replace(pattern, `$1${body.trim()}\n\n`);
  }
  return `${chronicle.trim()}\n\n## ${heading}\n${body.trim()}\n`;
}

export async function writePlotThreadsToChronicle(
  campaignId: string,
  threads: PlotThread[],
): Promise<void> {
  const filePath = getChroniclePath(campaignId);
  let chronicle: string;
  try {
    chronicle = await readChronicle(campaignId);
    if (chronicle === '(empty chronicle)' || chronicle === '(no chronicle file yet)') {
      chronicle = `# Campaign Chronicle\n\n## Progression Beats\n[]\n`;
    }
  } catch {
    chronicle = `# Campaign Chronicle\n\n## Progression Beats\n[]\n`;
  }

  const active = threads.filter((t) => t.status !== 'resolved');
  chronicle = replaceSection(chronicle, 'Progression Beats', JSON.stringify(active, null, 2));
  await fs.writeFile(filePath, chronicle.trim() + '\n', 'utf8');
}
