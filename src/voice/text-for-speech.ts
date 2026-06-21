/** Strip Discord markdown so TTS reads clean prose. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove italic action beats (*leans close*) — not spoken aloud. */
export function stripActionBeats(text: string): string {
  return text
    .replace(/^\*[^*\n]+\*\s*/gm, '')
    .replace(/\s*\*[^*\n]+\*\s*/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncateForSpeech(text: string, maxChars: number): string {
  const clean = stripForSpeech(text);
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSentence = cut.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.5) return cut.slice(0, lastSentence + 1).trim();
  return `${cut.trim()}…`;
}
