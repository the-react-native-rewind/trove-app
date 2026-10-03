/**
 * Card preview copy. Markdown markers come off and the words stay, collapsed
 * onto one line so a list card does not grow with the note.
 */
export function plainTextFromMarkdown(source: string): string {
  const withoutFences = source.replace(/```[^\n`]*\n?([\s\S]*?)```/g, (_match, body: string) => `\n${body}\n`);
  return withoutFences
    .split('\n')
    .map(stripMarkdownLine)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripMarkdownLine(line: string): string {
  let text = line.replace(/^\s{0,3}#{1,6}\s+/, '');
  text = text.replace(/^\s{0,3}>\s?/, '');
  text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '');
  text = text.replace(/^\s*[-*+]\s+/, '');
  text = text.replace(/^\s*\d+[.)]\s+/, '');
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, '');
  text = text.replace(/\[([^\]]+)]\([^)]*\)/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');
  text = text.replace(/~~([^~]+)~~/g, '$1');
  return text;
}

/** http(s) links only. Everything else stays in the note. */
export function httpLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
