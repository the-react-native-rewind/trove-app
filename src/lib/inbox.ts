/**
 * The Inbox is a private, per-user capture surface. A line arrives here (typed
 * by the person, or dropped in by a connected tool) and waits to be triaged.
 *
 * It is deliberately not a place to work from: a line can only be accepted —
 * turned into an action in a circle — or dismissed. It is never ticked or
 * completed here. The one-way street is Inbox → Trove.
 */

export const INBOX_VIEW_ID = 'inbox';

/** A capture line can be as long as a Today line. Titles are trimmed later. */
export const INBOX_TEXT_MAX = 4000;

/** A manual capture from the app carries this source. */
export const INBOX_APP_SOURCE = 'app';

export type InboxItem = {
  id: string;
  text: string;
  /** Where the line came from: 'app', or a connected tool's short name. */
  source: string | null;
  createdAt: string;
};

/** Collapse whitespace and trim, the same shape a line is stored in. */
export function normalizeInboxText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * A short, human label for where a line came from. 'app' (and an empty source)
 * read as a plain manual capture with no tag; anything else is shown as-is,
 * lightly cleaned, so a connected tool can label its own drops.
 */
export function sourceLabel(source: string | null | undefined): string | null {
  const trimmed = source?.trim();
  if (!trimmed || trimmed.toLowerCase() === INBOX_APP_SOURCE) return null;
  return trimmed;
}

/** First line only, capped, for an action title drafted from a capture. */
export function inboxActionTitle(text: string): string {
  const firstLine = text.split('\n')[0] ?? text;
  return normalizeInboxText(firstLine).slice(0, 300);
}

/** Newest first: a freshly captured line sits at the top of the inbox. */
export function insertInboxItem(items: readonly InboxItem[], item: InboxItem): InboxItem[] {
  if (items.some((existing) => existing.id === item.id)) return items as InboxItem[];
  return [item, ...items];
}

export function withoutInboxItem(items: readonly InboxItem[], id: string): InboxItem[] {
  if (!items.some((item) => item.id === id)) return items as InboxItem[];
  return items.filter((item) => item.id !== id);
}

export function replaceInboxItemId(
  items: readonly InboxItem[],
  fromId: string,
  toId: string,
): InboxItem[] {
  if (fromId === toId || !items.some((item) => item.id === fromId)) return items as InboxItem[];
  return items.map((item) => (item.id === fromId ? { ...item, id: toId } : item));
}
