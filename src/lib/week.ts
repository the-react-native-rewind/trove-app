import { toDateString } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/** Monday of the supplied date's local week, formatted for a Postgres date. */
export function getWeekStart(date = new Date()): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return toDateString(start);
}

export function getCurrentWeekStart(): string {
  return getWeekStart();
}

export function shiftWeek(weekStart: string, amount: number): string {
  const date = parseDate(weekStart);
  date.setDate(date.getDate() + amount * 7);
  return toDateString(date);
}

export function formatWeekRange(weekStart: string): string {
  const start = parseDate(weekStart);
  const end = parseDate(shiftWeek(weekStart, 1));
  end.setDate(end.getDate() - 1);

  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}–${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()} ${MONTHS[start.getMonth()]}–${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
}
