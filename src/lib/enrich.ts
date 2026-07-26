import { toDateString } from './format';
import { supabase } from './supabase';

export type Enriched = {
  title: string;
  description: string;
  due_date: string | null;
};

const TIMEOUT_MS = 6000;

/**
 * Ask the enrich-task edge function to turn a raw capture into a clean task.
 * Returns null on any failure or timeout — the caller falls back to the raw
 * text so capture is never blocked on AI.
 */
export async function enrichCapture(input: {
  rawText: string;
  inferredDueDate: string | null;
}): Promise<Enriched | null> {
  try {
    const invocation = supabase.functions.invoke('enrich-task', {
      body: {
        raw_text: input.rawText,
        today: toDateString(new Date()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        inferred_due_date: input.inferredDueDate,
      },
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const settled = await Promise.race([invocation, timeout]);
    if (!settled || settled.error || !settled.data?.title) return null;
    const data = settled.data as Enriched;
    return {
      title: String(data.title),
      description: String(data.description ?? ''),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(data.due_date ?? '') ? data.due_date : null,
    };
  } catch {
    return null;
  }
}
