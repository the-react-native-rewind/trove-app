import * as chrono from 'chrono-node';

import { toDateString } from './format';

export type InferredDate = {
  /** YYYY-MM-DD */
  date: string;
  /** The phrase in the text that produced the date, e.g. "by friday". */
  matchedText: string;
};

/**
 * Deterministic, offline due-date inference from a task description.
 * Runs live while typing so the date is visible and correctable before saving.
 * forwardDate keeps "friday" meaning the upcoming one.
 */
export function inferDueDate(text: string, now: Date = new Date()): InferredDate | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  const results = chrono.parse(trimmed, now, { forwardDate: true });
  if (!results.length) return null;
  // Use the last date mentioned; people usually end with the deadline
  // ("renew the certificate before the trip on the 12th").
  const hit = results[results.length - 1];
  return { date: toDateString(hit.start.date()), matchedText: hit.text };
}

/** Fallback title when AI enrichment is unavailable: first few words, cleaned. */
export function fallbackTitle(text: string, maxWords = 8): string {
  const words = text.trim().replace(/\s+/g, ' ').split(' ');
  const head = words.slice(0, maxWords).join(' ');
  const title = head.replace(/[.,;:!?]+$/, '');
  return (title.charAt(0).toUpperCase() + title.slice(1)) || 'New task';
}
