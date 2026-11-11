const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Friendly due-date label. Returns null for no date. */
export function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const due = startOfDay(new Date(`${iso}T00:00:00`));
  const today = startOfDay(new Date());
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  const label = `${due.getDate()} ${MONTHS[due.getMonth()]}`;
  return due.getFullYear() === today.getFullYear()
    ? label
    : `${label} ${due.getFullYear()}`;
}

/** True when a due date is before today (and not done). */
export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const due = startOfDay(new Date(`${iso}T00:00:00`));
  return due.getTime() < startOfDay(new Date()).getTime();
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Header label for a day the user is browsing, e.g. "Mon 10 Nov".
 * Adds the year only when it is not the current one. Always the date, never
 * "Today"/"Yesterday" — the stepper tints and resets to orient instead.
 */
export function formatDayLabel(iso: string): string {
  const d = startOfDay(new Date(`${iso}T00:00:00`));
  const today = startOfDay(new Date());
  const base = `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** YYYY-MM-DD in local time, for the date column type. */
export function toDateString(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
