/**
 * Recurrence rules for tasks. Date-only, no times.
 *
 * The database function public.next_recurrence_date is the source of truth
 * when a task is completed. This module mirrors that arithmetic so the edit
 * screen can show the next date. Keep the two in step:
 * supabase/tests/recurrence.sql and src/lib/recurrence.test.ts cover the
 * same cases.
 *
 * Weekdays are 0 = Sunday … 6 = Saturday (JavaScript getUTCDay / Postgres dow).
 *
 * From an anchor date (the previous due date, or the completion date when
 * there is no due date):
 * - day: anchor plus N days
 * - month: anchor plus N calendar months, clamped to the last day of the
 *   target month. 31 Jan plus one month is 28 Feb (29 in a leap year). The
 *   following occurrence is calculated from that new date, so it stays on
 *   the 28th.
 * - week: anchor plus N weeks when the weekday matches the anchor, or when
 *   no weekday is set. A different weekday lands on the first matching
 *   weekday after the anchor, then adds N-1 further weeks. Weekly on the
 *   same weekday is +7 days. Weekly on a later weekday in the same week is
 *   that weekday, not a full extra week.
 */

export type RepeatUnit = 'day' | 'week' | 'month';

export type RepeatRule = {
  unit: RepeatUnit | null;
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Only used when unit is week. */
  weekday: number | null;
};

export type RepeatChoice = 'never' | 'daily' | 'weekly' | 'monthly' | 'custom';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_CHOICES: { value: number; short: string; name: string }[] = [
  { value: 1, short: 'Mon', name: 'Monday' },
  { value: 2, short: 'Tue', name: 'Tuesday' },
  { value: 3, short: 'Wed', name: 'Wednesday' },
  { value: 4, short: 'Thu', name: 'Thursday' },
  { value: 5, short: 'Fri', name: 'Friday' },
  { value: 6, short: 'Sat', name: 'Saturday' },
  { value: 0, short: 'Sun', name: 'Sunday' },
];

const MAX_INTERVAL = 99;

export function repeatRuleFromTask(task: {
  repeat_unit?: string | null;
  repeat_interval?: number | null;
  repeat_weekday?: number | null;
}): RepeatRule {
  const unit =
    task.repeat_unit === 'day' || task.repeat_unit === 'week' || task.repeat_unit === 'month'
      ? task.repeat_unit
      : null;
  return {
    unit,
    interval: clampInterval(task.repeat_interval),
    weekday: task.repeat_weekday ?? null,
  };
}

export function taskRepeats(task: { repeat_unit?: string | null }): boolean {
  return repeatRuleFromTask(task).unit !== null;
}

export function repeatChoice(rule: RepeatRule): RepeatChoice {
  if (!rule.unit) return 'never';
  if (rule.interval === 1 && rule.unit === 'day') return 'daily';
  if (rule.interval === 1 && rule.unit === 'week') return 'weekly';
  if (rule.interval === 1 && rule.unit === 'month') return 'monthly';
  return 'custom';
}

/** Weekday of a YYYY-MM-DD date, or today's local weekday when there is no date. */
export function defaultWeekday(dueDate: string | null): number {
  const parts = dueDate ? parseDate(dueDate) : null;
  if (!parts) return new Date().getDay();
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
}

export function describeRepeat(rule: RepeatRule): string | null {
  if (!rule.unit) return null;
  const interval = clampInterval(rule.interval);
  if (rule.unit === 'day') {
    return interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`;
  }
  if (rule.unit === 'week') {
    const day =
      rule.weekday != null && rule.weekday >= 0 && rule.weekday <= 6
        ? WEEKDAY_NAMES[rule.weekday]
        : null;
    if (interval === 1) return day ? `Repeats weekly on ${day}` : 'Repeats weekly';
    return day ? `Repeats every ${interval} weeks on ${day}` : `Repeats every ${interval} weeks`;
  }
  return interval === 1 ? 'Repeats monthly' : `Repeats every ${interval} months`;
}

/**
 * One line for the task screen. `nextLabel` is an already-formatted date
 * ("8 Oct", "Tomorrow"). When there is no due date, the server counts from
 * the UTC completion date.
 */
export function repeatScheduleCopy(
  rule: RepeatRule,
  nextLabel: string | null,
  hasDueDate: boolean,
): string | null {
  const phrase = describeRepeat(rule);
  if (!phrase) return null;
  if (!hasDueDate) {
    return `${phrase}. The next date is counted from the day this is completed.`;
  }
  if (!nextLabel) return phrase;
  return `${phrase}. Next is ${nextLabel}.`;
}

/** Next due date, or null when the rule or anchor is not usable. */
export function nextRecurrenceDate(anchor: string, rule: RepeatRule): string | null {
  if (!rule.unit) return null;
  const parts = parseDate(anchor);
  if (!parts) return null;
  const interval = clampInterval(rule.interval);

  if (rule.unit === 'day') return addDays(parts, interval);
  if (rule.unit === 'month') return addMonths(parts, interval);

  const anchorDow = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
  if (rule.weekday == null || rule.weekday === anchorDow) {
    return addDays(parts, interval * 7);
  }
  const weekday = ((rule.weekday % 7) + 7) % 7;
  const delta = (weekday - anchorDow + 7) % 7;
  return addDays(parts, delta + (interval - 1) * 7);
}

function clampInterval(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(MAX_INTERVAL, Math.max(1, Math.trunc(value)));
}

function parseDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(parts: { y: number; m: number; d: number }, days: number): string {
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function addMonths(parts: { y: number; m: number; d: number }, months: number): string {
  const total = parts.m - 1 + months;
  const year = parts.y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(year, month + 1, Math.min(parts.d, lastDay));
}
